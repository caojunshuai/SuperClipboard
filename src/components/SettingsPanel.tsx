import { useState, useEffect } from 'react';
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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
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
              type="number"
              value={settings.max_items}
              onChange={e => setSettings(s => ({ ...s, max_items: parseInt(e.target.value) || 3000 }))}
              min={1000} max={10000} step={500}
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text"
            />
          </div>
          <div>
            <label className="text-sm text-panel-text block mb-1">图片保留上限</label>
            <input
              type="number"
              value={settings.max_images}
              onChange={e => setSettings(s => ({ ...s, max_images: parseInt(e.target.value) || 500 }))}
              min={100} max={2000} step={100}
              className="w-full px-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text"
            />
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">关闭</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
            {saved ? '已保存 ✓' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
