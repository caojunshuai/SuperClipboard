use tauri::{
    Emitter, Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
    image::Image,
};

fn tray_labels(lang: &str) -> (&'static str, &'static str) {
    if lang.starts_with("zh") {
        ("打开面板", "退出")
    } else {
        ("Show Panel", "Quit")
    }
}

const TRAY_ID: &str = "main-tray";

fn build_menu(app: &tauri::AppHandle, show_label: &str, quit_label: &str) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", show_label).build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", quit_label).build(app)?;
    Ok(MenuBuilder::new(app)
        .item(&show_item)
        .item(&separator)
        .item(&quit_item)
        .build()?)
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let settings = crate::storage::get_all_settings().unwrap_or_default();
    let (show_label, quit_label) = tray_labels(&settings.language);

    // Embed and decode icon PNG at compile time
    let icon_bytes = include_bytes!("../icons/icon.png");
    let img = image::load_from_memory(icon_bytes)?.into_rgba8();
    let (w, h) = img.dimensions();
    let icon = Image::new_owned(img.into_raw(), w, h);

    let menu = build_menu(app, show_label, quit_label)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
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

/// Rebuild the tray menu with current language labels.
/// Called after settings are saved with a different language.
pub fn update_labels(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let settings = crate::storage::get_all_settings().unwrap_or_default();
    let (show_label, quit_label) = tray_labels(&settings.language);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_menu(app, show_label, quit_label)?;
        tray.set_menu(Some(menu))?;
    }
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
