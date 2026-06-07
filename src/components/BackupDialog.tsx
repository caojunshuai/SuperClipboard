import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backup, restore } from '../api';
import { open } from '@tauri-apps/plugin-dialog';

interface Props {
  onClose: () => void;
}

export default function BackupDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  const handleBackup = async () => {
    try {
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: `superclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
      });
      if (!path) return;
      setIsError(false);
      setStatus(t('backup.backingUp'));
      const msg = await backup(path as string);
      setStatus(msg);
    } catch (err: any) {
      setIsError(true);
      setStatus(t('backup.backupError', { error: String(err) }));
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
      if (!confirm(t('backup.confirmRestore'))) return;
      setIsError(false);
      setStatus(t('backup.restoring'));
      const msg = await restore(path as string);
      setStatus(msg);
    } catch (err: any) {
      setIsError(true);
      setStatus(t('backup.restoreError', { error: String(err) }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('backup.title')}</h2>
        <div className="space-y-4">
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">{t('backup.backupTitle')}</h3>
            <p className="text-xs text-panel-muted mb-3">{t('backup.backupDesc')}</p>
            <button onClick={handleBackup} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
              {t('backup.createBackup')}
            </button>
          </div>
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">{t('backup.restoreTitle')}</h3>
            <p className="text-xs text-panel-muted mb-3">{t('backup.restoreDesc')}</p>
            <button onClick={handleRestore} className="px-4 py-2 text-sm border border-panel-border text-panel-text rounded-lg hover:bg-panel-hover">
              {t('backup.selectFile')}
            </button>
          </div>
        </div>
        {status && (
          <p className={`text-sm mt-4 p-3 rounded-lg ${isError ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
            {status}
          </p>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">{t('backup.close')}</button>
        </div>
      </div>
    </div>
  );
}
