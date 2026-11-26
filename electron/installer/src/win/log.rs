//! A small append-only log in %TEMP%. The updater starts the installer detached, so this file
//! is the only record of why an update did not apply.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG: Mutex<Option<File>> = Mutex::new(None);

pub fn init() {
    let path = std::env::temp_dir().join("Pinniped-Setup.log");
    // Start over once it grows large, so it never becomes a problem of its own.
    if std::fs::metadata(&path).map(|m| m.len() > 512 * 1024).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    if let Ok(f) = OpenOptions::new().create(true).append(true).open(path) {
        *LOG.lock().unwrap() = Some(f);
    }
}

pub fn line(msg: &str) {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Some(f) = LOG.lock().unwrap().as_mut() {
        let _ = writeln!(f, "[{secs}] {msg}");
    }
}
