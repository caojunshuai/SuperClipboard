use tauri::{
    Emitter, Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    image::Image,
};

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Embed and decode icon PNG at compile time
    let icon_bytes = include_bytes!("../icons/icon.png");
    let img = image::load_from_memory(icon_bytes)?.into_rgba8();
    let (w, h) = img.dimensions();
    let icon = Image::new_owned(img.into_raw(), w, h);
    let show_item = MenuItemBuilder::with_id("show", "打开剪切板面板").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&separator)
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("SuperClipboard")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => toggle_window(app),
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

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
