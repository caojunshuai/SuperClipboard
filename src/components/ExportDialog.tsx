import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportText, exportImages } from '../api';
import type { ExportResult } from '../types';
import { open, save } from '@tauri-apps/plugin-dialog';

interface Props {
  itemIds: number[];
  onClose: () => void;
}

export default function ExportDialog({ itemIds, onClose }: Props) {
  const { t } = useTranslation();
  const [exportMode, setExportMode] = useState<'text' | 'images'>('text');
  const [status, setStatus] = useState<ExportResult | null>(null);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleExport = async () => {
    try {
      if (exportMode === 'text') {
        const path = await save({
          filters: [{ name: 'Text', extensions: ['txt'] }],
          defaultPath: `superclipboard_export_${Date.now()}.txt`,
        });
        if (!path) return;
        setIsError(false);
        const result = await exportText(itemIds, path as string);
        setStatus(result);
      } else {
        const dir = await open({ directory: true, multiple: false });
        if (!dir) return;
        setIsError(false);
        const result = await exportImages(itemIds, dir as string);
        setStatus(result);
      }
    } catch (err: any) {
      setStatus(null);
      setIsError(true);
      setErrorMsg(t('export.error', { error: String(err) }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('export.title')}</h2>
        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'text'} onChange={() => setExportMode('text')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">{t('export.textExport')}</div>
              <div className="text-xs text-panel-muted">{t('export.textExportDesc')}</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 bg-panel-card rounded-lg cursor-pointer hover:bg-panel-hover">
            <input type="radio" checked={exportMode === 'images'} onChange={() => setExportMode('images')}
                   className="text-panel-accent" />
            <div>
              <div className="text-sm text-panel-text">{t('export.imageExport')}</div>
              <div className="text-xs text-panel-muted">{t('export.imageExportDesc')}</div>
            </div>
          </label>
        </div>
        {isError && <p className="text-sm p-3 rounded-lg bg-red-500/10 text-red-400 mb-3">{errorMsg}</p>}
        {status && (
          <p className="text-sm p-3 rounded-lg bg-green-500/10 text-green-400 mb-3">
            {exportMode === 'text'
              ? t('export.textSuccess', { count: status.count })
              : t('export.imageSuccess', { count: status.count })}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">{t('export.cancel')}</button>
          <button onClick={handleExport} className="px-4 py-2 text-sm bg-panel-accent text-white rounded-lg hover:opacity-90">
            {t('export.exportBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
