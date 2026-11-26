//! Install or update: unpack beside the target, stop the app, swap the folders, register.

use super::{log, paths, process, registry, shortcut, ui};
use installer::args::Args;
use installer::config::{EXE_NAME, PRODUCT_NAME, UNINSTALLER_NAME};
use installer::payload::Payload;
use std::fs;
use std::io;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::Duration;

const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CANCELLED: &str = "cancelled";

pub fn run(args: &Args, payload: Payload) -> i32 {
    let a = Args { silent: args.silent, updated: args.updated, force_run: args.force_run, install_dir: args.install_dir.clone(), ..Default::default() };
    let silent = args.silent;
    let result = ui::run(silent, &format!("{PRODUCT_NAME} Setup"), &format!("Installing {PRODUCT_NAME}…"), move |rep| {
        install(&a, payload, rep)
    });
    match result {
        Ok(dir) => {
            log::line(&format!("installed to {}", dir.display()));
            if !silent || args.force_run {
                launch(&dir);
            }
            0
        }
        Err(e) if e == CANCELLED => {
            log::line("cancelled by the user");
            1
        }
        Err(e) => {
            log::line(&format!("install failed: {e}"));
            if !silent {
                ui::message(&format!("{PRODUCT_NAME} Setup"), &format!("{PRODUCT_NAME} could not be installed.\n\n{e}"), true);
            }
            // The updater already closed the app; a failed update must not leave the user
            // without it, so start what is still installed.
            if args.force_run {
                let dir = target_dir(args);
                if dir.join(EXE_NAME).is_file() {
                    log::line("starting the previous version");
                    launch(&dir);
                }
            }
            1
        }
    }
}

fn target_dir(args: &Args) -> PathBuf {
    args.install_dir.clone().or_else(registry::previous_install_dir).unwrap_or_else(paths::default_install_dir)
}

fn install(args: &Args, mut payload: Payload, rep: ui::Reporter) -> Result<PathBuf, String> {
    shortcut::init_com();
    let dir = target_dir(args);
    let name = dir.file_name().ok_or("the install folder has no name")?.to_string_lossy().into_owned();
    let parent = dir.parent().ok_or("the install folder has no parent")?.to_path_buf();
    let staging = parent.join(format!("{name}.install-new"));
    let backup = parent.join(format!("{name}.install-old"));
    let had_install = dir.join(EXE_NAME).is_file();
    log::line(&format!("target {} (existing install: {had_install})", dir.display()));

    // Never replace a folder that is not ours: /D=C:\Users\me must not be wiped.
    if dir.exists() && !had_install && !is_empty_dir(&dir) {
        return Err(format!("{} already exists and is not a {PRODUCT_NAME} install. Choose an empty folder.", dir.display()));
    }
    fs::create_dir_all(&parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    // Leftovers of an interrupted earlier run.
    let _ = fs::remove_dir_all(&staging);
    let _ = fs::remove_dir_all(&backup);

    rep.set(0, &format!("Installing {PRODUCT_NAME}…"));
    let extracted = (|| -> Result<(String, u64), String> {
        let meta = payload
            .extract(&staging, |done, total| rep.set(done * 90 / total.max(1), &format!("Installing {PRODUCT_NAME}…")))
            .map_err(|e| format!("cannot unpack the installer: {e}"))?;
        let stub = payload.stub_bytes().map_err(|e| format!("cannot read the installer: {e}"))?;
        fs::write(staging.join(UNINSTALLER_NAME), stub).map_err(|e| format!("cannot write the uninstaller: {e}"))?;
        Ok((meta.version, dir_size(&staging)))
    })();
    let (version, size) = match extracted {
        Ok(v) => v,
        Err(e) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(e);
        }
    };

    // An update closes the app by itself; for a hand-run install, ask before ending it.
    if !args.silent && !args.updated && !process::running_in(&dir).is_empty() {
        let q = format!("{PRODUCT_NAME} is running. It has to be closed to continue.");
        if !ui::confirm(&format!("{PRODUCT_NAME} Setup"), &q) {
            let _ = fs::remove_dir_all(&staging);
            return Err(CANCELLED.to_string());
        }
    }
    rep.set(92, "Closing the running app…");
    if !process::stop_all(&dir, Duration::from_secs(3)) {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("{PRODUCT_NAME} is still running and could not be closed."));
    }

    rep.set(95, "Replacing files…");
    if dir.exists() {
        if let Err(e) = retry(|| fs::rename(&dir, &backup)) {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("cannot replace {}: {e}. Is another program using it?", dir.display()));
        }
    }
    if let Err(e) = retry(|| fs::rename(&staging, &dir)) {
        // Put the previous version back rather than leave nothing installed.
        let _ = fs::rename(&backup, &dir);
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("cannot move the new version into place: {e}"));
    }
    let _ = fs::remove_dir_all(&backup);

    rep.set(98, "Finishing…");
    let exe = dir.join(EXE_NAME);
    let uninstaller = dir.join(UNINSTALLER_NAME);
    registry::register(&dir, &version, &exe, &uninstaller, (size / 1024).min(u32::MAX as u64) as u32)
        .map_err(|e| format!("cannot register the install: {e}"))?;
    // A fresh install gets both shortcuts. An update only refreshes the ones that still exist,
    // so a shortcut the user deleted stays deleted.
    for lnk in [paths::start_menu_shortcut(), paths::desktop_shortcut()].into_iter().flatten() {
        if !had_install || lnk.exists() {
            if let Err(e) = shortcut::create(&lnk, &exe, &dir) {
                log::line(&format!("shortcut {}: {e}", lnk.display()));
            }
        }
    }
    ui::refresh_shell();
    rep.set(100, "Done");
    Ok(dir)
}

/// Start the app the way the user would: through the Start Menu shortcut, so Windows ties it to
/// the shortcut's AppUserModelID (taskbar grouping, notifications); the exe itself otherwise.
fn launch(dir: &Path) {
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let exe = dir.join(EXE_NAME);
    let target = paths::start_menu_shortcut().filter(|l| l.exists()).unwrap_or_else(|| exe.clone());
    let result = unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(target.as_os_str()), None, &HSTRING::from(dir.as_os_str()), SW_SHOWNORMAL)
    };
    // ShellExecute reports success with a value above 32.
    if (result.0 as isize) <= 32 {
        log::line(&format!("cannot start {} via the shell ({}); starting the exe", target.display(), result.0 as isize));
        let r = Command::new(&exe)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
            .spawn();
        if let Err(e) = r {
            log::line(&format!("cannot start {}: {e}", exe.display()));
        }
    }
}

fn is_empty_dir(p: &Path) -> bool {
    fs::read_dir(p).map(|mut d| d.next().is_none()).unwrap_or(true)
}

fn dir_size(p: &Path) -> u64 {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(p) {
        for e in rd.flatten() {
            match e.metadata() {
                Ok(m) if m.is_dir() => n += dir_size(&e.path()),
                Ok(m) => n += m.len(),
                Err(_) => {}
            }
        }
    }
    n
}

/// Renames and deletes fail for a moment while antivirus or the indexer holds a file.
pub fn retry<T>(mut op: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    let mut last = None;
    for _ in 0..25 {
        match op() {
            Ok(v) => return Ok(v),
            Err(e) => {
                last = Some(e);
                sleep(Duration::from_millis(200));
            }
        }
    }
    Err(last.unwrap())
}
