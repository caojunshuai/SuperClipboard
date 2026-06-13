import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backup, restore } from '../api';
import type { BackupResult, RestoreResult } from '../types';
import { open, save } from '@tauri-apps/plugin-dialog';

interface Props {
  onClose: () => void;
}

function SummaryRow({ label, value, icon, color }: { label: string; value: string; icon?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-panel-muted">{label}</span>
      <span className={`text-xs font-medium tabular-nums flex items-center gap-1.5 ${color ?? 'text-panel-text'}`}>
        {value}
        {icon && <span className="inline-flex items-center justify-center w-3.5">{icon}</span>}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-panel-border" />;
}

function BackupSummary({ result }: { result: BackupResult }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 p-3 rounded-lg bg-panel-card border border-panel-border">
      <p className="text-sm font-medium text-green-400 mb-1">✓ {t('backup.backupSuccessTitle')}</p>
      <SummaryRow label={t('backup.rowTotal')} value={t('backup.rowItems', { count: result.count })} />
    </div>
  );
}

function RestoreSummary({ result }: { result: RestoreResult }) {
  const { t } = useTranslation();

  // Nothing imported at all
  if (result.imported === 0 && result.duplicates === 0) {
    return (
      <div className="mt-4 p-3 rounded-lg bg-panel-card border border-panel-border">
        <p className="text-sm font-medium text-yellow-400 mb-1">⚠ {t('backup.restoreNothingTitle')}</p>
        <SummaryRow label={t('backup.rowExpected')} value={t('backup.rowItems', { count: result.expected })} />
        <p className="text-xs text-panel-muted mt-1">{t('backup.restoreNothingHint')}</p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-3 rounded-lg bg-panel-card border border-panel-border">
      <p className="text-sm font-medium text-green-400 mb-2">✓ {t('backup.restoreSuccessTitle')}</p>

      <SummaryRow label={t('backup.rowExpected')} value={t('backup.rowItems', { count: result.expected })} />
      <SummaryRow
        label={t('backup.rowImported')}
        value={t('backup.rowItems', { count: result.imported })}
        icon="✓"
        color="text-green-400"
      />

      {result.duplicates > 0 && (
        <SummaryRow
          label={t('backup.rowDuplicates')}
          value={t('backup.rowItems', { count: result.duplicates })}
          icon="—"
          color="text-yellow-400"
        />
      )}

      {result.truncated && result.skipped_by_limit > 0 && (
        <SummaryRow
          label={t('backup.rowExceeded')}
          value={t('backup.rowItems', { count: result.skipped_by_limit })}
          icon="!"
          color="text-red-400"
        />
      )}

      {result.truncated && (
        <>
          <Divider />
          <p className="text-xs text-panel-muted">
            {t('backup.restoreLimits', { maxItems: result.max_items, maxImages: result.max_images })}
          </p>
        </>
      )}
    </div>
  );
}

export default function BackupDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ type: 'backup'; result: BackupResult } | { type: 'restore'; result: RestoreResult } | null>(null);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleBackup = async () => {
    try {
      const path = await save({
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: `superclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
      });
      if (!path) return;
      setIsError(false);
      setStatus(null);
      const result = await backup(path as string);
      setStatus({ type: 'backup', result });
    } catch (err: any) {
      setStatus(null);
      setIsError(true);
      setErrorMsg(t('backup.backupError', { error: String(err) }));
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
      setStatus(null);
      const result = await restore(path as string);
      setStatus({ type: 'restore', result });
    } catch (err: any) {
      setStatus(null);
      setIsError(true);
      setErrorMsg(t('backup.restoreError', { error: String(err) }));
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
        {isError && (
          <p className="text-sm mt-4 p-3 rounded-lg bg-red-500/10 text-red-400">{errorMsg}</p>
        )}
        {status && status.type === 'backup' && <BackupSummary result={status.result} />}
        {status && status.type === 'restore' && <RestoreSummary result={status.result} />}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">{t('backup.close')}</button>
        </div>
      </div>
    </div>
  );
}
