//! Uninstall. An exe cannot delete itself while it runs from the folder being removed, so the
//! uninstaller in the install folder only starts a temporary copy of itself and exits; the
//! copy removes everything and finally deletes itself.

use super::{log, paths, process, registry, ui};
use installer::args::Args;
use installer::config::{EXE_NAME, PRODUCT_NAME};
use std::fs;
use std::mem::{offset_of, size_of};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use windows::core::HSTRING;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::Storage::FileSystem::{
    CreateFileW, SetFileInformationByHandle, DELETE, FILE_ATTRIBUTE_NORMAL, FILE_DISPOSITION_INFO, FILE_RENAME_INFO,
    FILE_SHARE_MODE, FileDispositionInfo, FileRenameInfo, OPEN_EXISTING,
};

const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const DETACHED_PROCESS: u32 = 0x0000_0008;

pub fn run(args: &Args, exe: &Path) -> i32 {
    match &args.cleanup {
        Some(dir) => cleanup(args, dir),
        None => hand_off(args, exe),
    }
}

/// Step one, running from the install folder: start the temporary copy and get out of the way.
fn hand_off(args: &Args, exe: &Path) -> i32 {
    let Some(dir) = exe.parent() else { return 1 };
    if !dir.join(EXE_NAME).is_file() {
        log::line("not running from an install folder");
        if !args.silent {
            ui::message(
                &format!("{PRODUCT_NAME} Setup"),
                &format!("This is the {PRODUCT_NAME} uninstaller, but it is not inside a {PRODUCT_NAME} install."),
                true,
            );
        }
        return 1;
    }
    // Started from Settings > Apps without /S: confirm, as the NSIS uninstaller did.
    if !args.silent && !ui::confirm(&format!("{PRODUCT_NAME} Setup"), &format!("Uninstall {PRODUCT_NAME}?")) {
        return 1;
    }
    let tmp = std::env::temp_dir().join(format!("Pinniped-Uninstall-{}.exe", std::process::id()));
    if let Err(e) = fs::copy(exe, &tmp) {
        log::line(&format!("cannot copy the uninstaller: {e}"));
        return 1;
    }
    let mut cmd = Command::new(&tmp);
    cmd.arg("--cleanup").arg(dir).creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    if args.silent {
        cmd.arg("/S");
    }
    match cmd.spawn() {
        Ok(_) => 0,
        Err(e) => {
            log::line(&format!("cannot start the temporary copy: {e}"));
            1
        }
    }
}

/// Step two, running from %TEMP%.
fn cleanup(args: &Args, dir: &Path) -> i32 {
    let dir: PathBuf = dir.to_path_buf();
    // Refuse to wipe anything that is not a Pinniped install.
    if !dir.join(EXE_NAME).is_file() {
        log::line(&format!("{} is not an install folder; nothing to remove", dir.display()));
        return 1;
    }
    let result = ui::run(args.silent, &format!("{PRODUCT_NAME} Setup"), &format!("Uninstalling {PRODUCT_NAME}…"), move |rep| {
        rep.set(10, "Closing the app…");
        if !process::stop_all(&dir, Duration::from_secs(3)) {
            return Err(format!("{PRODUCT_NAME} is still running and could not be closed."));
        }
        rep.set(40, "Removing shortcuts…");
        for lnk in [paths::start_menu_shortcut(), paths::desktop_shortcut()].into_iter().flatten() {
            let _ = fs::remove_file(lnk);
        }
        ui::refresh_shell();
        rep.set(60, "Removing files…");
        // The parent uninstaller may still be exiting; the retry covers that.
        super::install::retry(|| match fs::remove_dir_all(&dir) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            other => other,
        })
        .map_err(|e| format!("cannot remove {}: {e}", dir.display()))?;
        rep.set(90, "Cleaning up…");
        registry::unregister();
        // Downloaded updates are no use without the app.
        let _ = fs::remove_dir_all(paths::updater_cache());
        rep.set(100, "Done");
        Ok(())
    });
    self_delete();
    match result {
        Ok(()) => 0,
        Err(e) => {
            log::line(&format!("uninstall failed: {e}"));
            if !args.silent {
                ui::message(&format!("{PRODUCT_NAME} Setup"), &format!("{PRODUCT_NAME} could not be fully removed.\n\n{e}"), true);
            }
            1
        }
    }
}

/// Delete the running executable. Windows refuses to delete a mapped image by name, but allows
/// it once the main data stream has been renamed away; the file then disappears as soon as
/// the process ends.
fn self_delete() {
    let Ok(exe) = std::env::current_exe() else { return };
    let path = HSTRING::from(exe.as_os_str());
    let open = || unsafe { CreateFileW(&path, DELETE.0, FILE_SHARE_MODE(0), None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None) };
    unsafe {
        let Ok(h) = open() else { return };
        let stream: Vec<u16> = ":pinniped".encode_utf16().collect();
        let bytes = stream.len() * 2;
        let mut buf = vec![0u8; size_of::<FILE_RENAME_INFO>() + bytes];
        let info = buf.as_mut_ptr() as *mut FILE_RENAME_INFO;
        (*info).FileNameLength = bytes as u32;
        std::ptr::copy_nonoverlapping(stream.as_ptr() as *const u8, buf.as_mut_ptr().add(offset_of!(FILE_RENAME_INFO, FileName)), bytes);
        let renamed = SetFileInformationByHandle(h, FileRenameInfo, buf.as_ptr() as *const _, buf.len() as u32);
        let _ = CloseHandle(h);
        if let Err(e) = renamed {
            log::line(&format!("self-delete: cannot rename the data stream: {e}"));
            return;
        }
        let Ok(h) = open() else { return };
        let dispose = FILE_DISPOSITION_INFO { DeleteFile: true };
        if let Err(e) = SetFileInformationByHandle(h, FileDispositionInfo, &dispose as *const _ as *const _, size_of::<FILE_DISPOSITION_INFO>() as u32) {
            log::line(&format!("self-delete: cannot mark for deletion: {e}"));
        }
        let _ = CloseHandle(h);
    }
}
