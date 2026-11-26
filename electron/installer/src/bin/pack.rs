//! `pinniped-pack --stub <pinniped-setup.exe> --dir <win-unpacked> --version <v> --out <file> [--preset 0-9] [--workers N]`
//!
//! Appends the unpacked app to the installer stub and writes the self-extracting installer.

use installer::payload::write_payload;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("pinniped-pack: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let mut stub = None;
    let mut dir = None;
    let mut version = None;
    let mut out = None;
    let mut preset = 9u32;
    // Each worker needs ~700 MB at preset 9; stay modest so a CI runner is not squeezed.
    let mut workers = std::thread::available_parallelism().map(|n| n.get() as u32).unwrap_or(2).clamp(1, 3);
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        let mut value = |name: &str| args.next().ok_or_else(|| format!("{name} needs a value"));
        match a.as_str() {
            "--stub" => stub = Some(PathBuf::from(value("--stub")?)),
            "--dir" => dir = Some(PathBuf::from(value("--dir")?)),
            "--version" => version = Some(value("--version")?),
            "--out" => out = Some(PathBuf::from(value("--out")?)),
            "--preset" => preset = value("--preset")?.parse().map_err(|_| "--preset must be 0-9")?,
            "--workers" => workers = value("--workers")?.parse().map_err(|_| "--workers must be a number")?,
            other => return Err(format!("unknown argument {other}")),
        }
    }
    let stub = stub.ok_or("--stub is required")?;
    let dir = dir.ok_or("--dir is required")?;
    let version = version.ok_or("--version is required")?;
    let out = out.ok_or("--out is required")?;
    if preset > 9 {
        return Err("--preset must be 0-9".into());
    }
    if !dir.join(installer::config::EXE_NAME).is_file() {
        return Err(format!("{} has no {}; is it a win-unpacked folder?", dir.display(), installer::config::EXE_NAME));
    }

    let stub_bytes = fs::read(&stub).map_err(|e| format!("{}: {e}", stub.display()))?;
    if installer::payload::Payload::open(&stub).map_err(|e| e.to_string())?.is_some() {
        return Err("the stub already carries a payload".into());
    }
    let mut f = File::create(&out).map_err(|e| format!("{}: {e}", out.display()))?;
    f.write_all(&stub_bytes).map_err(|e| e.to_string())?;
    let stats = write_payload(&mut f, stub_bytes.len() as u64, &dir, &version, preset, workers).map_err(|e| e.to_string())?;
    println!(
        "packed {} files, {:.1} MB -> {:.1} MB ({})",
        stats.files,
        stats.raw_bytes as f64 / 1e6,
        stats.packed_bytes as f64 / 1e6,
        out.display()
    );
    Ok(())
}
