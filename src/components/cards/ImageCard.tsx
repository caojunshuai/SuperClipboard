import { useState, useEffect } from 'react';
import type { ClipboardItem } from '../../types';
import { readImageBase64 } from '../../api';

interface Props {
  item: ClipboardItem;
}

export default function ImageCard({ item }: Props) {
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
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">图片</span>
        {item.image_size && <span className="text-xs text-panel-muted">{item.image_size}</span>}
      </div>
      <div className="rounded-md overflow-hidden bg-black/30">
        {!dataUrl && !error && (
          <div className="h-20 flex items-center justify-center text-panel-muted text-xs">加载中...</div>
        )}
        {error && (
          <div className="h-20 flex items-center justify-center text-panel-muted text-xs">🖼 图片</div>
        )}
        {dataUrl && (
          <img
            src={dataUrl}
            alt="screenshot"
            className="w-full max-h-48 object-cover"
          />
        )}
      </div>
    </div>
  );
}
