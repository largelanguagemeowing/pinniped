//! The "Apps & features" entry and the install-location record, both per user (HKCU) and
//! keyed like the NSIS installer's so an upgrade replaces rather than duplicates them.

use installer::config::{PRODUCT_NAME, PUBLISHER, UNINSTALL_GUID};
use std::io;
use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
use winreg::RegKey;

fn uninstall_key() -> String {
    format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{UNINSTALL_GUID}")
}

fn location_key() -> String {
    format!(r"Software\{UNINSTALL_GUID}")
}

pub fn register(dir: &Path, version: &str, exe: &Path, uninstaller: &Path, size_kb: u32) -> io::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu.create_subkey(uninstall_key())?;
    key.set_value("DisplayName", &format!("{PRODUCT_NAME} {version}"))?;
    key.set_value("DisplayVersion", &version.to_string())?;
    key.set_value("Publisher", &PUBLISHER.to_string())?;
    key.set_value("InstallLocation", &dir.to_string_lossy().into_owned())?;
    key.set_value("DisplayIcon", &format!("{},0", exe.display()))?;
    key.set_value("UninstallString", &format!("\"{}\" /currentuser", uninstaller.display()))?;
    key.set_value("QuietUninstallString", &format!("\"{}\" /currentuser /S", uninstaller.display()))?;
    key.set_value("EstimatedSize", &size_kb)?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;

    let (loc, _) = hkcu.create_subkey(location_key())?;
    loc.set_value("InstallLocation", &dir.to_string_lossy().into_owned())?;
    Ok(())
}

pub fn unregister() {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(uninstall_key());
    let _ = hkcu.delete_subkey_all(location_key());
}

/// Where Pinniped is installed now, if the record points at a real install.
pub fn previous_install_dir() -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let from_loc = hkcu
        .open_subkey_with_flags(location_key(), KEY_READ)
        .ok()
        .and_then(|k| k.get_value::<String, _>("InstallLocation").ok());
    let from_uninstall = hkcu
        .open_subkey_with_flags(uninstall_key(), KEY_READ)
        .ok()
        .and_then(|k| k.get_value::<String, _>("InstallLocation").ok());
    from_loc.or(from_uninstall).map(PathBuf::from).filter(|p| p.join(installer::config::EXE_NAME).is_file())
}
