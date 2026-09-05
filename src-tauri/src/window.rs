use tauri::{Emitter, Manager};

/// Show/hide the main panel window. Shared by the global hotkey and the
/// tray icon so both behave identically (incl. the panel-shown event that
/// makes the list refresh).
pub fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            app.emit("panel-shown", ()).ok();
        }
    }
}
