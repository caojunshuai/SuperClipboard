import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-shell';
import { getBuildInfo } from '../api';
import type { BuildInfo } from '../types';

interface Props {
  onClose: () => void;
}

const FEEDBACK_URL = 'https://github.com/caojunshuai/SuperClipboard/issues';

export default function AboutDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    getBuildInfo().then(setInfo).catch(() => {});
  }, []);

  // ESC key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleFeedback = (e: React.MouseEvent) => {
    e.stopPropagation();
    open(FEEDBACK_URL);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-panel-bg border border-panel-border rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('about.title')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-panel-muted">{t('about.version')}</span>
            <span className="text-panel-text">v{info?.version || '...'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-panel-muted">{t('about.buildTime')}</span>
            <span className="text-panel-text">{info?.build_time || '...'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-panel-muted">{t('about.author')}</span>
            <span className="text-panel-text">SuperClipboard Dev</span>
          </div>
          <div className="pt-2">
            <button
              onClick={handleFeedback}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {t('about.feedback')}
            </button>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-panel-muted hover:text-panel-text">
            {t('about.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
