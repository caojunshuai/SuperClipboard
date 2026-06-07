import { useState } from 'react';
import type { ClipboardItem } from '../types';
import TextCard from './cards/TextCard';
import ImageCard from './cards/ImageCard';
import FileCard from './cards/FileCard';
import { truncateText, parseFilePaths } from '../utils/format';
import { openImagePreview } from '../api';

interface Props {
  item: ClipboardItem;
  deleting?: boolean;
  onCopy: (item: ClipboardItem) => void;
  onTogglePin: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ClipboardCard({ item, deleting, onCopy, onTogglePin, onToggleFavorite, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Determine whether to show an action link and what it does
  const getActionLink = () => {
    switch (item.item_type) {
      case 'text': {
        const text = item.content || '';
        const preview = truncateText(text, 3, 200);
        if (preview === text) return null; // no truncation needed
        return {
          label: expanded ? '收起' : '展开',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setExpanded(!expanded); },
        };
      }
      case 'image':
        return {
          label: '预览',
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            const path = item.image_path || item.thumbnail_path;
            if (path) openImagePreview(path);
          },
        };
      case 'file': {
        const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];
        if (paths.length <= 3) return null;
        return {
          label: expanded ? '收起' : '展开',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setExpanded(!expanded); },
        };
      }
      default:
        return null;
    }
  };

  const actionLink = getActionLink();

  const renderContent = () => {
    switch (item.item_type) {
      case 'text': return <TextCard item={item} expanded={expanded} />;
      case 'image': return <ImageCard item={item} />;
      case 'file': return <FileCard item={item} expanded={expanded} />;
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

      {/* Bottom bar: action link (left) + time (right) */}
      <div className="flex items-center justify-between mt-2 text-xs">
        <span>
          {actionLink && (
            <button
              onClick={actionLink.onClick}
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
            >
              &lt;{actionLink.label}&gt;
            </button>
          )}
        </span>
        <span className="text-panel-muted">{formatTime(item.created_at)}</span>
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;

    if (targetDay.getTime() === today.getTime()) {
      return `今天 ${timeStr}`;
    } else if (targetDay.getTime() === yesterday.getTime()) {
      return `昨天 ${timeStr}`;
    } else {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day} ${timeStr}`;
    }
  } catch {
    return dateStr;
  }
}
