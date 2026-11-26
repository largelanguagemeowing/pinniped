//! The one-click progress window, a message box, and the single-instance guard.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Mutex;
use windows::core::{w, HSTRING};
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    CreateFontW, GetStockObject, SetBkMode, HBRUSH, HDC, TRANSPARENT, WHITE_BRUSH, CLEARTYPE_QUALITY, FW_NORMAL,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Shutdown::{ShutdownBlockReasonCreate, ShutdownBlockReasonDestroy};
use windows::Win32::System::Threading::CreateMutexW;
use windows::Win32::UI::Controls::{InitCommonControlsEx, ICC_PROGRESS_CLASS, INITCOMMONCONTROLSEX, PBM_SETPOS, PBM_SETRANGE32};
use windows::Win32::UI::HiDpi::GetDpiForSystem;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, GetSystemMetrics, LoadCursorW,
    MessageBoxW, PostMessageW, PostQuitMessage, RegisterClassW, SendMessageW, SetForegroundWindow, SetWindowTextW,
    ShowWindow, TranslateMessage, IDC_ARROW, IDOK, MB_ICONERROR, MB_ICONEXCLAMATION, MB_ICONINFORMATION, MB_OK, MB_OKCANCEL, MB_SETFOREGROUND, MB_TOPMOST, MSG, SM_CXSCREEN, SM_CYSCREEN,
    SW_SHOW, WINDOW_EX_STYLE, WM_APP, WM_CLOSE, WM_CTLCOLORSTATIC, WM_DESTROY, WM_SETFONT, WNDCLASSW, WS_CAPTION,
    WS_CHILD, WS_VISIBLE,
};

const WM_PROGRESS: u32 = WM_APP + 1;
const WM_DONE: u32 = WM_APP + 2;

static LABEL: AtomicIsize = AtomicIsize::new(0);
static BAR: AtomicIsize = AtomicIsize::new(0);
static TEXT: Mutex<String> = Mutex::new(String::new());

/// Held for the lifetime of a setup run.
pub struct SingleInstance(HANDLE);
impl Drop for SingleInstance {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

pub fn single_instance() -> Option<SingleInstance> {
    unsafe {
        let h = CreateMutexW(None, true, w!("Local\\club.stablecat.pinniped.setup")).ok()?;
        if GetLastError() == ERROR_ALREADY_EXISTS {
            let _ = CloseHandle(h);
            return None;
        }
        Some(SingleInstance(h))
    }
}

pub fn message(title: &str, text: &str, error: bool) {
    unsafe {
        MessageBoxW(
            None,
            &HSTRING::from(text),
            &HSTRING::from(title),
            MB_OK | if error { MB_ICONERROR } else { MB_ICONINFORMATION },
        );
    }
}

/// An OK/Cancel question; true for OK.
pub fn confirm(title: &str, text: &str) -> bool {
    unsafe {
        MessageBoxW(None, &HSTRING::from(text), &HSTRING::from(title), MB_OKCANCEL | MB_ICONEXCLAMATION | MB_SETFOREGROUND | MB_TOPMOST) == IDOK
    }
}

/// Tell Explorer that shortcuts changed, so the desktop redraws them (SHCNE_ASSOCCHANGED).
pub fn refresh_shell() {
    use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
}

/// Reports progress from the worker thread to the window.
#[derive(Clone, Copy)]
pub struct Reporter {
    hwnd: isize,
}

impl Reporter {
    pub fn silent() -> Reporter {
        Reporter { hwnd: 0 }
    }

    pub fn set(&self, percent: u32, text: &str) {
        if self.hwnd == 0 {
            return;
        }
        *TEXT.lock().unwrap() = text.to_string();
        unsafe {
            let _ = PostMessageW(Some(HWND(self.hwnd as _)), WM_PROGRESS, WPARAM(percent as usize), LPARAM(0));
        }
    }
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_PROGRESS => {
            let bar = HWND(BAR.load(Ordering::Relaxed) as _);
            SendMessageW(bar, PBM_SETPOS, Some(wparam), Some(LPARAM(0)));
            let label = HWND(LABEL.load(Ordering::Relaxed) as _);
            let _ = SetWindowTextW(label, &HSTRING::from(TEXT.lock().unwrap().as_str()));
            LRESULT(0)
        }
        WM_DONE => {
            let _ = DestroyWindow(hwnd);
            LRESULT(0)
        }
        // The window has no close button, but Alt+F4 must not abandon a half-done install.
        WM_CLOSE => LRESULT(0),
        WM_CTLCOLORSTATIC => {
            let _ = SetBkMode(HDC(wparam.0 as _), TRANSPARENT);
            LRESULT(GetStockObject(WHITE_BRUSH).0 as isize)
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Show the progress window and run `work` on a worker thread until it finishes.
pub fn run_with_window<T, F>(title: &str, first_text: &str, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(Reporter) -> Result<T, String> + Send + 'static,
{
    unsafe {
        let hinstance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let _ = InitCommonControlsEx(&INITCOMMONCONTROLSEX {
            dwSize: std::mem::size_of::<INITCOMMONCONTROLSEX>() as u32,
            dwICC: ICC_PROGRESS_CLASS,
        });

        let class = w!("PinnipedSetupWindow");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: hinstance.into(),
            lpszClassName: class,
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
            ..Default::default()
        };
        RegisterClassW(&wc);

        let dpi = GetDpiForSystem().max(96) as i32;
        let px = |v: i32| v * dpi / 96;
        let (cw, ch) = (px(420), px(112));
        // Client size is what we design for; a caption-only window adds a title bar around it.
        let (ww, wh) = (cw + 2, ch + px(31));
        let x = (GetSystemMetrics(SM_CXSCREEN) - ww) / 2;
        let y = (GetSystemMetrics(SM_CYSCREEN) - wh) / 3;

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            &HSTRING::from(title),
            WS_CAPTION,
            x,
            y,
            ww,
            wh,
            None,
            None,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;

        let font = CreateFontW(
            -px(15),
            0,
            0,
            0,
            FW_NORMAL.0 as i32,
            0,
            0,
            0,
            Default::default(),
            Default::default(),
            Default::default(),
            CLEARTYPE_QUALITY,
            0,
            w!("Segoe UI"),
        );
        let label = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("STATIC"),
            &HSTRING::from(first_text),
            WS_CHILD | WS_VISIBLE,
            px(24),
            px(26),
            px(372),
            px(22),
            Some(hwnd),
            None,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;
        SendMessageW(label, WM_SETFONT, Some(WPARAM(font.0 as usize)), Some(LPARAM(1)));
        let bar = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("msctls_progress32"),
            None,
            WS_CHILD | WS_VISIBLE,
            px(24),
            px(62),
            px(372),
            px(14),
            Some(hwnd),
            None,
            Some(hinstance.into()),
            None,
        )
        .map_err(|e| e.to_string())?;
        SendMessageW(bar, PBM_SETRANGE32, Some(WPARAM(0)), Some(LPARAM(100)));
        LABEL.store(label.0 as isize, Ordering::Relaxed);
        BAR.store(bar.0 as isize, Ordering::Relaxed);

        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = SetForegroundWindow(hwnd);
        // Windows warns before logging off or shutting down mid-install.
        let _ = ShutdownBlockReasonCreate(hwnd, &HSTRING::from(first_text));

        let raw = hwnd.0 as isize;
        let worker = std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(Reporter { hwnd: raw })))
                .unwrap_or_else(|_| Err("the installer crashed".to_string()));
            let _ = PostMessageW(Some(HWND(raw as _)), WM_DONE, WPARAM(0), LPARAM(0));
            result
        });

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = ShutdownBlockReasonDestroy(hwnd);
        worker.join().unwrap_or_else(|_| Err("the installer crashed".to_string()))
    }
}

/// Run `work` with a window when `silent` is false, directly otherwise.
pub fn run<T, F>(silent: bool, title: &str, first_text: &str, work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(Reporter) -> Result<T, String> + Send + 'static,
{
    if silent {
        work(Reporter::silent())
    } else {
        run_with_window(title, first_text, work)
    }
}
