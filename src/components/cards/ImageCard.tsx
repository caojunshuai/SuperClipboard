import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipboardItem } from '../../types';
import { readImageBase64 } from '../../api';

interface Props {
  item: ClipboardItem;
}

export default function ImageCard({ item }: Props) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const path = item.thumbnail_path || item.image_path;
    if (!path) return;

    readImageBase64(path)
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [item.thumbnail_path, item.image_path]);

  return (
    <div className="rounded-md overflow-hidden bg-black/30">
      {!dataUrl && !error && (
        <div className="h-20 flex items-center justify-center text-panel-muted text-xs">{t('card.loading')}</div>
      )}
      {error && (
        <div className="h-20 flex items-center justify-center text-panel-muted text-xs">{t('card.imageFallback')}</div>
      )}
      {dataUrl && (
        <img
          src={dataUrl}
          alt="screenshot"
          className="w-full max-h-48 object-cover"
        />
      )}
    </div>
  );
}
