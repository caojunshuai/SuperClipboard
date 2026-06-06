import type { ClipboardItem } from '../types';
import TextCard from './cards/TextCard';
import ImageCard from './cards/ImageCard';
import FileCard from './cards/FileCard';

interface Props {
  item: ClipboardItem;
  deleting?: boolean;
  onCopy: (item: ClipboardItem) => void;
  onTogglePin: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ClipboardCard({ item, deleting, onCopy, onTogglePin, onToggleFavorite, onDelete }: Props) {
  const renderContent = () => {
    switch (item.item_type) {
      case 'text': return <TextCard item={item} />;
      case 'image': return <ImageCard item={item} />;
      case 'file': return <FileCard item={item} />;
      default: return null;
    }
  };

  return (
    <div
      className={`group relative bg-panel-card border border-panel-border rounded-lg p-3 cursor-pointer hover:bg-panel-hover transition-all duration-200 ${
        deleting ? 'opacity-0 scale-95 pointer-events-none' : ''
      } ${
        item.is_pinned ? 'ring-1 ring-panel-accent/50' : ''
      }`}
      onClick={() => onCopy(item)}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onTogglePin(item.id); }}
          className={`p-1 rounded text-xs transition-all duration-200 active:scale-125 ${item.is_pinned ? 'text-panel-accent' : 'text-panel-muted hover:text-panel-text'}`}
          title={item.is_pinned ? '取消置顶' : '置顶'}
        >{item.is_pinned ? '📍' : '📌'}</button>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
          className={`p-1 rounded text-xs transition-all duration-200 active:scale-125 ${item.is_favorite ? 'text-yellow-400' : 'text-panel-muted hover:text-panel-text'}`}
          title={item.is_favorite ? '取消收藏' : '收藏'}
        >{item.is_favorite ? '⭐' : '☆'}</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id); }}
          className="p-1 rounded text-xs text-panel-muted hover:text-red-400 transition-all duration-200 active:scale-125"
          title="删除"
        >🗑</button>
      </div>

      {renderContent()}

      <div className="flex items-center justify-between mt-2 text-xs text-panel-muted">
        <span>{formatTime(item.created_at)}</span>
        {item.source_app && <span>{item.source_app}</span>}
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return dateStr;
  }
}
