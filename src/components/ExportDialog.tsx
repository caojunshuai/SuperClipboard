import { useState } from 'react';
import { exportText, exportImages } from '../api';
import { open, save } from '@tauri-apps/plugin-dialog';

interface Props {
  itemIds: number[];
  onClose: () => void;
}

export default function ExportDialog({ itemIds, onClose }: Props) {
  const [exportMode, setExportMode] = useState<'text' | 'images'>('text');
  const [status, setStatus] = useState('');

  const handleExport = async () => {
    try {
      if (exportMode === 'text') {
        const path = await save({
          filters: [{ name: 'Text', extensions: ['txt'] }],
          defaultPath: `superclipboard_export_${Date.now()}.txt`,
        });
        if (!path) return;
        const msg = await exportText(itemIds, path as string);
        setStatus(msg);
      } else {
        const dir = await open({ directory: true, multiple: false });
        if (!dir) return;
        const msg = await exportImages(itemIds, dir as string);
        setStatus(msg);
      }
    } catch (err: any) {
      setStatus(`导出失败: ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">导出</h2>
        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'text'} onChange={() => setExportMode('text')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">导出文字</div>
              <div className="text-xs text-panel-muted">合并导出为一个 .txt 文件</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'images'} onChange={() => setExportMode('images')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">导出图片</div>
              <div className="text-xs text-panel-muted">导出为原始 PNG/JPG 文件</div>
            </div>
          </label>
        </div>
        {status && <p className="text-sm text-panel-muted mb-3">{status}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">取消</button>
          <button onClick={handleExport} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
            选择位置并导出
          </button>
        </div>
      </div>
    </div>
  );
}
