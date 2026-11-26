use installer::config;
use std::path::PathBuf;
use windows::core::GUID;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Programs, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

fn known_folder(id: &GUID) -> Option<PathBuf> {
    unsafe {
        let p = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as _));
        s.map(PathBuf::from)
    }
}

pub fn local_app_data() -> PathBuf {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
}

pub fn default_install_dir() -> PathBuf {
    local_app_data().join("Programs").join(config::DEFAULT_DIR_NAME)
}

/// `Pinniped.lnk` on the desktop (follows folder redirection such as OneDrive).
pub fn desktop_shortcut() -> Option<PathBuf> {
    known_folder(&FOLDERID_Desktop).map(|d| d.join(format!("{}.lnk", config::PRODUCT_NAME)))
}

pub fn start_menu_shortcut() -> Option<PathBuf> {
    known_folder(&FOLDERID_Programs).map(|d| d.join(format!("{}.lnk", config::PRODUCT_NAME)))
}

/// Where electron-updater keeps downloaded updates (`updaterCacheDirName`).
pub fn updater_cache() -> PathBuf {
    local_app_data().join("pinniped-updater")
}
