import { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onPanelShown, onClipboardChanged, hideWindow } from './api';
import ClipboardPanel from './components/ClipboardPanel';
import ExportDialog from './components/ExportDialog';
import BackupDialog from './components/BackupDialog';
import SettingsPanel from './components/SettingsPanel';

type DialogType = 'none' | 'export' | 'backup' | 'settings';

function App() {
  const [dialog, setDialog] = useState<DialogType>('none');
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh data when window is shown or clipboard changes
  useEffect(() => {
    const p1 = onPanelShown(() => setRefreshKey(k => k + 1));
    const p2 = onClipboardChanged(() => setRefreshKey(k => k + 1));
    return () => {
      p1.then(fn => fn());
      p2.then(fn => fn());
    };
  }, []);

  const handleClose = useCallback(() => {
    setDialog('none');
    hideWindow();
  }, []);

  // Drag: start dragging on mousedown in the title bar (not on buttons)
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return; // don't drag from buttons
    e.preventDefault();
    getCurrentWindow().startDragging();
  }, []);

  return (
    <div className="h-full flex flex-col rounded-xl overflow-hidden bg-panel-bg">
      {/* Title bar with drag support */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-panel-border bg-panel-card/50 cursor-grab select-none"
        onMouseDown={handleDragMouseDown}
      >
        <span className="text-xs font-medium text-panel-text">SuperClipboard</span>
        <div className="flex gap-1">
          <button onClick={() => setDialog('export')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title="导出">📤</button>
          <button onClick={() => setDialog('backup')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title="备份/恢复">💾</button>
          <button onClick={() => setDialog('settings')} className="p-1 text-xs text-panel-muted hover:text-panel-text"
                  title="设置">⚙</button>
          <button onClick={handleClose} className="p-1 text-xs text-panel-muted hover:text-red-400"
                  title="关闭">✕</button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ClipboardPanel refreshKey={refreshKey} onClose={handleClose} />
      </div>

      {/* Dialogs */}
      {dialog === 'export' && <ExportDialog itemIds={[]} onClose={() => setDialog('none')} />}
      {dialog === 'backup' && <BackupDialog onClose={() => setDialog('none')} />}
      {dialog === 'settings' && <SettingsPanel onClose={() => setDialog('none')} />}
    </div>
  );
}

export default App;
