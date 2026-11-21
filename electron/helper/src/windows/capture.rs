//! What a screen share carries on Windows: the audio of every application that plays on the
//! chosen output device, except Pinniped itself (call voices, soundboard, notifications), so
//! nothing echoes back into the share.
//!
//! WASAPI's process loopback captures the audio one process tree renders. So a manager thread
//! lists the audio sessions of the output device (IAudioSessionManager2), drops Pinniped's own
//! process tree, starts one include-mode capture per remaining process tree, and mixes them into
//! 48 kHz stereo that goes to Pinniped as PCM. Sessions that appear or end are picked up by
//! rescanning a few times a second.
//!
//! Limits: process loopback is per process, not per device, so an application (tree) that is
//! playing on another active output device as well would bring that device in (a virtual cable)
//! and double its audio. Such a tree is left out and logged. An application that only reads from
//! a cable is a capture stream, not a render session, so it is unaffected. Windows' own system sounds (notification dings, error
//! beeps) are not captured: they play in a session with process ID 0, and measured on Windows 11
//! process loopback in include mode captures nothing of them from the calling process, from
//! the Audiosrv host or from audiodg (and rejects PID 0). Only whole-device loopback or exclude
//! mode would hear them, and neither can leave Pinniped out per device. A process that starts
//! playing is heard after at most one rescan interval.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use super::{debug, debug_once};
use crate::backlog::Backlog;
use base64::Engine;
use wasapi::{
    initialize_mta, AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
};
use windows::core::Interface;
use windows::Win32::Foundation::{CloseHandle, S_OK};
use windows::Win32::Media::Audio::{
    AudioSessionStateActive, AudioSessionStateExpired, IAudioSessionControl2, IAudioSessionManager2,
};
use windows::Win32::System::Com::CLSCTX_ALL;
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

const RATE: usize = 48_000;
/// How often the mix goes out.
const TICK: Duration = Duration::from_millis(20);
/// How often the output device's sessions are listed again.
const RESCAN: Duration = Duration::from_millis(200);
/// The most one chunk may carry, in frames (200 ms), after a stall.
const MAX_CHUNK_FRAMES: usize = RATE / 5;
/// How long after a failed capture the same process is tried again.
const RETRY: Duration = Duration::from_secs(2);
/// The most one source may hold, in samples (two channels, one second), if the mixer stalls.
const MAX_BUFFERED: usize = RATE * 2;
/// How far behind the mix a source may fall before its oldest audio is dropped.
const BACKLOG: Backlog = Backlog::at(RATE);

/// One running capture of a process tree.
struct Source {
    /// Interleaved stereo samples waiting to be mixed.
    samples: Mutex<Vec<f32>>,
    stop: AtomicBool,
    finished: AtomicBool,
}

struct Running {
    source: Arc<Source>,
    thread: JoinHandle<()>,
}

#[derive(Default)]
pub struct Capture {
    stop: Option<Arc<AtomicBool>>,
    manager: Option<JoinHandle<()>>,
    /// What the running manager was started for, so an unchanged request is not a restart.
    key: Option<(String, u32, Vec<String>)>,
}

impl Capture {
    pub fn start(&mut self, output: String, pid: u32, exclude: Vec<String>) -> Result<(), String> {
        let key = (output.clone(), pid, exclude.clone());
        debug(|| {
            format!("link: output {output:?}, Pinniped is process {pid}, never sharing {exclude:?}")
        });
        if self.manager.is_some() && self.key.as_ref() == Some(&key) {
            return Ok(());
        }
        self.stop();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let manager = thread::Builder::new()
            .name("screenshare-audio".into())
            .spawn(move || manage(output, pid, exclude, flag, ready_tx))
            .map_err(|e| e.to_string())?;
        // The manager reports whether it found the device before this answers.
        match ready_rx.recv() {
            Ok(Ok(())) => {
                self.stop = Some(stop);
                self.manager = Some(manager);
                self.key = Some(key);
                Ok(())
            }
            Ok(Err(err)) => {
                let _ = manager.join();
                Err(err)
            }
            Err(_) => Err("the capture thread ended".into()),
        }
    }

    pub fn stop(&mut self) {
        if let Some(stop) = self.stop.take() {
            stop.store(true, Ordering::Relaxed);
        }
        if let Some(manager) = self.manager.take() {
            let _ = manager.join();
        }
        self.key = None;
    }
}

/// Whether per-process loopback works on this Windows (10 2004 and later), by trying it on
/// Pinniped itself.
pub fn check() -> Result<(), String> {
    let _ = initialize_mta();
    AudioClient::new_application_loopback_client(std::process::id(), true)
        .map(|_| ())
        .map_err(|e| format!("per-application audio capture is not available: {e}"))
}

fn manage(
    output: String,
    own_pid: u32,
    exclude: Vec<String>,
    stop: Arc<AtomicBool>,
    ready: std::sync::mpsc::Sender<Result<(), String>>,
) {
    let _ = initialize_mta();
    let target_id = match open_session_manager(&output) {
        Ok((_, id)) => id,
        Err(err) => {
            let _ = ready.send(Err(err));
            return;
        }
    };
    let _ = ready.send(Ok(()));

    // Listing the sessions takes tens of milliseconds, so it runs on a thread of its own and
    // hands over what to capture. Doing it in the mixing loop stalled the audio for longer than
    // the player buffers, once per rescan, and it came out choppy.
    let (scan_tx, scan_rx) = std::sync::mpsc::channel::<HashSet<u32>>();
    let scan_stop = stop.clone();
    let scanner = thread::Builder::new()
        .name("screenshare-scan".into())
        .spawn(move || {
            let _ = initialize_mta();
            let Ok((manager, _)) = open_session_manager(&output) else {
                return;
            };
            let mut last: Option<HashSet<u32>> = None;
            while !scan_stop.load(Ordering::Relaxed) {
                let others = other_render_managers(&target_id);
                let wanted = audible_roots(&manager, &others, own_pid, &exclude);
                if last.as_ref() != Some(&wanted) {
                    debug(|| {
                        let (_, names) = process_table();
                        let mut list: Vec<String> = wanted
                            .iter()
                            .map(|pid| format!("{pid} ({})", name_of(&names, *pid)))
                            .collect();
                        list.sort();
                        let list = if list.is_empty() {
                            "nothing".to_string()
                        } else {
                            list.join(", ")
                        };
                        format!("scan: sharing {list}")
                    });
                    last = Some(wanted.clone());
                }
                if scan_tx.send(wanted).is_err() {
                    break;
                }
                thread::sleep(RESCAN);
            }
        })
        .ok();

    let mut running: HashMap<u32, Running> = HashMap::new();
    let mut failed: HashMap<u32, Instant> = HashMap::new();
    // Captures told to stop, joined once they have finished so the mixer never waits on them.
    let mut stopping: Vec<Running> = Vec::new();
    let b64 = base64::engine::general_purpose::STANDARD;
    // For the debug log: what went out over the last couple of seconds.
    let mut stats = MixStats::new();
    // The mixer's own clock: how many frames have gone out since it started.
    let clock = Instant::now();
    let mut emitted: u64 = 0;

    while !stop.load(Ordering::Relaxed) {
        // Apply the newest list of what to capture, if the scanner has sent one.
        if let Some(wanted) = scan_rx.try_iter().last() {
            // A capture that ended (its process closed) is forgotten, then retried later if the
            // device still lists it.
            running.retain(|pid, r| {
                if r.source.finished.load(Ordering::Relaxed) {
                    failed.insert(*pid, Instant::now());
                    false
                } else {
                    true
                }
            });
            let gone: Vec<u32> = running
                .keys()
                .filter(|p| !wanted.contains(p))
                .copied()
                .collect();
            for pid in gone {
                if let Some(r) = running.remove(&pid) {
                    r.source.stop.store(true, Ordering::Relaxed);
                    stopping.push(r);
                }
            }
            failed.retain(|_, at| at.elapsed() < RETRY);
            for pid in wanted {
                if running.contains_key(&pid) || failed.contains_key(&pid) {
                    continue;
                }
                eprintln!("sharing the audio of process {pid}");
                debug(|| format!("capture of process {pid} starts"));
                let source = Arc::new(Source {
                    samples: Mutex::new(Vec::new()),
                    stop: AtomicBool::new(false),
                    finished: AtomicBool::new(false),
                });
                let s = source.clone();
                let spawned =
                    thread::Builder::new()
                        .name(format!("capture-{pid}"))
                        .spawn(move || {
                            if let Err(err) = capture_loop(pid, &s) {
                                eprintln!("capture of process {pid} ended: {err}");
                            } else {
                                debug(|| format!("capture of process {pid} stopped"));
                            }
                            s.finished.store(true, Ordering::Relaxed);
                        });
                match spawned {
                    Ok(thread) => {
                        running.insert(pid, Running { source, thread });
                    }
                    Err(_) => {
                        failed.insert(pid, Instant::now());
                    }
                }
            }
        }

        let mut i = 0;
        while i < stopping.len() {
            if stopping[i].thread.is_finished() {
                let _ = stopping.swap_remove(i).thread.join();
            } else {
                i += 1;
            }
        }

        thread::sleep(TICK);

        // Send exactly the time that has passed. The chunk used to be as long as the longest
        // source had gathered, so when sources delivered unevenly more audio went out than real
        // time, the player had to drop the surplus, and it crackled. Each source gives up at most
        // that much, in order, so its own audio stays continuous.
        let due = (clock.elapsed().as_secs_f64() * RATE as f64) as u64;
        let mut frames = due.saturating_sub(emitted) as usize;
        if frames > MAX_CHUNK_FRAMES {
            // A stall (the machine was busy): skip ahead instead of sending a burst.
            frames = MAX_CHUNK_FRAMES;
            emitted = due;
        } else {
            emitted = due;
        }
        let mut mix: Vec<f32> = vec![0.0; frames * 2];
        for (pid, r) in &running {
            let mut samples = r.source.samples.lock().unwrap();
            let take = samples.len().min(mix.len());
            for (m, s) in mix.iter_mut().zip(samples.drain(..take)) {
                *m += s;
            }
            // What is left goes out late, and nothing else brings it down (see backlog.rs).
            let held = samples.len() / 2;
            let dropped = BACKLOG.trim(&mut samples, 2);
            drop(samples);
            if dropped > 0 {
                stats.trimmed(dropped);
                debug(|| {
                    format!(
                        "process {pid} was {} ms behind after the mix; dropped its oldest {} ms",
                        held * 1000 / RATE,
                        dropped * 1000 / RATE
                    )
                });
            }
        }
        // Nothing to send while everything is silent: the far end plays silence on a gap.
        if mix.iter().all(|s| *s == 0.0) {
            stats.silent();
            stats.report(running.len());
            continue;
        }
        stats.sent(mix.len() / 2);
        stats.report(running.len());
        let mut bytes = Vec::with_capacity(mix.len() * 2);
        for s in mix {
            let v = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
            bytes.extend_from_slice(&v.to_le_bytes());
        }
        super::emit_audio(&b64.encode(&bytes));
    }

    drop(scan_rx);
    for r in running.values() {
        r.source.stop.store(true, Ordering::Relaxed);
    }
    for (_, r) in running {
        let _ = r.thread.join();
    }
    for r in stopping {
        let _ = r.thread.join();
    }
    if let Some(scanner) = scanner {
        let _ = scanner.join();
    }
}

/// The audio session manager of the render device whose name is `output`, or the default one.
fn open_session_manager(output: &str) -> Result<(IAudioSessionManager2, String), String> {
    let enumerator = DeviceEnumerator::new().map_err(|e| e.to_string())?;
    let mut device = None;
    if !output.is_empty() {
        let devices = enumerator
            .get_device_collection(Direction::Render)
            .map_err(|e| e.to_string())?;
        let count = devices.get_nbr_devices().unwrap_or(0);
        let mut found = Vec::new();
        for i in 0..count {
            if let Ok(d) = devices.get_device_at_index(i) {
                if let Ok(name) = d.get_friendlyname() {
                    found.push((name, d));
                }
            }
        }
        // Chromium labels a device with its friendly name, sometimes with a prefix like "Default - ".
        let wanted = output.to_lowercase();
        let pos = found
            .iter()
            .position(|(n, _)| n.to_lowercase() == wanted)
            .or_else(|| {
                found.iter().position(|(n, _)| {
                    let n = n.to_lowercase();
                    wanted.contains(&n) || n.contains(&wanted)
                })
            });
        if let Some(pos) = pos {
            device = Some(found.swap_remove(pos).1);
        } else {
            eprintln!("output device \"{output}\" not found, using the default");
        }
    }
    let device = match device {
        Some(d) => d,
        None => enumerator
            .get_default_device(Direction::Render)
            .map_err(|e| e.to_string())?,
    };
    let id = device.get_id().map_err(|e| e.to_string())?;
    let manager = unsafe {
        device
            .as_immdevice()
            .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
            .map_err(|e| e.to_string())?
    };
    Ok((manager, id))
}

/// The session managers of every other active render device. Capture and input devices are not
/// listed here: an application that only reads from a virtual cable is not rendering to it.
fn other_render_managers(target_id: &str) -> Vec<IAudioSessionManager2> {
    let Ok(enumerator) = DeviceEnumerator::new() else {
        return Vec::new();
    };
    let Ok(devices) = enumerator.get_device_collection(Direction::Render) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for i in 0..devices.get_nbr_devices().unwrap_or(0) {
        let Ok(device) = devices.get_device_at_index(i) else {
            continue;
        };
        if device.get_id().map_or(true, |id| id == target_id) {
            continue;
        }
        if let Ok(m) = unsafe {
            device
                .as_immdevice()
                .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
        } {
            out.push(m);
        }
    }
    out
}

/// The process IDs with a session on this device: those playing now when `active_only`, else
/// any session that has not expired. System sounds (no process) are left out.
fn session_pids(manager: &IAudioSessionManager2, active_only: bool) -> Vec<u32> {
    let mut pids = Vec::new();
    unsafe {
        let Ok(sessions) = manager.GetSessionEnumerator() else {
            return pids;
        };
        for i in 0..sessions.GetCount().unwrap_or(0) {
            let Ok(control) = sessions.GetSession(i) else {
                continue;
            };
            let live = control.GetState().map_or(false, |s| {
                if active_only {
                    s == AudioSessionStateActive
                } else {
                    s != AudioSessionStateExpired
                }
            });
            if !live {
                continue;
            }
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else {
                continue;
            };
            if control2.IsSystemSoundsSession() == S_OK {
                continue;
            }
            if let Ok(pid) = control2.GetProcessId() {
                if pid != 0 {
                    pids.push(pid);
                }
            }
        }
    }
    pids
}

/// The processes to capture: the roots of the process trees that have an audio session on the
/// device, without Pinniped's tree and without any process Pinniped runs under (capturing a tree
/// that contains Pinniped would bring the call back in).
fn audible_roots(
    manager: &IAudioSessionManager2,
    others: &[IAudioSessionManager2],
    own_pid: u32,
    exclude: &[String],
) -> HashSet<u32> {
    let (parents, names) = process_table();
    let excluded: HashSet<u32> = names
        .iter()
        .filter(|(_, name)| is_excluded(name, exclude))
        .map(|(pid, _)| *pid)
        .collect();
    let ancestors_of_own = ancestors(&parents, own_pid);
    let mut candidates = HashSet::new();
    for pid in session_pids(manager, false) {
        if pid == own_pid {
            debug_once(|| format!("skipped {} ({pid}): this is Pinniped", name_of(&names, pid)));
            continue;
        }
        // Pinniped's own tree (the audio service is a child), and Pinniped's ancestors.
        if ancestors(&parents, pid).contains(&own_pid) || ancestors_of_own.contains(&pid) {
            debug_once(|| {
                format!(
                    "skipped {} ({pid}): part of Pinniped's own process tree, or what started it",
                    name_of(&names, pid)
                )
            });
            continue;
        }
        // A program on the exclusion list, or anything it started, is never shared.
        if excluded.contains(&pid)
            || ancestors(&parents, pid)
                .iter()
                .any(|a| excluded.contains(a))
        {
            debug_once(|| {
                format!(
                    "skipped {} ({pid}): on the exclusion list",
                    name_of(&names, pid)
                )
            });
            continue;
        }
        candidates.insert(pid);
    }
    // Process loopback cannot tell devices apart, so a tree that is playing on another output
    // device as well would bring that device's audio in (a virtual cable) and double the rest.
    // Such a tree is left out. An application that only reads a cable has no render session
    // there and is not affected.
    let elsewhere: HashSet<u32> = others.iter().flat_map(|m| session_pids(m, true)).collect();
    // One capture per tree: a candidate under another candidate is already included.
    let roots: Vec<u32> = candidates
        .iter()
        .copied()
        .filter(|pid| {
            !ancestors(&parents, *pid)
                .iter()
                .any(|a| candidates.contains(a))
        })
        .collect();
    let excluded_playing: Vec<u32> = session_pids(manager, false)
        .into_iter()
        .filter(|pid| excluded.contains(pid))
        .collect();
    roots
        .into_iter()
        // Capturing a tree brings in everything in it, so a tree with an excluded program
        // playing inside it cannot be shared.
        .filter(|root| {
            !excluded_playing
                .iter()
                .any(|e| e == root || ancestors(&parents, *e).contains(root))
        })
        .filter(|root| {
            let split = elsewhere
                .iter()
                .any(|e| e == root || ancestors(&parents, *e).contains(root));
            if split {
                warn_split(*root);
                debug_once(|| {
                    format!(
                        "skipped {} ({root}): also plays on another output device",
                        name_of(&names, *root)
                    )
                });
            }
            !split
        })
        .collect()
}

fn name_of(names: &HashMap<u32, String>, pid: u32) -> &str {
    names.get(&pid).map_or("?", |n| n.as_str())
}

/// Logs once per process that it plays on two devices and is left out of the share.
fn warn_split(pid: u32) {
    static SEEN: Mutex<Vec<u32>> = Mutex::new(Vec::new());
    let mut seen = SEEN.lock().unwrap();
    if !seen.contains(&pid) {
        seen.push(pid);
        eprintln!("process {pid} plays on another output device too, so it is not shared");
    }
}

/// Process ID to parent process ID, and to executable file name, from one snapshot of the
/// running processes.
fn process_table() -> (HashMap<u32, u32>, HashMap<u32, String>) {
    let mut parents = HashMap::new();
    let mut names = HashMap::new();
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return (parents, names);
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                parents.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                names.insert(
                    entry.th32ProcessID,
                    String::from_utf16_lossy(&entry.szExeFile[..len]),
                );
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    (parents, names)
}

/// Whether the program `name` (an executable file name) is on the exclusion list. File names
/// compare without case, and an entry may leave out `.exe`.
fn is_excluded(name: &str, exclude: &[String]) -> bool {
    let name = name.to_lowercase();
    let bare = name.strip_suffix(".exe").unwrap_or(&name);
    exclude.iter().any(|entry| {
        let entry = entry.trim().to_lowercase();
        let entry = entry.strip_suffix(".exe").unwrap_or(&entry);
        !entry.is_empty() && entry == bare
    })
}

/// The chain of parents above `pid`. Process IDs are reused, so the walk is bounded.
fn ancestors(parents: &HashMap<u32, u32>, pid: u32) -> HashSet<u32> {
    let mut out = HashSet::new();
    let mut at = pid;
    while let Some(&parent) = parents.get(&at) {
        if parent == 0 || parent == pid || !out.insert(parent) || out.len() > 64 {
            break;
        }
        at = parent;
    }
    out
}

/// What the mixer sent, logged every couple of seconds when debugging: whether the audio goes
/// out steadily (chunks, gaps between them) is what choppiness comes down to.
struct MixStats {
    since: Instant,
    last_sent: Option<Instant>,
    chunks: u32,
    silent: u32,
    frames: usize,
    longest_gap: Duration,
    /// Sources trimmed for falling behind, and how many frames that dropped.
    trims: u32,
    trimmed: usize,
}

impl MixStats {
    fn new() -> Self {
        Self {
            since: Instant::now(),
            last_sent: None,
            chunks: 0,
            silent: 0,
            frames: 0,
            longest_gap: Duration::ZERO,
            trims: 0,
            trimmed: 0,
        }
    }

    fn silent(&mut self) {
        self.silent += 1;
    }

    fn trimmed(&mut self, frames: usize) {
        self.trims += 1;
        self.trimmed += frames;
    }

    fn sent(&mut self, frames: usize) {
        let now = Instant::now();
        if let Some(last) = self.last_sent {
            self.longest_gap = self.longest_gap.max(now - last);
        }
        self.last_sent = Some(now);
        self.chunks += 1;
        self.frames += frames;
    }

    fn report(&mut self, sources: usize) {
        if !super::debug_enabled() || self.since.elapsed() < Duration::from_secs(2) {
            return;
        }
        let secs = self.since.elapsed().as_secs_f64();
        debug(|| {
            format!(
                "mix: {sources} source(s), {} chunks ({:.1} s of audio in {secs:.1} s), {} silent ticks, longest gap {} ms, {} backlog trims ({} ms dropped)",
                self.chunks,
                self.frames as f64 / RATE as f64,
                self.silent,
                self.longest_gap.as_millis(),
                self.trims,
                self.trimmed * 1000 / RATE
            )
        });
        *self = Self::new();
    }
}

/// Captures the audio of `pid` and its children as 48 kHz stereo float until stopped.
fn capture_loop(pid: u32, source: &Source) -> Result<(), String> {
    let _ = initialize_mta();
    let format = WaveFormat::new(32, 32, SampleType::Float, RATE, 2, None);
    let mut client =
        AudioClient::new_application_loopback_client(pid, true).map_err(|e| e.to_string())?;
    client
        .initialize_client(
            &format,
            Direction::Capture,
            StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: 0,
            },
            None,
        )
        .map_err(|e| e.to_string())?;
    let event = client.set_get_eventhandle().map_err(|e| e.to_string())?;
    let capture = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
    client.start_stream().map_err(|e| e.to_string())?;

    let mut queue: VecDeque<u8> = VecDeque::new();
    let result = loop {
        if source.stop.load(Ordering::Relaxed) {
            break Ok(());
        }
        // Idle processes may deliver nothing for a while: a timeout is not a failure.
        let _ = event.wait_for_event(200);
        let read = loop {
            match capture.get_next_packet_size() {
                Ok(Some(n)) if n > 0 => {
                    if let Err(e) = capture.read_from_device_to_deque(&mut queue) {
                        break Err(e.to_string());
                    }
                }
                Ok(_) => break Ok(()),
                Err(e) => break Err(e.to_string()),
            }
        };
        if !queue.is_empty() {
            // Whole packets are whole frames (8 bytes), so the contiguous bytes are whole floats.
            let bytes = queue.make_contiguous();
            let mut samples = source.samples.lock().unwrap();
            samples.extend(
                bytes
                    .chunks_exact(4)
                    .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])),
            );
            if samples.len() > MAX_BUFFERED {
                let excess = samples.len() - MAX_BUFFERED;
                debug_once(|| {
                    "a source held more than a second of audio (the mixer stalled); dropped the oldest"
                        .into()
                });
                samples.drain(..excess);
            }
            drop(samples);
            queue.clear();
        }
        if let Err(e) = read {
            break Err(e);
        }
    };
    let _ = client.stop_stream();
    result
}

#[cfg(test)]
mod exclusion_tests {
    use super::is_excluded;

    fn list(names: &[&str]) -> Vec<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    #[test]
    fn names_match_without_case_or_extension() {
        let exclude = list(&["Discord.exe", "pinniped"]);
        assert!(is_excluded("discord.exe", &exclude));
        assert!(is_excluded("Pinniped.exe", &exclude));
        assert!(!is_excluded("PinnipedHelper.exe", &exclude));
        assert!(!is_excluded("steam.exe", &exclude));
    }

    #[test]
    fn blank_entries_match_nothing() {
        assert!(!is_excluded("a.exe", &list(&["", "  "])));
        assert!(!is_excluded("a.exe", &[]));
    }
}
