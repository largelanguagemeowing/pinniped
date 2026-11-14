//! Windows side of the Pinniped desktop helper: the audio of a screen share.
//!
//! Windows has no virtual microphone without a driver, so the audio is captured natively and
//! streamed to Pinniped as PCM; see capture.rs for what is captured.
//!
//! The Electron main process talks to this over stdio, one JSON object per line, like the Linux
//! helper (see linux/mod.rs). Commands go in on stdin:
//! - `{"cmd":"screenshare_prepare"}` checks that per-application capture works here.
//! - `{"cmd":"screenshare_link","active":true,"output":"Speakers","pid":1234}` starts (or with
//!   `false` stops) capturing the audio that plays on the output device labelled `output` (the
//!   default when empty), leaving out process `pid` and its children.
//! - `{"cmd":"screenshare_release"}` stops everything.
//!
//! Events: `{"event":"ready",...}` at start, `{"event":"result","cmd":...,"ok":...,"error":...}`
//! for each command, and `{"event":"audio","data":"<base64>"}` while capturing: 20 ms or so of
//! 48 kHz stereo signed 16-bit little-endian interleaved PCM.

mod capture;

use std::io::{BufRead, Write};

use serde::{Deserialize, Serialize};

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

pub fn main() {
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
        let (cmd, result): (&'static str, Result<(), String>) =
            match serde_json::from_str::<Command>(&line) {
                Ok(Command::ScreensharePrepare) => ("screenshare_prepare", capture::check()),
                Ok(Command::ScreenshareLink {
                    active,
                    output,
                    pid,
                    exclude,
                }) => (
                    "screenshare_link",
                    if active {
                        session.start(output, pid, exclude)
                    } else {
                        session.stop();
                        Ok(())
                    },
                ),
                Ok(Command::ScreenshareRelease) => {
                    session.stop();
                    ("screenshare_release", Ok(()))
                }
                Ok(Command::Shortcuts {}) => ("shortcuts", Err("not supported on Windows".into())),
                Ok(Command::Autostart {}) => ("autostart", Err("not supported on Windows".into())),
                Err(err) => ("invalid", Err(err.to_string())),
            };
        emit(&Event::Result {
            cmd,
            ok: result.is_ok(),
            error: result.err(),
        });
    }
    session.stop();
}
