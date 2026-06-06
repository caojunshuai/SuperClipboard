import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings as saveSettings } from '../api';
import type { AppSettings } from '../types';

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    hotkey: 'Alt+V',
    max_items: 3000,
    max_images: 500,
    auto_paste: false,
    auto_start: false,
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
      e.items = '请输入不小于 100 的数值';
    } else if (items > 5000) {
      e.items = '上限为 5000';
    }

    if (!maxImagesStr.trim() || isNaN(images) || images < 10) {
      e.images = '请输入不小于 10 的数值';
    } else if (images > 500) {
      e.images = '上限为 500';
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
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">设置</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-panel-text block mb-1">全局快捷键</label>
            <input
              type="text"
              value={settings.hotkey}
              readOnly
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-muted"
            />
            <p className="text-xs text-panel-muted mt-1">默认 Alt+V（当前版本不支持自定义）</p>
          </div>
          <div>
            <label className="text-sm text-panel-text block mb-1">历史记录上限</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={maxItemsStr}
              onChange={e => { setMaxItemsStr(e.target.value.replace(/\D/g, '')); setErrors(e => ({ ...e, items: undefined })); }}
              className={`w-full px-3 py-2 bg-panel-card border rounded-lg text-sm text-panel-text ${errors.items ? 'border-red-500/50' : 'border-panel-border'}`}
            />
            {errors.items && <p className="text-xs text-red-400 mt-1">{errors.items}</p>}
            <p className="text-xs text-panel-muted mt-1">范围 100 - 5000</p>
          </div>
          <div>
            <label className="text-sm text-panel-text block mb-1">图片保留上限</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={maxImagesStr}
              onChange={e => { setMaxImagesStr(e.target.value.replace(/\D/g, '')); setErrors(e => ({ ...e, images: undefined })); }}
              className={`w-full px-3 py-2 bg-panel-card border rounded-lg text-sm text-panel-text ${errors.images ? 'border-red-500/50' : 'border-panel-border'}`}
            />
            {errors.images && <p className="text-xs text-red-400 mt-1">{errors.images}</p>}
            <p className="text-xs text-panel-muted mt-1">范围 10 - 500</p>
          </div>
          <label className="flex items-center justify-between p-3 bg-panel-card rounded-lg cursor-pointer">
            <div>
              <div className="text-sm text-panel-text">选中后自动粘贴</div>
              <div className="text-xs text-panel-muted">选择记录后自动 Ctrl+V</div>
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
              <div className="text-sm text-panel-text">开机自启</div>
              <div className="text-xs text-panel-muted">Windows 启动时自动运行</div>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_start}
              onChange={e => setSettings(s => ({ ...s, auto_start: e.target.checked }))}
              className="w-4 h-4 text-panel-accent"
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">
            {dirty ? '取消' : '关闭'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>

        {/* Unsaved changes confirmation */}
        {showConfirm && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl" onClick={() => setShowConfirm(false)}>
            <div className="bg-panel-bg border border-panel-border rounded-lg p-4 shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
              <p className="text-sm text-panel-text mb-3">有未保存的修改，是否保存？</p>
              <div className="flex justify-end gap-2">
                <button onClick={handleDiscard} className="px-3 py-1.5 text-xs text-panel-muted hover:text-panel-text">不保存</button>
                <button onClick={handleSave} className="px-3 py-1.5 text-xs bg-panel-accent text-white rounded hover:opacity-90">保存</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
