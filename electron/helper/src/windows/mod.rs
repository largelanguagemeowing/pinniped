//! Windows side of the Pinniped desktop helper: the audio of a screen share.
//!
//! Windows has no virtual microphone without a driver, so the audio is captured natively and
//! streamed to Pinniped as PCM; see capture.rs for what is captured.
//!
//! The Electron main process talks to this over stdio, one JSON object per line, like the Linux
//! helper (see linux/mod.rs). Commands go in on stdin:
//! - `{"cmd":"screenshare_prepare"}` checks that per-application capture works here.
//! - `{"cmd":"screenshare_link","active":true,"output":"Speakers","pid":1234,"exclude":["Some.exe"]}`
//!   starts (or with `false` stops) capturing the audio that plays on the output device labelled
//!   `output` (the default when empty), leaving out process `pid` and its children and the
//!   programs on `exclude`. With `"only":"spotify.exe"` it captures that application alone (an
//!   id from `screenshare_apps`, compared without case).
//! - `{"cmd":"screenshare_apps","output":"Speakers","pid":1234,"exclude":["Some.exe"]}` lists the
//!   applications such a capture would find right now, for picking one for `only`.
//! - `{"cmd":"screenshare_release"}` stops everything.
//!
//! Events: `{"event":"ready",...}` at start, `{"event":"result","cmd":...,"ok":...,"error":...}`
//! for each command (`screenshare_apps` adds `"apps":[{"id":"spotify.exe","name":"Spotify"}]`
//! when it succeeds), and `{"event":"audio","data":"<base64>"}` while capturing: 20 ms or so of
//! 48 kHz stereo signed 16-bit little-endian interleaved PCM.

mod capture;

use std::collections::HashSet;
use std::io::{BufRead, Write};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::apps::{App, AppFilter};

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum Command {
    ScreensharePrepare,
    ScreenshareLink {
        active: bool,
        #[serde(default)]
        output: String,
        #[serde(default)]
        pid: u32,
        /// Programs that are never shared, by file name (`Discord.exe`), whatever else plays.
        #[serde(default)]
        exclude: Vec<String>,
        /// The one application to share, by its `screenshare_apps` id; every one when absent.
        #[serde(default)]
        only: Option<String>,
    },
    ScreenshareApps {
        #[serde(default)]
        output: String,
        #[serde(default)]
        pid: u32,
        #[serde(default)]
        exclude: Vec<String>,
    },
    ScreenshareRelease,
    // The Linux commands, which exist so the same protocol parses; they do nothing here.
    Shortcuts {},
    Autostart {},
}

#[derive(Serialize)]
#[serde(tag = "event", rename_all = "lowercase")]
enum Event<'a> {
    Ready {
        app_id: bool,
        shortcuts: bool,
    },
    Result {
        cmd: &'static str,
        ok: bool,
        error: Option<String>,
        /// What `screenshare_apps` found; only on its success.
        #[serde(skip_serializing_if = "Option::is_none")]
        apps: Option<Vec<App>>,
    },
    Audio {
        data: &'a str,
    },
}

/// Writes one event line. A closed stdout means Electron is gone, so the helper exits.
fn emit(event: &Event) {
    let mut out = std::io::stdout().lock();
    if serde_json::to_writer(&mut out, event).is_err()
        || writeln!(out).is_err()
        || out.flush().is_err()
    {
        std::process::exit(0);
    }
}

pub(crate) fn emit_audio(base64: &str) {
    emit(&Event::Audio { data: base64 });
}

/// Debug logging is on when Pinniped starts the helper with `PINNIPED_HELPER_DEBUG` set (the
/// Helper Console switch under Settings > Developer Tools). It then also has a console window
/// of its own, and everything below goes to it.
pub(crate) fn debug_enabled() -> bool {
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| {
        std::env::var_os("PINNIPED_HELPER_DEBUG").is_some_and(|v| !v.is_empty() && v != "0")
    })
}

/// Logs a line with the time since the helper started. `message` only runs when debugging.
pub(crate) fn debug(message: impl FnOnce() -> String) {
    if !debug_enabled() {
        return;
    }
    static START: OnceLock<Instant> = OnceLock::new();
    let at = START.get_or_init(Instant::now).elapsed().as_secs_f64();
    eprintln!("[{at:>8.3}s] {}", message());
}

/// Like [`debug`], but a line that was logged before is not logged again, for things the
/// scanner finds on every pass.
pub(crate) fn debug_once(message: impl FnOnce() -> String) {
    if !debug_enabled() {
        return;
    }
    static SEEN: Mutex<Option<HashSet<String>>> = Mutex::new(None);
    let message = message();
    let mut seen = SEEN.lock().unwrap();
    let seen = seen.get_or_insert_with(HashSet::new);
    if seen.len() < 512 && seen.insert(message.clone()) {
        debug(|| message);
    }
}

/// Points stderr at this process's console. Started by Electron with piped stdio, stderr would
/// otherwise be Electron's own, which a packaged app does not have.
fn attach_console() {
    use windows::core::w;
    use windows::Win32::Foundation::GENERIC_WRITE;
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows::Win32::System::Console::{SetConsoleTitleW, SetStdHandle, STD_ERROR_HANDLE};
    unsafe {
        if let Ok(console) = CreateFileW(
            w!("CONOUT$"),
            GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            None,
        ) {
            let _ = SetStdHandle(STD_ERROR_HANDLE, console);
        }
        let _ = SetConsoleTitleW(w!("Pinniped helper (debug)"));
    }
}

pub fn main() {
    if debug_enabled() {
        // `PINNIPED_HELPER_DEBUG=stderr` keeps the logs on the stderr it was started with, for
        // running it from a terminal; any other value opens its console window.
        if std::env::var_os("PINNIPED_HELPER_DEBUG").is_none_or(|v| v != "stderr") {
            attach_console();
        }
        debug(|| {
            format!(
                "pinniped-helper {} started, process {}, debug logging on",
                env!("CARGO_PKG_VERSION"),
                std::process::id()
            )
        });
    }
    emit(&Event::Ready {
        app_id: false,
        shortcuts: false,
    });
    let mut session = capture::Capture::default();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        debug(|| format!("command: {}", line.trim()));
        // Ok(Some) carries the answer of `screenshare_apps`; the other commands answer Ok(None).
        let (cmd, result): (&'static str, Result<Option<Vec<App>>, String>) =
            match serde_json::from_str::<Command>(&line) {
                Ok(Command::ScreensharePrepare) => {
                    ("screenshare_prepare", capture::check().map(|()| None))
                }
                Ok(Command::ScreenshareLink {
                    active,
                    output,
                    pid,
                    exclude,
                    only,
                }) => (
                    "screenshare_link",
                    if active {
                        AppFilter::new(only).and_then(|apps| {
                            session.start(capture::Share {
                                output,
                                pid,
                                exclude,
                                apps,
                            })
                        })
                    } else {
                        session.stop();
                        Ok(())
                    }
                    .map(|()| None),
                ),
                Ok(Command::ScreenshareApps {
                    output,
                    pid,
                    exclude,
                }) => (
                    "screenshare_apps",
                    capture::apps(&output, pid, &exclude).map(Some),
                ),
                Ok(Command::ScreenshareRelease) => {
                    session.stop();
                    ("screenshare_release", Ok(None))
                }
                Ok(Command::Shortcuts {}) => ("shortcuts", Err("not supported on Windows".into())),
                Ok(Command::Autostart {}) => ("autostart", Err("not supported on Windows".into())),
                Err(err) => ("invalid", Err(err.to_string())),
            };
        debug(|| match &result {
            Ok(None) => format!("{cmd}: ok"),
            Ok(Some(apps)) if apps.is_empty() => format!("{cmd}: ok, no applications"),
            Ok(Some(apps)) => format!(
                "{cmd}: ok, {}",
                apps.iter()
                    .map(|a| format!("{} ({})", a.name, a.id))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Err(error) => format!("{cmd}: failed: {error}"),
        });
        let (ok, error, apps) = match result {
            Ok(apps) => (true, None, apps),
            Err(error) => (false, Some(error), None),
        };
        emit(&Event::Result {
            cmd,
            ok,
            error,
            apps,
        });
    }
    session.stop();
}
