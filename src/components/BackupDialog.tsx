import { useState } from 'react';
import { backup, restore } from '../api';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  onClose: () => void;
}

export default function BackupDialog({ onClose }: Props) {
  const [status, setStatus] = useState('');

  const handleBackup = async () => {
    try {
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: `superclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
      });
      if (!path) return;
      setStatus('备份中...');
      const msg = await backup(path as string);
      setStatus(msg);
    } catch (err: any) {
      setStatus(`备份失败: ${err}`);
    }
  };

  const handleRestore = async () => {
    try {
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      });
      if (!path) return;
      if (!confirm('恢复将清空当前数据，确定继续？')) return;
      setStatus('恢复中...');
      const msg = await restore(path as string);
      setStatus(msg);
    } catch (err: any) {
      setStatus(`恢复失败: ${err}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">备份与恢复</h2>
        <div className="space-y-4">
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">创建备份</h3>
            <p className="text-xs text-panel-muted mb-3">导出所有数据和图片为 .zip 包</p>
            <button onClick={handleBackup} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
              创建备份
            </button>
          </div>
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">恢复备份</h3>
            <p className="text-xs text-panel-muted mb-3">从 .zip 备份包恢复数据（会清空当前数据）</p>
            <button onClick={handleRestore} className="px-4 py-2 text-sm border border-panel-border text-panel-text rounded-lg hover:bg-panel-hover">
              选择备份文件
            </button>
          </div>
        </div>
        {status && (
          <p className={`text-sm mt-4 p-3 rounded-lg ${status.includes('失败') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
            {status}
          </p>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">关闭</button>
        </div>
      </div>
    </div>
  );
}
