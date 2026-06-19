use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Stores the currently registered shortcut so we can un-register it.
static CURRENT_SHORTCUT: Lazy<Mutex<Option<Shortcut>>> = Lazy::new(|| Mutex::new(None));

/// Register (or replace) the global hotkey from a string like "Alt+V" or "Ctrl+Shift+X".
/// Pass an empty string to unregister without re-registering.
pub fn register(app: &tauri::AppHandle, shortcut_str: &str) {
    let shortcut_mgr = app.global_shortcut();

    // Unregister the previous shortcut if any
    if let Some(old) = CURRENT_SHORTCUT.lock().ok().and_then(|mut s| s.take()) {
        shortcut_mgr.unregister(old).ok();
    }

    // Empty string → no shortcut
    let trimmed = shortcut_str.trim();
    if trimmed.is_empty() {
        return;
    }

    // Parse the shortcut string
    let shortcut = match parse_shortcut(trimmed) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[hotkey] failed to parse shortcut '{}': {}", trimmed, e);
            return;
        }
    };

    let handle = app.clone();
    match shortcut_mgr.on_shortcut(shortcut.clone(), move |_app, _scut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_window(&handle);
        }
    }) {
        Ok(()) => {
            *CURRENT_SHORTCUT.lock().unwrap() = Some(shortcut);
        }
        Err(e) => {
            eprintln!("[hotkey] failed to register shortcut '{}': {}", trimmed, e);
        }
    }
}

/// Parse a shortcut string like "Alt+V", "Ctrl+Shift+X" into a Shortcut.
fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();

    if parts.len() < 2 {
        return Err("shortcut must have at least one modifier and one key".into());
    }

    let (key_part, modifier_parts) = parts.split_last().unwrap();

    // Parse modifiers
    let mut modifiers = Modifiers::empty();
    for m in modifier_parts {
        match m.to_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "alt" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            "super" | "win" | "meta" => modifiers |= Modifiers::SUPER,
            other => return Err(format!("unknown modifier: {}", other)),
        }
    }

    if modifiers.is_empty() {
        return Err("no modifiers found".into());
    }

    // Parse the key
    let code = parse_key(key_part)?;

    Ok(Shortcut::new(Some(modifiers), code))
}

/// Parse a key string into a Code.
fn parse_key(s: &str) -> Result<Code, String> {
    let upper = s.to_uppercase();

    // Single letter
    if upper.len() == 1 && upper.chars().all(|c| c.is_ascii_uppercase()) {
        let code_str = format!("Key{}", upper);
        return parse_code_str(&code_str)
            .ok_or_else(|| format!("unknown key: {}", s));
    }

    // Digit
    if upper.len() == 1 && upper.chars().all(|c| c.is_ascii_digit()) {
        let code_str = format!("Digit{}", upper);
        return parse_code_str(&code_str)
            .or_else(|| parse_code_str(&format!("Numpad{}", upper)))
            .ok_or_else(|| format!("unknown key: {}", s));
    }

    // Function keys
    if let Some(n) = upper.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()) {
        if (1..=24).contains(&n) {
            let code_str = format!("F{}", n);
            return parse_code_str(&code_str)
                .ok_or_else(|| format!("unknown key: {}", s));
        }
    }

    // Named keys — map common names to Code variants
    let code_str = match upper.as_str() {
        "SPACE" => "Space",
        "TAB" => "Tab",
        "ESC" | "ESCAPE" => "Escape",
        "BACKSPACE" => "Backspace",
        "DELETE" | "DEL" => "Delete",
        "INSERT" | "INS" => "Insert",
        "HOME" => "Home",
        "END" => "End",
        "PAGEUP" | "PGUP" => "PageUp",
        "PAGEDOWN" | "PGDN" => "PageDown",
        "↑" | "UP" | "ARROWUP" => "ArrowUp",
        "↓" | "DOWN" | "ARROWDOWN" => "ArrowDown",
        "←" | "LEFT" | "ARROWLEFT" => "ArrowLeft",
        "→" | "RIGHT" | "ARROWRIGHT" => "ArrowRight",
        "ENTER" | "RETURN" => "Enter",
        "NUMPAD0" => "Numpad0",
        "NUMPAD1" => "Numpad1",
        "NUMPAD2" => "Numpad2",
        "NUMPAD3" => "Numpad3",
        "NUMPAD4" => "Numpad4",
        "NUMPAD5" => "Numpad5",
        "NUMPAD6" => "Numpad6",
        "NUMPAD7" => "Numpad7",
        "NUMPAD8" => "Numpad8",
        "NUMPAD9" => "Numpad9",
        _ => return Err(format!("unknown key: {}", s)),
    };

    parse_code_str(code_str).ok_or_else(|| format!("unknown key: {}", s))
}

/// Try to parse a Code from a string variant name.
fn parse_code_str(code_str: &str) -> Option<Code> {
    match code_str {
        "KeyA" => Some(Code::KeyA),
        "KeyB" => Some(Code::KeyB),
        "KeyC" => Some(Code::KeyC),
        "KeyD" => Some(Code::KeyD),
        "KeyE" => Some(Code::KeyE),
        "KeyF" => Some(Code::KeyF),
        "KeyG" => Some(Code::KeyG),
        "KeyH" => Some(Code::KeyH),
        "KeyI" => Some(Code::KeyI),
        "KeyJ" => Some(Code::KeyJ),
        "KeyK" => Some(Code::KeyK),
        "KeyL" => Some(Code::KeyL),
        "KeyM" => Some(Code::KeyM),
        "KeyN" => Some(Code::KeyN),
        "KeyO" => Some(Code::KeyO),
        "KeyP" => Some(Code::KeyP),
        "KeyQ" => Some(Code::KeyQ),
        "KeyR" => Some(Code::KeyR),
        "KeyS" => Some(Code::KeyS),
        "KeyT" => Some(Code::KeyT),
        "KeyU" => Some(Code::KeyU),
        "KeyV" => Some(Code::KeyV),
        "KeyW" => Some(Code::KeyW),
        "KeyX" => Some(Code::KeyX),
        "KeyY" => Some(Code::KeyY),
        "KeyZ" => Some(Code::KeyZ),
        "Digit0" => Some(Code::Digit0),
        "Digit1" => Some(Code::Digit1),
        "Digit2" => Some(Code::Digit2),
        "Digit3" => Some(Code::Digit3),
        "Digit4" => Some(Code::Digit4),
        "Digit5" => Some(Code::Digit5),
        "Digit6" => Some(Code::Digit6),
        "Digit7" => Some(Code::Digit7),
        "Digit8" => Some(Code::Digit8),
        "Digit9" => Some(Code::Digit9),
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        "F13" => Some(Code::F13),
        "F14" => Some(Code::F14),
        "F15" => Some(Code::F15),
        "F16" => Some(Code::F16),
        "F17" => Some(Code::F17),
        "F18" => Some(Code::F18),
        "F19" => Some(Code::F19),
        "F20" => Some(Code::F20),
        "F21" => Some(Code::F21),
        "F22" => Some(Code::F22),
        "F23" => Some(Code::F23),
        "F24" => Some(Code::F24),
        "Space" => Some(Code::Space),
        "Tab" => Some(Code::Tab),
        "Escape" => Some(Code::Escape),
        "Backspace" => Some(Code::Backspace),
        "Delete" => Some(Code::Delete),
        "Insert" => Some(Code::Insert),
        "Home" => Some(Code::Home),
        "End" => Some(Code::End),
        "PageUp" => Some(Code::PageUp),
        "PageDown" => Some(Code::PageDown),
        "ArrowUp" => Some(Code::ArrowUp),
        "ArrowDown" => Some(Code::ArrowDown),
        "ArrowLeft" => Some(Code::ArrowLeft),
        "ArrowRight" => Some(Code::ArrowRight),
        "Enter" => Some(Code::Enter),
        "Numpad0" => Some(Code::Numpad0),
        "Numpad1" => Some(Code::Numpad1),
        "Numpad2" => Some(Code::Numpad2),
        "Numpad3" => Some(Code::Numpad3),
        "Numpad4" => Some(Code::Numpad4),
        "Numpad5" => Some(Code::Numpad5),
        "Numpad6" => Some(Code::Numpad6),
        "Numpad7" => Some(Code::Numpad7),
        "Numpad8" => Some(Code::Numpad8),
        "Numpad9" => Some(Code::Numpad9),
        _ => None,
    }
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
