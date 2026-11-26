//! The Windows half: what the stub does when it runs on a user's machine.

mod install;
mod log;
mod paths;
mod process;
mod registry;
mod shortcut;
mod ui;
mod uninstall;

use installer::args;
use installer::payload::Payload;

pub fn run() -> i32 {
    let args = args::parse(std::env::args().skip(1));
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => return fail(&args, &format!("cannot locate the installer: {e}")),
    };
    log::init();
    // electron-updater starts the installer with the app's working directory, which is the
    // install folder; a process's working directory is open without delete sharing, so the
    // folder could not be renamed (os error 32).
    if let Err(e) = std::env::set_current_dir(std::env::temp_dir()) {
        log::line(&format!("cannot leave the working directory: {e}"));
    }
    log::line(&format!("start {} {:?}", exe.display(), std::env::args().skip(1).collect::<Vec<_>>()));

    let payload = match Payload::open(&exe) {
        Ok(p) => p,
        Err(e) => return fail(&args, &format!("{e}")),
    };

    // Only one setup at a time: an update and a manual install must not interleave.
    let _single = match ui::single_instance() {
        Some(g) => g,
        None => {
            log::line("another setup is running; exiting");
            return 0;
        }
    };

    let code = match payload {
        Some(payload) if !args.uninstall => install::run(&args, payload),
        _ => uninstall::run(&args, &exe),
    };
    log::line(&format!("exit {code}"));
    code
}

fn fail(args: &args::Args, msg: &str) -> i32 {
    log::line(&format!("error: {msg}"));
    if !args.silent {
        ui::message("Pinniped Setup", msg, true);
    }
    1
}
