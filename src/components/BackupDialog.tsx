import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { backup, restore, getAppDirs, onBackupProgress, onRestoreProgress } from '../api';
import type { BackupResult, RestoreResult, AppDirs, TransferProgress } from '../types';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { useModal } from '../hooks/useModal';

// Module-level cache — backup & restore share the same app dirs.
let dirsPromise: Promise<AppDirs> | null = null;
const getDirs = () => (dirsPromise ??= getAppDirs());

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
  const [progress, setProgress] = useState<{ kind: 'backup' | 'restore'; p: TransferProgress } | null>(null);

  // Listen to progress events emitted by the backend transfer loop.
  useEffect(() => {
    let unBackup: UnlistenFn | null = null;
    let unRestore: UnlistenFn | null = null;
    onBackupProgress(p => setProgress({ kind: 'backup', p })).then(fn => { unBackup = fn; });
    onRestoreProgress(p => setProgress({ kind: 'restore', p })).then(fn => { unRestore = fn; });
    return () => { unBackup?.(); unRestore?.(); };
  }, []);

  const handleBackup = async () => {
    try {
      const dirs = await getDirs();
      const path = await save({
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: await join(dirs.backups_dir, `superclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`),
      });
      if (!path) return;
      setIsError(false);
      setStatus(null);
      setProgress({ kind: 'backup', p: { phase: 0, done: 0, total: 1 } });
      const result = await backup(path as string);
      setProgress(null);
      setStatus({ type: 'backup', result });
    } catch (err: any) {
      setStatus(null);
      setProgress(null);
      setIsError(true);
      setErrorMsg(t('backup.backupError', { error: String(err) }));
    }
  };

  const handleRestore = async () => {
    try {
      const dirs = await getDirs();
      const path = await open({
        directory: false,
        multiple: false,
        filters: [{ name: 'Zip', extensions: ['zip'] }],
        defaultPath: dirs.backups_dir,
      });
      if (!path) return;
      if (!confirm(t('backup.confirmRestore'))) return;
      setIsError(false);
      setStatus(null);
      setProgress({ kind: 'restore', p: { phase: 0, done: 0, total: 0 } });
      const result = await restore(path as string);
      setProgress(null);
      setStatus({ type: 'restore', result });
    } catch (err: any) {
      setStatus(null);
      setProgress(null);
      setIsError(true);
      setErrorMsg(t('backup.restoreError', { error: String(err) }));
    }
  };

  // No ESC-to-close: backup/restore may be in flight and the dialog shows the result
  const { backdropProps, stopPropagation } = useModal(onClose, { esc: false });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" {...backdropProps}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={stopPropagation}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('backup.title')}</h2>
        <div className="space-y-4">
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">{t('backup.backupTitle')}</h3>
            <p className="text-xs text-panel-muted mb-3">{t('backup.backupDesc')}</p>
            <button onClick={handleBackup} disabled={progress !== null} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              {t('backup.createBackup')}
            </button>
          </div>
          <div className="p-4 bg-panel-card rounded-lg">
            <h3 className="text-sm font-medium text-panel-text mb-2">{t('backup.restoreTitle')}</h3>
            <p className="text-xs text-panel-muted mb-3">{t('backup.restoreDesc')}</p>
            <button onClick={handleRestore} disabled={progress !== null} className="px-4 py-2 text-sm border border-panel-border text-panel-text rounded-lg hover:bg-panel-hover disabled:opacity-50 disabled:cursor-not-allowed">
              {t('backup.selectFile')}
            </button>
          </div>
        </div>
        {isError && (
          <p className="text-sm mt-4 p-3 rounded-lg bg-red-500/10 text-red-400">{errorMsg}</p>
        )}
        {progress && (
          <div className="mt-4 p-3 rounded-lg bg-panel-card border border-panel-border">
            {(() => {
              const p = progress.p;
              const hasPct = p.total > 0 && (progress.kind === 'restore' ? p.phase !== 1 : true);
              const percent = hasPct ? Math.round((p.done / p.total) * 100) : 0;
              const label =
                progress.kind === 'restore'
                  ? p.phase === 0
                    ? t('backup.progressReading', { percent })
                    : p.phase === 1
                      ? t('backup.progressParsing')
                      : t('backup.progressRestoring', { percent })
                  : p.phase === 0
                    ? t('backup.progressPacking')
                    : t('backup.progressWriting', { percent });
              return (
                <>
                  <div className="text-xs text-panel-muted mb-2">{label}</div>
                  <div className="h-2 bg-panel-hover rounded-full overflow-hidden">
                    {hasPct ? (
                      <div className="h-full bg-panel-accent rounded-full transition-all duration-200" style={{ width: `${percent}%` }} />
                    ) : (
                      <div className="h-full bg-panel-accent rounded-full w-1/3 animate-pulse" />
                    )}
                  </div>
                </>
              );
            })()}
          </div>
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
