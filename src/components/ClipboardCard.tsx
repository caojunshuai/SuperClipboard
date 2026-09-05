import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClipboardItem } from '../types';
import TextCard from './cards/TextCard';
import ImageCard from './cards/ImageCard';
import FileCard from './cards/FileCard';
import SvgIcon from './SvgIcon';
import { truncateText, parseFilePaths, formatTime } from '../utils/format';
import { openImagePreview } from '../api';
import { useContextMenu } from '../hooks/useContextMenu';
import { useNoteEdit } from '../hooks/useNoteEdit';
import { useContentEdit } from '../hooks/useContentEdit';
import { useCardExpand } from '../hooks/useCardExpand';

import editSvg from '../assets/icons/edit.svg?raw';
import pinLineSvg from '../assets/icons/pin-line.svg?raw';
import pinFillSvg from '../assets/icons/pin-fill.svg?raw';
import favoriteFillSvg from '../assets/icons/favorite-fill.svg?raw';
import favoriteLineSvg from '../assets/icons/favorite-line.svg?raw';
import deleteSvg from '../assets/icons/delete.svg?raw';

interface Props {
  item: ClipboardItem;
  deleting?: boolean;
  focused?: boolean;
  onCopy: (item: ClipboardItem) => void;
  onEditingChange: (id: number | null) => void;
  onTogglePin: (id: number) => void;
  onToggleFavorite: (id: number) => void;
  onDelete: (id: number) => void;
  onImageMissing?: (id: number) => void;
}

const TYPE_STYLES: Record<string, string> = {
  text: 'bg-blue-500/20 text-blue-400',
  image: 'bg-green-500/20 text-green-400',
  file: 'bg-orange-500/20 text-orange-400',
};

export default function ClipboardCard({ item, deleting, focused, onCopy, onEditingChange, onTogglePin, onToggleFavorite, onDelete, onImageMissing }: Props) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);

  // Note editing
  const {
    note, editingNote, setEditingNote,
    noteDraft, setNoteDraft, noteInputRef,
    save: handleSaveNote, handleKeyDown: handleNoteKeyDown,
  } = useNoteEdit(item);

  // Content editing (text items only)
  const {
    editingContent, editDraft, setEditDraft,
    displayContent, displayCreatedAt, textareaRef,
    startEdit, save: handleSaveContent, cancel: handleCancelEdit,
    handleKeyDown: handleTextareaKeyDown,
  } = useContentEdit(item, onDelete);

  // Scroll-aware expand/collapse
  const { expanded, setExpanded, floatingCollapse, collapse: handleCollapse } = useCardExpand(cardRef);

  // Report editing state up so the list can gate its shortcuts and clicks
  const anyEditing = editingContent || editingNote;
  useEffect(() => {
    onEditingChange(anyEditing ? item.id : null);
    return () => onEditingChange(null);
  }, [anyEditing, item.id, onEditingChange]);

  // Card context menu (text items only)
  const { pos: cardCtxMenu, openAt: openCardCtxMenu, close: closeCardCtxMenu } =
    useContextMenu({ menuItemClass: '.card-ctx-menu-item' });

  // ---- Content editing handlers ----

  const handleCardContextMenu = (e: React.MouseEvent) => {
    if (item.item_type !== 'text') return;
    e.preventDefault();
    e.stopPropagation();
    openCardCtxMenu(e.clientX, e.clientY);
  };

  const handleMenuEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeCardCtxMenu();
    startEdit();
    setExpanded(true);
  };

  const handleMenuCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeCardCtxMenu();
    onCopy(item);
  };

  const handleMenuDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeCardCtxMenu();
    onDelete(item.id);
  };

  // ---- Metadata string ----
  const getMetadata = () => {
    switch (item.item_type) {
      case 'text':
        return item.char_count
          ? (item.char_count < 1000
              ? t('time.charCount', { count: item.char_count })
              : t('time.charCountK', { count: (item.char_count / 1000).toFixed(1) }))
          : null;
      case 'image':
        return item.image_size || null;
      case 'file': {
        const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];
        return t('card.filesCount', { count: paths.length });
      }
      default:
        return null;
    }
  };

  const metadata = getMetadata();
  const typeKey = {
    text: 'card.textType',
    image: 'card.imageType',
    file: 'card.fileType',
  }[item.item_type];
  const typeStyle = TYPE_STYLES[item.item_type] || TYPE_STYLES.text;

  // ---- Scroll into view when keyboard-focused ----
  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focused]);

  // ---- Action link (bottom bar) ----
  const getActionLink = () => {
    switch (item.item_type) {
      case 'text': {
        const text = item.content || '';
        if (truncateText(text, 3, 200) === text) return null;
        if (expanded && floatingCollapse) return null;
        return {
          label: expanded ? t('card.collapse') : t('card.expand'),
          onClick: expanded ? handleCollapse : (e: React.MouseEvent) => { e.stopPropagation(); setExpanded(true); },
        };
      }
      case 'image':
        return {
          label: t('card.preview'),
          onClick: async (e: React.MouseEvent) => {
            e.stopPropagation();
            const path = item.image_path || item.thumbnail_path;
            if (path) {
              try {
                await openImagePreview(path);
              } catch (err) {
                if (typeof err === 'string' && err === 'Image file not found') {
                  onImageMissing?.(item.id);
                }
              }
            }
          },
        };
      case 'file': {
        const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];
        if (paths.length <= 3) return null;
        if (expanded && floatingCollapse) return null;
        return {
          label: expanded ? t('card.collapse') : t('card.expand'),
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setExpanded(!expanded); },
        };
      }
      default:
        return null;
    }
  };

  const actionLink = getActionLink();

  // ---- Content rendering ----
  const renderContent = () => {
    switch (item.item_type) {
      case 'text':
        if (editingContent) {
          return (
            <div className="space-y-2" onClick={e => e.stopPropagation()}>
              <textarea
                ref={textareaRef}
                value={editDraft}
                onChange={e => setEditDraft(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onBlur={handleCancelEdit}
                className="w-full min-h-[6rem] p-2 bg-panel-bg border border-panel-border rounded text-sm text-panel-text font-mono resize-y focus:outline-none focus:border-panel-accent"
              />
              <div className="flex justify-end gap-2">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleCancelEdit}
                  className="px-3 py-1 text-xs text-panel-muted hover:text-panel-text bg-panel-bg border border-panel-border rounded transition-colors"
                >
                  {t('card.cancelEdit')}
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleSaveContent}
                  className="px-3 py-1 text-xs text-white bg-panel-accent hover:bg-panel-accent/80 rounded transition-colors"
                >
                  {t('card.saveEdit')}
                </button>
              </div>
            </div>
          );
        }
        return <TextCard item={item} expanded={expanded} displayContent={displayContent} />;
      case 'image': return <ImageCard item={item} />;
      case 'file': return <FileCard item={item} expanded={expanded} />;
      default: return null;
    }
  };

  return (
    <>
      <div
        ref={cardRef}
        className={`group relative bg-panel-card border rounded-lg p-3 cursor-pointer hover:bg-panel-hover transition-all duration-200 ${
          deleting ? 'opacity-0 scale-95 pointer-events-none' : ''
        } ${
          focused ? 'border-panel-accent ring-2 ring-panel-accent/40' : 'border-panel-border'
        } ${
          !focused && item.is_pinned ? 'ring-1 ring-panel-accent/50' : ''
        }`}
        onContextMenu={handleCardContextMenu}
        onClick={() => {
          if (editingContent || editingNote) return;
          onCopy(item);
        }}
      >
        {/* ---- Top bar: fixed height so show/hide icons doesn't change card height ---- */}
        <div className="flex items-center gap-1.5 mb-2 min-w-0 h-6">
          <span className={`text-xs px-1.5 py-0 rounded shrink-0 leading-6 ${typeStyle}`}>{t(typeKey)}</span>

          {metadata && (
            <span className="text-xs text-panel-muted shrink-0">{metadata}</span>
          )}

          {/* Separator — only shown when there's a note or editing */}
          {(note || editingNote) && (
            <span className="text-xs text-panel-muted/60 mx-0.5 shrink-0">·</span>
          )}

          {/* Note text / input — takes remaining space */}
          {editingNote ? (
            <input
              ref={noteInputRef}
              type="text"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onBlur={handleSaveNote}
              onKeyDown={handleNoteKeyDown}
              placeholder={t('card.notePlaceholder')}
              className="flex-1 min-w-0 px-1.5 py-0 text-xs bg-panel-card border border-panel-border rounded text-panel-text placeholder-panel-muted/50 focus:outline-none focus:border-panel-accent"
              onClick={e => e.stopPropagation()}
            />
          ) : note ? (
            <span
              className="flex-1 text-xs text-panel-muted truncate min-w-0"
              title={note}
            >
              {note}
            </span>
          ) : (
            <span className="flex-1 min-w-0" />
          )}

          {/* Right-aligned icon group — hidden until hover, always visible when editing */}
          <div className={`items-center gap-0.5 shrink-0 ${editingNote ? 'flex' : 'hidden group-hover:flex'}`}>
            <button
              onClick={e => { e.stopPropagation(); setEditingNote(!editingNote); }}
              className={`p-0.5 rounded shrink-0 leading-6 transition-colors ${editingNote ? 'text-panel-accent' : 'text-panel-muted hover:text-panel-text'}`}
              title={t('card.noteTitle')}
            >
              <SvgIcon raw={editSvg} className="w-3.5 h-3.5 block" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onTogglePin(item.id); }}
              className={`p-0.5 rounded shrink-0 leading-6 transition-all duration-200 active:scale-125 ${item.is_pinned ? 'text-panel-accent' : 'text-panel-muted hover:text-panel-text'}`}
              title={item.is_pinned ? t('card.unpin') : t('card.pin')}
            >
              <SvgIcon raw={item.is_pinned ? pinFillSvg : pinLineSvg} className={`w-3.5 h-3.5 block${item.is_pinned ? ' -rotate-45' : ''}`} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onToggleFavorite(item.id); }}
              className={`p-0.5 rounded shrink-0 leading-6 transition-all duration-200 active:scale-125 ${item.is_favorite ? 'text-yellow-400' : 'text-panel-muted hover:text-panel-text'}`}
              title={item.is_favorite ? t('card.unfavorite') : t('card.favorite')}
            >
              <SvgIcon raw={item.is_favorite ? favoriteFillSvg : favoriteLineSvg} className="w-3.5 h-3.5 block" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(item.id); }}
              className="p-0.5 rounded shrink-0 leading-6 text-panel-muted hover:text-red-400 transition-all duration-200 active:scale-125"
              title={t('card.delete')}
            >
              <SvgIcon raw={deleteSvg} className="w-3.5 h-3.5 block" />
            </button>
          </div>
        </div>

        {/* ---- Content area ---- */}
        {renderContent()}

        {/* ---- Bottom bar: time (left) + source app + action link (right) ---- */}
        <div className="flex items-center mt-2 text-xs">
          <span className="text-panel-muted">{formatTime(displayCreatedAt, t)}</span>
          {item.item_type === 'text' && item.source_app && (
            <>
              <span className="text-panel-muted mx-1.5">·</span>
              <span className="text-panel-muted" title={item.source_app}>
                {item.source_app.replace(/\.exe$/i, '')}
              </span>
            </>
          )}
          {actionLink && (
            <>
              <span className="text-panel-muted mx-1.5">·</span>
              <button
                onClick={actionLink.onClick}
                className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              >
                {actionLink.label}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Floating collapse button — shown when card overflows viewport */}
      {floatingCollapse && (
        <button
          onClick={handleCollapse}
          className="fixed right-4 bottom-12 z-40 px-3 py-1.5 text-xs
                     bg-panel-card/95 backdrop-blur-sm border border-panel-border
                     text-blue-400 hover:text-blue-300 hover:bg-panel-hover
                     rounded-full shadow-lg transition-all duration-200
                     flex items-center gap-1"
        >
          {t('card.collapse')} <span className="text-[10px]">▲</span>
        </button>
      )}

      {/* Card context menu (text items only) */}
      {cardCtxMenu && (
        <div
          className="fixed z-50 bg-panel-card border border-panel-border rounded-lg py-1 shadow-xl min-w-[80px]"
          style={{ left: cardCtxMenu.left, top: cardCtxMenu.top }}
        >
          <button
            onClick={handleMenuEdit}
            className="card-ctx-menu-item w-full text-left px-3 py-1.5 text-xs text-panel-text hover:bg-panel-hover rounded"
          >
            {t('card.editContent')}
          </button>
          <button
            onClick={handleMenuCopy}
            className="card-ctx-menu-item w-full text-left px-3 py-1.5 text-xs text-panel-text hover:bg-panel-hover rounded"
          >
            {t('card.copyContent')}
          </button>
          <button
            onClick={handleMenuDelete}
            className="card-ctx-menu-item w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-panel-hover rounded"
          >
            {t('card.delete')}
          </button>
        </div>
      )}
    </>
  );
}
