//! Pinniped desktop helper. One binary per platform, each doing the desktop work Electron cannot:
//! on Linux the freedesktop portals (global shortcuts, autostart) and the PipeWire device for
//! screen share audio; on Windows the per-application audio capture for screen shares.
//!
//! The Electron main process starts it and talks to it over stdio, one JSON object per line;
//! see the platform modules for the commands.

#[cfg(any(target_os = "linux", windows, test))]
mod apps;
#[cfg(any(windows, test))]
mod backlog;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
fn main() {
    linux::main();
}

#[cfg(windows)]
fn main() {
    windows::main();
}

#[cfg(not(any(target_os = "linux", windows)))]
fn main() {
    eprintln!("pinniped-helper: this platform has no helper");
    std::process::exit(1);
}
