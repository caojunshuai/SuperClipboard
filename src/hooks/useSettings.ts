import { useCallback, useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api';
import type { AppSettings } from '../types';
import { detectSystemLocale } from '../locales';
import i18n from '../locales';

// Module-level shared state — one fetch serves all consumers, saves
// broadcast to every mounted listener (mirrors the Rust-side DB singleton).
let shared: AppSettings | null = null;
let loaded = false;
const listeners = new Set<(s: AppSettings | null) => void>();

const emit = (s: AppSettings | null) => {
  for (const l of listeners) l(s);
};

async function loadOnce() {
  if (loaded) return;
  loaded = true;
  try {
    const s = await getSettings();
    // First launch: no language stored → detect system locale and persist
    if (!s.language) {
      s.language = detectSystemLocale();
      await updateSettings(s);
    }
    // DB language differs from i18n → sync (app-start, not settings-open)
    if (s.language !== i18n.language) i18n.changeLanguage(s.language);
    shared = s;
    emit(s);
  } catch {
    loaded = false; // allow retry on next mount
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(shared);

  useEffect(() => {
    listeners.add(setSettings);
    loadOnce();
    return () => { listeners.delete(setSettings); };
  }, []);

  const save = useCallback(async (next: AppSettings) => {
    await updateSettings(next);
    shared = next;
    emit(next);
  }, []);

  return { settings, save };
}
