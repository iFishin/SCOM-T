use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod tcp;

struct AppSettings {
    close_to_tray: Mutex<bool>,
    allow_multi_instance: Mutex<bool>,
    #[cfg(windows)]
    instance_handle: Mutex<Option<isize>>,
}

#[tauri::command]
fn set_close_behavior(state: tauri::State<AppSettings>, close_to_tray: bool) {
    if let Ok(mut v) = state.close_to_tray.lock() {
        *v = close_to_tray;
    }
}

#[tauri::command]
fn set_allow_multi_instance(state: tauri::State<AppSettings>, allow: bool) {
    if let Ok(mut v) = state.allow_multi_instance.lock() {
        *v = allow;
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::CreateMutexA;
        let mut guard = state.instance_handle.lock().unwrap();
        if allow {
            // Release the mutex so future instances can start
            if let Some(h) = guard.take() {
                unsafe { CloseHandle(h); }
            }
        } else {
            // Re-claim the mutex
            unsafe {
                let name = "SCOM-T-SingleInstance\0".as_ptr() as *const u8;
                let h = CreateMutexA(std::ptr::null(), 0, name);
                if h != 0 {
                    *guard = Some(h);
                }
            }
        }
    }
}

/// Try to claim the single-instance mutex. Returns true if we are the sole
/// instance (mutex created) or multi-instance is already active; false if
/// another instance is running.
#[tauri::command]
fn try_claim_instance(state: tauri::State<AppSettings>) -> bool {
    #[cfg(not(windows))]
    let _ = state;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
        use windows_sys::Win32::System::Threading::CreateMutexA;

        // If the handle already exists, multi-instance is active — allow
        if state.instance_handle.lock().unwrap().is_some() {
            return true;
        }

        unsafe {
            let name = "SCOM-T-SingleInstance\0".as_ptr() as *const u8;
            let handle = CreateMutexA(std::ptr::null(), 0, name);
            if handle == 0 {
                return true; // can't determine, allow
            }
            if GetLastError() == ERROR_ALREADY_EXISTS {
                CloseHandle(handle);
                return false; // another instance holds the mutex
            }
            // First instance — store handle
            *state.instance_handle.lock().unwrap() = Some(handle);
        }
    }
    true
}

#[tauri::command]
fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to file: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppSettings {
            close_to_tray: Mutex::new(true),
            allow_multi_instance: Mutex::new(false),
            #[cfg(windows)]
            instance_handle: Mutex::new(None),
        })
        .manage(tcp::TcpAppState::default())
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            let show_i = MenuItemBuilder::with_id("show", "显示 SCOM-T").build(app)?;
            let about_i = MenuItemBuilder::with_id("about", "关于").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_i)
                .item(&about_i)
                .separator()
                .item(&quit_i)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SCOM-T")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "about" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("show-about", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(settings) = window.try_state::<AppSettings>() {
                    if let Ok(close_to_tray) = settings.close_to_tray.lock() {
                        if *close_to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                            return;
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            append_to_file,
            set_close_behavior,
            set_allow_multi_instance,
            try_claim_instance,
            tcp::client::tcp_connect,
            tcp::client::tcp_disconnect,
            tcp::client::tcp_send,
            tcp::client::tcp_send_raw,
            tcp::server::tcp_server_start,
            tcp::server::tcp_server_stop,
            tcp::server::tcp_server_broadcast,
            tcp::server::tcp_server_disconnect_client,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // Keep the event loop running
    });
}
