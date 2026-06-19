import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const MODIFIER_LABELS: Record<string, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Win',
};

/** Normalize a KeyboardEvent into a display string, e.g. "Ctrl + Shift + X" */
function formatCombo(e: KeyboardEvent): string | null {
  // Ignore pure modifier key presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Win');

  // Must include at least one modifier
  if (parts.length === 0) return null;

  // Normalize the non-modifier key
  const key = normalizeKey(e.key, e.code);
  if (!key) return null;

  parts.push(key);
  return parts.join(' + ');
}

/** Convert KeyboardEvent key/code into a canonical key name */
function normalizeKey(key: string, code: string): string | null {
  // Single letters
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
  // Digits
  if (/^[0-9]$/.test(key)) return key;
  // Numeric keypad
  if (code.startsWith('Numpad')) return code.replace('Numpad', 'Num');
  // Function keys
  if (/^F[1-9][0-9]?$/.test(key)) return key;
  // Named keys from code
  const CODE_MAP: Record<string, string> = {
    Space: 'Space',
    Tab: 'Tab',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    NumpadEnter: 'Enter',
    CapsLock: 'CapsLock',
    ScrollLock: 'ScrollLock',
    Pause: 'Pause',
  };
  return CODE_MAP[code] ?? null;
}

/** Format a stored hotkey string for display, e.g. "Alt+V" → "Alt + V" */
export function formatHotkey(raw: string): string {
  if (!raw) return '';
  return raw.split('+').map(s => s.trim()).join(' + ');
}

export default function HotkeyInput({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [capturing, setCapturing] = useState(false);
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef<HTMLButtonElement>(null);

  // Sync display when value prop changes externally
  useEffect(() => {
    setDisplayValue(value ? formatHotkey(value) : '');
  }, [value]);

  const startCapture = useCallback(() => {
    setCapturing(true);
  }, []);

  const cancelCapture = useCallback(() => {
    setCapturing(false);
  }, []);

  const clearHotkey = useCallback(() => {
    onChange('');
    setDisplayValue('');
    setCapturing(false);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape → cancel
      if (e.key === 'Escape') {
        cancelCapture();
        return;
      }

      // Backspace / Delete → clear
      if (e.key === 'Backspace' || e.key === 'Delete') {
        clearHotkey();
        return;
      }

      const combo = formatCombo(e.nativeEvent);
      if (combo) {
        // Store as compact format (no spaces): "Ctrl+Shift+X"
        const stored = combo.split(' + ').join('+');
        onChange(stored);
        setDisplayValue(combo);
        setCapturing(false);
      }
    },
    [onChange, cancelCapture, clearHotkey]
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow keydown to fire first
    setTimeout(() => setCapturing(false), 150);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button
        ref={inputRef}
        type="button"
        onClick={startCapture}
        onKeyDown={capturing ? handleKeyDown : undefined}
        onBlur={handleBlur}
        className={`flex-1 px-3 py-2 border rounded-lg text-sm text-left transition-colors ${
          capturing
            ? 'border-panel-accent bg-panel-card ring-1 ring-panel-accent/30'
            : 'border-panel-border bg-panel-card hover:border-panel-accent/50'
        } ${!displayValue ? 'text-panel-muted' : 'text-panel-text'}`}
      >
        {capturing ? (
          <span className="text-panel-accent animate-pulse">{t('settings.hotkeyPlaceholder')}</span>
        ) : displayValue ? (
          <span>{displayValue}</span>
        ) : (
          <span>{t('settings.hotkeyPlaceholder')}</span>
        )}
      </button>
      {displayValue && !capturing && (
        <button
          type="button"
          onClick={clearHotkey}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-panel-muted hover:text-panel-text rounded"
          title={t('settings.hotkeyClear')}
        >
          ✕
        </button>
      )}
    </div>
  );
}
