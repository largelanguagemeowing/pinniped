//! `pinniped-setup`: the installer, and (as a bare copy without payload) the uninstaller.
//!
//! GUI subsystem, so nothing flashes a console; failures go to the log and a message box.
#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod win;

fn main() {
    #[cfg(windows)]
    std::process::exit(win::run());
    #[cfg(not(windows))]
    {
        eprintln!("pinniped-setup only runs on Windows");
        std::process::exit(1);
    }
}
