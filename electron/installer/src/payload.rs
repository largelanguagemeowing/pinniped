//! The self-extracting format: `[stub exe][LZMA2 blob][trailer]`.
//!
//! The blob is one LZMA2 stream (independent 64 MB chunks, so it packs and unpacks on several
//! threads) of records (see `Kind`). The fixed-size trailer at the very
//! end of the file says where the stub ends and how big the payload is, so the stub finds its
//! own payload by reading the last 32 bytes of itself. A file without the trailer is a bare
//! stub, which is what the uninstaller is.

use std::fs::{self, File};
use lzma_rust2::{Lzma2Options, Lzma2ReaderMt, Lzma2WriterMt};
use std::io::{self, BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};

pub const MAGIC: &[u8; 8] = b"PNPDPAY2";
/// LZMA2 dictionary, also the size of each independently compressed chunk. The decoder needs
/// this much memory per thread.
pub const DICT_SIZE: u32 = 64 << 20;
/// Threads used to unpack; each holds a dictionary and a decoded chunk (~128 MB).
const READ_THREADS: u32 = 4;
pub const TRAILER_LEN: u64 = 32;
const MAX_PATH_LEN: usize = 1024;

#[derive(Clone, Copy)]
#[repr(u8)]
enum Kind {
    File = 0,
    Dir = 1,
    Meta = 3,
    End = 255,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    pub version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stats {
    pub files: u32,
    pub raw_bytes: u64,
    pub packed_bytes: u64,
}

// ---------- writing (packer) ----------

/// Append the contents of `root` to `out`, which already holds the stub.
/// `preset` is the LZMA preset, 0 (fast) to 9 (smallest).
pub fn write_payload(out: &mut File, stub_len: u64, root: &Path, version: &str, preset: u32, workers: u32) -> io::Result<Stats> {
    let start = out.stream_position()?;
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    collect(root, root, &mut files, &mut dirs)?;
    files.sort();
    dirs.sort();

    let mut raw_bytes = 0u64;
    {
        let buffered = BufWriter::with_capacity(1 << 20, &mut *out);
        let mut opts = Lzma2Options::with_preset(preset.min(9));
        opts.lzma_options.dict_size = DICT_SIZE;
        opts.set_chunk_size(NonZeroU64::new(DICT_SIZE as u64));
        let mut enc = Lzma2WriterMt::new(buffered, opts, workers.max(1))?;
        put_meta(&mut enc, version)?;
        for d in &dirs {
            enc.write_all(&[Kind::Dir as u8])?;
            put_path(&mut enc, d)?;
        }
        for f in &files {
            let mut src = File::open(root.join(f))?;
            let size = src.metadata()?.len();
            enc.write_all(&[Kind::File as u8])?;
            put_path(&mut enc, f)?;
            enc.write_all(&size.to_le_bytes())?;
            let copied = io::copy(&mut src, &mut enc)?;
            if copied != size {
                return Err(io::Error::new(io::ErrorKind::InvalidData, format!("{f} changed while packing")));
            }
            raw_bytes += size;
        }
        enc.write_all(&[Kind::End as u8])?;
        enc.finish()?.flush()?;
    }
    let end = out.stream_position()?;
    let blob_len = end - start;

    let mut trailer = Vec::with_capacity(TRAILER_LEN as usize);
    trailer.extend_from_slice(MAGIC);
    trailer.extend_from_slice(&stub_len.to_le_bytes());
    trailer.extend_from_slice(&blob_len.to_le_bytes());
    trailer.extend_from_slice(&(files.len() as u32).to_le_bytes());
    trailer.extend_from_slice(&[0u8; 4]);
    debug_assert_eq!(trailer.len() as u64, TRAILER_LEN);
    out.write_all(&trailer)?;
    Ok(Stats { files: files.len() as u32, raw_bytes, packed_bytes: blob_len })
}

fn collect(root: &Path, dir: &Path, files: &mut Vec<String>, dirs: &mut Vec<String>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .unwrap()
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        let ty = entry.file_type()?;
        if ty.is_dir() {
            dirs.push(rel);
            collect(root, &path, files, dirs)?;
        } else if ty.is_file() {
            files.push(rel);
        } else {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, format!("{rel}: only files and directories can be packed")));
        }
    }
    Ok(())
}

fn put_meta<W: Write>(w: &mut W, version: &str) -> io::Result<()> {
    w.write_all(&[Kind::Meta as u8])?;
    put_path(w, version)
}

fn put_path<W: Write>(w: &mut W, s: &str) -> io::Result<()> {
    let b = s.as_bytes();
    if b.len() > MAX_PATH_LEN {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "path too long"));
    }
    w.write_all(&(b.len() as u16).to_le_bytes())?;
    w.write_all(b)
}

// ---------- reading (stub) ----------

pub struct Payload {
    file: File,
    offset: u64,
    blob_len: u64,
    pub file_count: u32,
    pub stub_len: u64,
}

impl Payload {
    /// The payload at the end of `path`, or `None` for a bare stub.
    pub fn open(path: &Path) -> io::Result<Option<Payload>> {
        let mut file = File::open(path)?;
        let len = file.metadata()?.len();
        if len < TRAILER_LEN {
            return Ok(None);
        }
        file.seek(SeekFrom::Start(len - TRAILER_LEN))?;
        let mut t = [0u8; TRAILER_LEN as usize];
        file.read_exact(&mut t)?;
        if &t[..8] != MAGIC {
            return Ok(None);
        }
        let stub_len = u64::from_le_bytes(t[8..16].try_into().unwrap());
        let blob_len = u64::from_le_bytes(t[16..24].try_into().unwrap());
        let file_count = u32::from_le_bytes(t[24..28].try_into().unwrap());
        if stub_len.checked_add(blob_len).and_then(|n| n.checked_add(TRAILER_LEN)) != Some(len) {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "installer is truncated or damaged"));
        }
        Ok(Some(Payload { file, offset: stub_len, blob_len, file_count, stub_len }))
    }

    /// The stub without its payload: what gets installed as the uninstaller.
    pub fn stub_bytes(&mut self) -> io::Result<Vec<u8>> {
        self.file.seek(SeekFrom::Start(0))?;
        let mut buf = vec![0u8; self.stub_len as usize];
        self.file.read_exact(&mut buf)?;
        Ok(buf)
    }

    /// Unpack into `dest` (created if needed). `progress` gets the files done and the total.
    pub fn extract(&mut self, dest: &Path, mut progress: impl FnMut(u32, u32)) -> io::Result<Meta> {
        self.file.seek(SeekFrom::Start(self.offset))?;
        let limited = BufReader::with_capacity(1 << 20, (&mut self.file).take(self.blob_len));
        let mut r = Lzma2ReaderMt::new(limited, DICT_SIZE, None, READ_THREADS);
        fs::create_dir_all(dest)?;
        let mut meta = None;
        let mut done = 0u32;
        loop {
            let mut kind = [0u8; 1];
            r.read_exact(&mut kind)?;
            match kind[0] {
                k if k == Kind::Meta as u8 => meta = Some(Meta { version: get_path(&mut r)? }),
                k if k == Kind::Dir as u8 => {
                    fs::create_dir_all(safe_join(dest, &get_path(&mut r)?)?)?;
                }
                k if k == Kind::File as u8 => {
                    let rel = get_path(&mut r)?;
                    let mut size = [0u8; 8];
                    r.read_exact(&mut size)?;
                    let size = u64::from_le_bytes(size);
                    let target = safe_join(dest, &rel)?;
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    let mut out = File::create(&target)?;
                    let copied = io::copy(&mut (&mut r).take(size), &mut out)?;
                    if copied != size {
                        return Err(io::Error::new(io::ErrorKind::UnexpectedEof, format!("{rel} is truncated")));
                    }
                    done += 1;
                    progress(done, self.file_count);
                }
                k if k == Kind::End as u8 => break,
                other => return Err(io::Error::new(io::ErrorKind::InvalidData, format!("unknown record {other}"))),
            }
        }
        meta.ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "payload has no version"))
    }
}

fn get_path<R: Read>(r: &mut R) -> io::Result<String> {
    let mut len = [0u8; 2];
    r.read_exact(&mut len)?;
    let len = u16::from_le_bytes(len) as usize;
    if len > MAX_PATH_LEN {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "path too long"));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    String::from_utf8(buf).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "path is not UTF-8"))
}

/// `dest` joined with a `/`-separated archive path, refusing anything that could land
/// outside it (parent dirs, drive letters, alternate streams, absolute paths, names Windows
/// would silently rewrite such as a trailing dot or space).
pub fn safe_join(dest: &Path, rel: &str) -> io::Result<PathBuf> {
    let bad = || io::Error::new(io::ErrorKind::InvalidData, format!("unsafe path in installer: {rel:?}"));
    if rel.is_empty() || rel.contains(['\\', ':', '\0']) {
        return Err(bad());
    }
    let mut out = dest.to_path_buf();
    for seg in rel.split('/') {
        if seg.is_empty() || seg == "." || seg == ".." || seg.ends_with('.') || seg.ends_with(' ') {
            return Err(bad());
        }
        out.push(seg);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pinniped-installer-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn round_trip() {
        let tmp = scratch("rt");
        let src = tmp.join("src");
        fs::create_dir_all(src.join("resources/locales")).unwrap();
        fs::write(src.join("app.exe"), b"MZ-fake-exe").unwrap();
        fs::write(src.join("resources/app.asar"), vec![7u8; 100_000]).unwrap();
        fs::write(src.join("resources/locales/en.pak"), b"").unwrap();

        let bundle = tmp.join("setup.exe");
        let stub = b"stub-bytes".to_vec();
        let mut f = File::create(&bundle).unwrap();
        f.write_all(&stub).unwrap();
        let stats = write_payload(&mut f, stub.len() as u64, &src, "1.2.3", 3, 2).unwrap();
        assert_eq!(stats.files, 3);
        drop(f);

        let mut p = Payload::open(&bundle).unwrap().expect("has payload");
        assert_eq!(p.stub_bytes().unwrap(), stub);
        let dest = tmp.join("dest");
        let mut last = (0, 0);
        let meta = p.extract(&dest, |d, t| last = (d, t)).unwrap();
        assert_eq!(meta.version, "1.2.3");
        assert_eq!(last, (3, 3));
        assert_eq!(fs::read(dest.join("app.exe")).unwrap(), b"MZ-fake-exe");
        assert_eq!(fs::read(dest.join("resources/app.asar")).unwrap().len(), 100_000);
        assert!(dest.join("resources/locales/en.pak").exists());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn crosses_chunk_boundaries() {
        // More than one 64 MB chunk, so the parallel reader has to stitch them back in order.
        let tmp = scratch("chunks");
        let src = tmp.join("src");
        fs::create_dir_all(&src).unwrap();
        let big: Vec<u8> = (0..150_000_000u64).map(|i| ((i / 7) % 251) as u8).collect();
        fs::write(src.join("big.bin"), &big).unwrap();
        fs::write(src.join("small.txt"), b"after the big one").unwrap();
        let bundle = tmp.join("setup.exe");
        let mut f = File::create(&bundle).unwrap();
        f.write_all(b"stub").unwrap();
        write_payload(&mut f, 4, &src, "9", 0, 2).unwrap();
        drop(f);
        let dest = tmp.join("dest");
        Payload::open(&bundle).unwrap().unwrap().extract(&dest, |_, _| {}).unwrap();
        assert!(fs::read(dest.join("big.bin")).unwrap() == big);
        assert_eq!(fs::read(dest.join("small.txt")).unwrap(), b"after the big one");
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn bare_stub_has_no_payload() {
        let tmp = scratch("bare");
        let f = tmp.join("stub.exe");
        fs::write(&f, vec![0u8; 4096]).unwrap();
        assert!(Payload::open(&f).unwrap().is_none());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn truncated_payload_is_an_error() {
        let tmp = scratch("trunc");
        let src = tmp.join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a"), b"hello").unwrap();
        let bundle = tmp.join("setup.exe");
        let mut f = File::create(&bundle).unwrap();
        f.write_all(b"stub").unwrap();
        write_payload(&mut f, 4, &src, "1", 3, 2).unwrap();
        drop(f);
        // Chop bytes out of the middle but keep the trailer: sizes no longer add up.
        let mut all = fs::read(&bundle).unwrap();
        all.drain(5..9);
        fs::write(&bundle, all).unwrap();
        assert!(Payload::open(&bundle).is_err());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn rejects_path_escapes() {
        let d = Path::new("C:/dest");
        for bad in ["../x", "a/../../x", "/abs", "C:/x", "a\\b", "a/./b", "", "a//b", "x:stream", "trail."] {
            assert!(safe_join(d, bad).is_err(), "{bad:?} should be refused");
        }
        assert_eq!(safe_join(d, "a/b.txt").unwrap(), Path::new("C:/dest").join("a").join("b.txt"));
    }
}
