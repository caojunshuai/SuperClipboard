import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings as saveSettings } from '../api';
import { SUPPORTED_LOCALES, type Locale, detectSystemLocale } from '../locales';
import i18n from '../locales';
import { applyTheme, type Theme } from '../theme';
import type { AppSettings } from '../types';

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>({
    hotkey: 'Alt+V',
    max_items: 3000,
    max_images: 500,
    auto_paste: false,
    auto_start: false,
    language: 'en-US',
    always_on_top: true,
    page_size: 50,
    theme: 'dark',
  });
  const [original, setOriginal] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ items?: string; images?: string }>({});

  // Track number fields as strings so empty input doesn't auto-refill
  const [maxItemsStr, setMaxItemsStr] = useState('3000');
  const [maxImagesStr, setMaxImagesStr] = useState('500');

  useEffect(() => {
    getSettings().then(s => {
      // First launch: language not set yet → use system detection + save
      if (!s.language) {
        s.language = detectSystemLocale();
        i18n.changeLanguage(s.language);
        saveSettings(s).catch(() => {});
      } else if (s.language !== i18n.language) {
        // DB has a saved language that differs from i18n → sync
        i18n.changeLanguage(s.language);
      }
      if (s.theme) applyTheme(s.theme as Theme);
      setSettings(s);
      setOriginal(s);
      setMaxItemsStr(s.max_items.toString());
      setMaxImagesStr(s.max_images.toString());
    }).catch(() => {});
  }, []);

  const dirty = original !== null && (
    settings.hotkey !== original.hotkey ||
    settings.auto_paste !== original.auto_paste ||
    settings.auto_start !== original.auto_start ||
    settings.always_on_top !== original.always_on_top ||
    settings.page_size !== original.page_size ||
    settings.theme !== original.theme ||
    settings.language !== original.language ||
    maxItemsStr !== original.max_items.toString() ||
    maxImagesStr !== original.max_images.toString()
  );

  const buildSettings = (): AppSettings => ({
    ...settings,
    max_items: parseInt(maxItemsStr) || 3000,
    max_images: parseInt(maxImagesStr) || 500,
  });

  const validate = (): boolean => {
    const e: { items?: string; images?: string } = {};
    const items = parseInt(maxItemsStr);
    const images = parseInt(maxImagesStr);

    if (!maxItemsStr.trim() || isNaN(items) || items < 100) {
      e.items = t('settings.errorItems');
    } else if (items > 5000) {
      e.items = t('settings.errorItemsMax');
    }

    if (!maxImagesStr.trim() || isNaN(images) || images < 10) {
      e.images = t('settings.errorImages');
    } else if (images > 500) {
      e.images = t('settings.errorImagesMax');
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const newSettings = buildSettings();
    setSaving(true);
    setErrors({});
    try {
      await saveSettings(newSettings);
      setSettings(newSettings);
      setOriginal(newSettings);
      setMaxItemsStr(newSettings.max_items.toString());
      setMaxImagesStr(newSettings.max_images.toString());
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    if (dirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  const handleDiscard = () => {
    setShowConfirm(false);
    if (original) {
      if (settings.language !== original.language) {
        i18n.changeLanguage(original.language);
      }
      if (settings.theme !== original.theme) {
        applyTheme(original.theme as Theme);
      }
    }
    onClose();
  };

  // ESC key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConfirm) {
          setShowConfirm(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose, showConfirm]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl max-h-[95vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4 shrink-0">{t('settings.title')}</h2>
        <div className="space-y-4 overflow-y-auto flex-1 pr-1 scrollbar-thin">
          {/* ====== Appearance ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryAppearance')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.language')}</label>
                <select
                  value={settings.language}
                  onChange={e => {
                    const lng = e.target.value as Locale;
                    setSettings(s => ({ ...s, language: lng }));
                    i18n.changeLanguage(lng);
                  }}
                  className="w-full custom-select px-3 py-2 border border-panel-border rounded-lg text-sm text-panel-text"
                >
                  {SUPPORTED_LOCALES.map(loc => (
                    <option key={loc} value={loc}>{t('lang.' + loc)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.theme')}</label>
                <select
                  value={settings.theme}
                  onChange={e => {
                    const thm = e.target.value as Theme;
                    setSettings(s => ({ ...s, theme: thm }));
                    applyTheme(thm);
                  }}
                  className="w-full custom-select px-3 py-2 border border-panel-border rounded-lg text-sm text-panel-text"
                >
                  {(['dark', 'light', 'system'] as Theme[]).map(thm => (
                    <option key={thm} value={thm}>{t('settings.theme' + thm.charAt(0).toUpperCase() + thm.slice(1))}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ====== Browsing ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryBrowsing')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.pageSize')}</label>
                <select
                  value={settings.page_size}
                  onChange={e => setSettings(s => ({ ...s, page_size: parseInt(e.target.value) }))}
                  className="w-full custom-select px-3 py-2 border border-panel-border rounded-lg text-sm text-panel-text"
                >
                  {[10, 20, 30, 40, 50].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-xs text-panel-muted mt-1">{t('settings.pageSizeHint')}</p>
              </div>
            </div>
          </div>

          {/* ====== Window ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryWindow')}</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
                <div>
                  <div className="text-sm text-panel-text">{t('settings.alwaysOnTop')}</div>
                  <div className="text-xs text-panel-muted">{t('settings.alwaysOnTopHint')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.always_on_top}
                  onChange={e => setSettings(s => ({ ...s, always_on_top: e.target.checked }))}
                  className="w-4 h-4 text-panel-accent"
                />
              </label>
            </div>
          </div>

          {/* ====== Behavior ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryBehavior')}</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
                <div>
                  <div className="text-sm text-panel-text">{t('settings.autoPaste')}</div>
                  <div className="text-xs text-panel-muted">{t('settings.autoPasteHint')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.auto_paste}
                  onChange={e => setSettings(s => ({ ...s, auto_paste: e.target.checked }))}
                  className="w-4 h-4 text-panel-accent"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
                <div>
                  <div className="text-sm text-panel-text">{t('settings.autoStart')}</div>
                  <div className="text-xs text-panel-muted">{t('settings.autoStartHint')}</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.auto_start}
                  onChange={e => setSettings(s => ({ ...s, auto_start: e.target.checked }))}
                  className="w-4 h-4 text-panel-accent"
                />
              </label>
            </div>
          </div>

          {/* ====== Storage ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryStorage')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.historyLimit')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxItemsStr}
                  onChange={e => { setMaxItemsStr(e.target.value.replace(/\D/g, '')); setErrors(e => ({ ...e, items: undefined })); }}
                  className={`w-full px-3 py-2 bg-panel-card border rounded-lg text-sm text-panel-text ${errors.items ? 'border-red-500/50' : 'border-panel-border'}`}
                />
                {errors.items && <p className="text-xs text-red-400 mt-1">{errors.items}</p>}
                <p className="text-xs text-panel-muted mt-1">{t('settings.historyRange')}</p>
              </div>
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.imageLimit')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={maxImagesStr}
                  onChange={e => { setMaxImagesStr(e.target.value.replace(/\D/g, '')); setErrors(e => ({ ...e, images: undefined })); }}
                  className={`w-full px-3 py-2 bg-panel-card border rounded-lg text-sm text-panel-text ${errors.images ? 'border-red-500/50' : 'border-panel-border'}`}
                />
                {errors.images && <p className="text-xs text-red-400 mt-1">{errors.images}</p>}
                <p className="text-xs text-panel-muted mt-1">{t('settings.imageRange')}</p>
              </div>
            </div>
          </div>

          {/* ====== Shortcut ====== */}
          <div>
            <h3 className="text-xs font-semibold text-panel-muted uppercase tracking-wide border-b border-panel-border pb-1 mb-3">{t('settings.categoryShortcut')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-panel-text block mb-1">{t('settings.hotkey')}</label>
                <input
                  type="text"
                  value={settings.hotkey}
                  readOnly
                  className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-muted"
                />
                <p className="text-xs text-panel-muted mt-1">{t('settings.hotkeyHint')}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4 shrink-0">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">
            {dirty ? t('settings.cancel') : t('settings.close')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>

        {/* Unsaved changes confirmation */}
        {showConfirm && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl" onClick={() => setShowConfirm(false)}>
            <div className="bg-panel-bg border border-panel-border rounded-lg p-4 shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
              <p className="text-sm text-panel-text mb-3">{t('settings.dirtyConfirm')}</p>
              <div className="flex justify-end gap-2">
                <button onClick={handleDiscard} className="px-3 py-1.5 text-xs text-panel-muted hover:text-panel-text">{t('settings.discard')}</button>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-panel-accent text-white rounded hover:opacity-90">{t('settings.save')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
