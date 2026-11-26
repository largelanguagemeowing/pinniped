//! Everything the installer knows about Pinniped. Pinniped-specific on purpose.

pub const APP_ID: &str = "club.stablecat.pinniped";
pub const PRODUCT_NAME: &str = "Pinniped";
pub const PUBLISHER: &str = "Pinniped contributors";
/// The executable inside the payload, started after an install and used for shortcuts.
pub const EXE_NAME: &str = "Pinniped.exe";
pub const UNINSTALLER_NAME: &str = "Uninstall Pinniped.exe";
/// Folder under `%LOCALAPPDATA%\Programs`.
pub const DEFAULT_DIR_NAME: &str = "Pinniped";
/// electron-builder derives this from the app id (uuid v5), and its NSIS installers keyed
/// their uninstall entry and `HKCU\Software\<guid>` on it. Keeping it means an install made
/// by this installer takes over the entry of an NSIS one instead of listing Pinniped twice.
pub const UNINSTALL_GUID: &str = "fd91c319-e291-5c4d-8a67-87c2c4a92006";
