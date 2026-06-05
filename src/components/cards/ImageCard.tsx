import { useState } from 'react';
import type { ClipboardItem } from '../../types';
import { convertFileSrc } from '@tauri-apps/api/core';

interface Props {
  item: ClipboardItem;
}

export default function ImageCard({ item }: Props) {
  const [loaded, setLoaded] = useState(false);
  const thumbSrc = item.thumbnail_path
    ? convertFileSrc(item.thumbnail_path)
    : (item.image_path ? convertFileSrc(item.image_path) : '');

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">图片</span>
        {item.image_size && <span className="text-xs text-panel-muted">{item.image_size}</span>}
      </div>
      <div className="rounded-md overflow-hidden bg-black/30">
        {!loaded && <div className="h-20 flex items-center justify-center text-panel-muted text-xs">加载中...</div>}
        <img
          src={thumbSrc}
          alt="clipboard"
          className={`w-full max-h-48 object-cover ${loaded ? 'block' : 'hidden'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
