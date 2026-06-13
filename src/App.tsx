import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { onPanelShown, onClipboardChanged, hideWindow, startDrag, getSettings } from './api';
import ClipboardPanel from './components/ClipboardPanel';
import ExportDialog from './components/ExportDialog';
import BackupDialog from './components/BackupDialog';
import SettingsPanel from './components/SettingsPanel';
import AboutDialog from './components/AboutDialog';
import { applyTheme } from './theme';

type DialogType = 'none' | 'export' | 'backup' | 'settings' | 'about';

function App() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogType>('none');
  const [refreshKey, setRefreshKey] = useState(0);
  const titleBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p1 = onPanelShown(() => setRefreshKey(k => k + 1));
    const p2 = onClipboardChanged(() => setRefreshKey(k => k + 1));
    return () => {
      p1.then(fn => fn());
      p2.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    getSettings().then(s => {
      applyTheme(s.theme === 'light' || s.theme === 'system' ? s.theme : 'dark');
    }).catch(() => {});
  }, []);

  // Drag via native mousedown listener.
  // Tauri's official startDragging() doesn't work reliably because its async IPC
  // path (invoke → plugin → event loop → drag_window) loses the mouse gesture
  // context. Our custom start_drag Rust command calls PostMessageW directly.
  // Must use native addEventListener — React synthetic events lose mouse context.
  useEffect(() => {
    const el = titleBarRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      startDrag();
    };

    el.addEventListener('mousedown', onMouseDown);
    return () => el.removeEventListener('mousedown', onMouseDown);
  }, []);

  const handleClose = useCallback(() => {
    setDialog('none');
    hideWindow();
  }, []);

  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden bg-panel-bg">
      {/* Title bar */}
      <div
        ref={titleBarRef}
        className="flex items-center justify-between px-3 py-2 border-b border-panel-border bg-panel-card/50 select-none cursor-grab"
      >
        <span className="text-xs font-medium text-panel-text">SuperClipboard</span>
        <div className="flex gap-1">
          <button onClick={() => setDialog('export')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title={t('export.title')}>📤</button>
          <button onClick={() => setDialog('backup')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title={t('backup.title')}>💾</button>
          <button onClick={() => setDialog('settings')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title={t('settings.title')}>⚙</button>
          <button onClick={() => setDialog('about')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title={t('about.title')}>ℹ️</button>
          <button onClick={handleClose} className="p-1 text-xs text-panel-muted hover:text-red-400"
                  title={t('about.close')}>✕</button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ClipboardPanel refreshKey={refreshKey} onClose={handleClose} />
      </div>

      {/* Dialogs */}
      {dialog === 'export' && <ExportDialog itemIds={[]} onClose={() => setDialog('none')} />}
      {dialog === 'backup' && <BackupDialog onClose={() => setDialog('none')} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => { setDialog('none'); setRefreshKey(k => k + 1); }} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog('none')} />}
    </div>
  );
}

export default App;
