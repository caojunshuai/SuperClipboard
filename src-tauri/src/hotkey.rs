use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub fn register(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyV);
    let handle = app.clone();

    let shortcut_mgr = app.global_shortcut();
    shortcut_mgr.on_shortcut(shortcut, move |_app, _scut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_window(&handle);
        }
    })?;

    Ok(())
}

fn toggle_window(app: &tauri::AppHandle) {
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
