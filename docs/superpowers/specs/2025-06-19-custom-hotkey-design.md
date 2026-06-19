# Custom Hotkey Feature — Design Spec

**Date:** 2025-06-19  
**Status:** approved  
**Summary:** Replace hardcoded `Alt+V` global shortcut with a user-customizable hotkey, 
using a dedicated HotkeyInput component and dynamic shortcut registration in Rust.

---

## 1. Current State

| Layer | What exists | Gap |
|---|---|---|
| DB (`models.rs`, `storage.rs`) | `hotkey: String` field, default `"Alt+V"`, stored/loaded normally | Works fine |
| Backend (`hotkey.rs`) | `register()` hardcodes `Shortcut::new(Modifiers::ALT, Code::KeyV)`, called once at startup | Never re-registers, never reads the DB value |
| Frontend (`SettingsPanel.tsx`) | Hotkey displayed in read-only `<input>` with hint text | No way to change it |
| Settings save (`commands.rs`) | `update_settings()` persists settings to DB | Does not trigger hotkey re-registration |

## 2. Design

### 2.1 Module Structure

```
src/components/
  HotkeyInput.tsx              # NEW — standalone key-capture component

src-tauri/src/
  hotkey.rs                    # REFACTOR — dynamic register/unregister + string parsing
  commands.rs                  # Edit — call hotkey::register() on settings save
  lib.rs                       # Edit — pass DB hotkey value to register() at startup
```

No changes to `models.rs`, `storage.rs`, or the settings DB schema — the `hotkey` field already exists.

### 2.2 String Protocol

Hotkeys are serialized as `Modifier+Key` strings, matching `tauri-plugin-global-shortcut` conventions:

```
"Alt+V"           → Modifiers::ALT, Code::KeyV
"Ctrl+Shift+X"    → Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyX
"Super+Space"     → Modifiers::SUPER, Code::Space
```

Rules:
- Modifiers first, separated by `+`, final segment is the non-modifier key
- Supported modifiers: `Ctrl`, `Alt`, `Shift`, `Super` (Windows key)
- Supported keys: `A-Z`, `0-9`, `F1-F12`, `Space`, `Tab`, `Escape`, `Backspace`, `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, arrow keys, `Enter`
- Case-insensitive

### 2.3 HotkeyInput Component

**States:**

- **Default**: shows current shortcut value text + a capture button (🔗 icon or similar)
- **Capturing**: shows placeholder text "请按下组合键…", listens for keydown
- **Captured**: shows the newly captured combination, blurs out

**Behavior:**

- Click the input or capture button → enter capturing mode
- User presses a key combination → validate (must include ≥1 modifier key), format, and emit `onChange`
- `Escape` → cancel, restore previous value
- Click outside → cancel, restore previous value
- Empty/clear → hotkey is `""` (no global shortcut registered)
- The component is fully self-contained — `value: string` in, `onChange: (v: string) => void` out

**Validation (frontend):**
- Must include at least one modifier (`Ctrl`, `Alt`, `Shift`, `Super`)
- Non-modifier key must be exactly one (e.g., `Alt+Shift` without a key is invalid)
- Pure modifier keys are not valid

### 2.4 Backend: hotkey.rs Refactor

```rust
// New API
pub fn register(app: &tauri::AppHandle, shortcut_str: &str) {
    // 1. Unregister any previously registered shortcut
    // 2. If shortcut_str is empty, return early (no shortcut)
    // 3. parse_shortcut(shortcut_str) → Shortcut
    // 4. Register with global_shortcut()
}

fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    // Parse "Alt+V", "Ctrl+Shift+X" etc.
    // Return error on unrecognized keys
}
```

The old `register(app)` signature changes to `register(app, shortcut_str)`.

### 2.5 Settings Integration

**Startup (`lib.rs`):**
```rust
// After get_all_settings() in setup()
hotkey::register(&handle, &settings.hotkey);
```

**Settings save (`commands.rs` `update_settings`):**
```rust
storage::save_all_settings(&settings);
#[cfg(target_os = "windows")]
crate::set_auto_start(settings.auto_start);
hotkey::register(app, &settings.hotkey);  // <-- added
```

### 2.6 i18n

New translation keys needed:
- `settings.hotkey` — already exists ("快捷键")
- `settings.hotkeyHint` — already exists
- `settings.hotkeyPlaceholder` — "请按下组合键…"
- `settings.hotkeyInvalid` — "请包含至少一个修饰键 (Ctrl/Alt/Shift/Win)"

## 3. Error Handling

| Scenario | Behavior |
|---|---|
| User enters key without modifier | Frontend rejects, shows hint text |
| Shortcut string fails backend parse | Silently keep old shortcut, log error |
| OS-level shortcut conflict | Registration best-effort; OS may intercept, no user-facing error |
| Empty hotkey string | Unregister global shortcut; app only accessible via tray |
| Modifier-only combo (e.g. `Alt`) | Frontend rejects — no non-modifier key |

## 4. Edge Cases

- **CJK IME active**: Capturing ignores `isComposing` events, only processes final keydown
- **Modifier key stuck**: Only captures combinations — a lone `Ctrl` keydown is ignored
- **NumLock/CapsLock**: Not treated as modifiers, ignored
- **Multiple rapid captures**: Debounced — one capture per mode entry
- **Tauri plugin re-registration**: `global_shortcut()` may require unregistering old shortcut explicitly; tested behavior TBD

## 5. Verification

1. Build succeeds: `npm run tauri build`
2. Dev test:
   - Open Settings → click hotkey input → press `Ctrl+Shift+X` → shows `Ctrl + Shift + X`
   - Save settings → close app → reopen → Settings still shows `Ctrl + Shift + X`
   - Press `Ctrl+Shift+X` → panel toggles correctly
   - Clear hotkey to empty → save → panel can't be toggled via shortcut (tray only)
   - Wait 500ms → clipboard monitor still works
