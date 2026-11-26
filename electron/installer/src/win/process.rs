//! Finding and stopping the running app, so its files can be replaced.

use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, Instant};
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, WPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_TERMINATE,
};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE};

struct Owned(HANDLE);
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

fn image_path(pid: u32, rights: u32) -> Option<(Owned, PathBuf)> {
    unsafe {
        let h = OpenProcess(windows::Win32::System::Threading::PROCESS_ACCESS_RIGHTS(rights), false, pid).ok()?;
        let h = Owned(h);
        let mut buf = [0u16; 2048];
        let mut len = buf.len() as u32;
        QueryFullProcessImageNameW(h.0, PROCESS_NAME_FORMAT(0), PWSTR(buf.as_mut_ptr()), &mut len).ok()?;
        let path = PathBuf::from(String::from_utf16_lossy(&buf[..len as usize]));
        Some((h, path))
    }
}

fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Process ids whose executable lives under `dir` (other than this process).
pub fn running_in(dir: &Path) -> Vec<u32> {
    let prefix = format!("{}\\", norm(dir));
    let me = std::process::id();
    let mut pids = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return pids };
        let snap = Owned(snap);
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap.0, &mut entry).is_ok();
        while ok {
            let pid = entry.th32ProcessID;
            if pid != me {
                if let Some((_h, path)) = image_path(pid, PROCESS_QUERY_LIMITED_INFORMATION.0) {
                    if norm(&path).starts_with(&prefix) {
                        pids.push(pid);
                    }
                }
            }
            ok = Process32NextW(snap.0, &mut entry).is_ok();
        }
    }
    pids
}

unsafe extern "system" fn close_if_ours(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let pids = &*(lparam.0 as *const Vec<u32>);
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pids.contains(&pid) {
        let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
    }
    BOOL(1)
}

/// Ask the app under `dir` to close, give it `grace`, then end whatever is left. Returns
/// false if something is still running afterwards.
pub fn stop_all(dir: &Path, grace: Duration) -> bool {
    let pids = running_in(dir);
    if pids.is_empty() {
        return true;
    }
    crate::win::log::line(&format!("stopping {} process(es) under {}", pids.len(), dir.display()));
    unsafe {
        let _ = EnumWindows(Some(close_if_ours), LPARAM(&pids as *const Vec<u32> as isize));
    }
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline && !running_in(dir).is_empty() {
        sleep(Duration::from_millis(100));
    }
    for pid in running_in(dir) {
        if let Some((h, _)) = image_path(pid, PROCESS_QUERY_LIMITED_INFORMATION.0 | PROCESS_TERMINATE.0) {
            unsafe {
                let _ = TerminateProcess(h.0, 1);
            }
        }
    }
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if running_in(dir).is_empty() {
            return true;
        }
        sleep(Duration::from_millis(100));
    }
    false
}
