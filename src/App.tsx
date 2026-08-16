import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { onPanelShown, onClipboardChanged, hideWindow, startDrag } from './api';
import ClipboardPanel from './components/ClipboardPanel';
import ExportDialog from './components/ExportDialog';
import BackupDialog from './components/BackupDialog';
import SettingsPanel from './components/SettingsPanel';
import AboutDialog from './components/AboutDialog';
import StatisticsDialog from './components/StatisticsDialog';
import { applyTheme } from './theme';
import i18n from './locales';
import SvgIcon from './components/SvgIcon';
import { useContextMenu } from './hooks/useContextMenu';
import { useSettings } from './hooks/useSettings';

import exportSvg from './assets/icons/export.svg?raw';
import backupSvg from './assets/icons/backup.svg?raw';
import settingsSvg from './assets/icons/settings.svg?raw';
import infoSvg from './assets/icons/info.svg?raw';
import closeSvg from './assets/icons/close.svg?raw';
import chartSvg from './assets/icons/chart.svg?raw';

type DialogType = 'none' | 'export' | 'backup' | 'settings' | 'about' | 'statistics';

function App() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogType>('none');
  const [refreshKey, setRefreshKey] = useState(0);
  const { pos: contextMenu, openAt: openContextMenu, close: closeContextMenu } =
    useContextMenu({ menuItemClass: '.context-menu-item' });
  const { settings } = useSettings();
  const titleBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p1 = onPanelShown(() => setRefreshKey(k => k + 1));
    const p2 = onClipboardChanged(() => setRefreshKey(k => k + 1));
    return () => {
      p1.then(fn => fn());
      p2.then(fn => fn());
    };
  }, []);

  // Apply theme from shared settings — re-runs on any save
  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme === 'light' || settings.theme === 'system' ? settings.theme : 'dark');
  }, [settings]);

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

  // Intercept native context menu — only allow Copy whitelist option
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const sel = window.getSelection()?.toString().trim();
      if (sel) {
        openContextMenu(e.clientX, e.clientY, 90, 40);
      }
    };
    window.addEventListener('contextmenu', onCtx);
    return () => window.removeEventListener('contextmenu', onCtx);
  }, [openContextMenu]);

  const handleContextCopy = useCallback(async () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel) {
      try {
        await navigator.clipboard.writeText(sel);
      } catch {
        document.execCommand('copy');
      }
    }
    closeContextMenu();
  }, [closeContextMenu]);

  const handleClose = useCallback(() => {
    setDialog('none');
    hideWindow();
  }, []);

  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden bg-panel-bg">
      {/* Title bar */}
      <div
        ref={titleBarRef}
        className="flex items-center justify-between px-3 py-2 border-b border-panel-border bg-panel-card/50 select-none"
      >
        <span className="text-sm font-medium text-panel-text">SuperClipboard</span>
        <div className="flex gap-1">
          <button onClick={() => setDialog('export')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
                  title={t('export.title')}><SvgIcon raw={exportSvg} className="w-4 h-4 block" /></button>
          <button onClick={() => setDialog('backup')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
                  title={t('backup.title')}><SvgIcon raw={backupSvg} className="w-4 h-4 block" /></button>
          <button onClick={() => setDialog('settings')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
                  title={t('settings.title')}><SvgIcon raw={settingsSvg} className="w-4 h-4 block" /></button>
          <button onClick={() => setDialog('statistics')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
                  title={t('statistics.title')}><SvgIcon raw={chartSvg} className="w-4 h-4 block" /></button>
          <button onClick={() => setDialog('about')} className="p-1 text-panel-muted hover:text-panel-text transition-colors"
                  title={t('about.title')}><SvgIcon raw={infoSvg} className="w-4 h-4 block" /></button>
          <button onClick={handleClose} className="p-1 text-panel-muted hover:text-red-400 transition-colors"
                  title={t('about.close')}><SvgIcon raw={closeSvg} className="w-4 h-4 block" /></button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ClipboardPanel refreshKey={refreshKey} onClose={handleClose} />
      </div>

      {/* Dialogs */}
      {dialog === 'export' && <ExportDialog itemIds={[]} onClose={() => setDialog('none')} />}
      {dialog === 'backup' && <BackupDialog onClose={() => { setDialog('none'); setRefreshKey(k => k + 1); }} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => { setDialog('none'); setRefreshKey(k => k + 1); }} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog('none')} />}
      {dialog === 'statistics' && <StatisticsDialog onClose={() => setDialog('none')} />}

      {/* Custom context menu — Copy only */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-panel-card border border-panel-border rounded-lg py-1 px-1 shadow-xl min-w-[80px]"
          style={{ left: contextMenu.left, top: contextMenu.top }}
        >
          <button
            onClick={handleContextCopy}
            className="context-menu-item w-full text-left px-3 py-1.5 text-xs text-panel-text hover:bg-panel-hover rounded"
          >
            {i18n.language.startsWith('zh') ? '复制' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
