import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Template } from '../types';
import { truncateText } from '../utils/format';

interface Props {
  template: Template;
  onCopy: (template: Template) => void;
  onUpdate: (id: number, title: string, content: string) => Promise<void>;
  onDelete: (id: number) => void;
}

export default function TemplateCard({ template, onCopy, onUpdate, onDelete }: Props) {
  const { t } = useTranslation();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(template.title);
  const [editContent, setEditContent] = useState(template.content);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Local display state (updated after save)
  const [displayTitle, setDisplayTitle] = useState(template.title);
  const [displayContent, setDisplayContent] = useState(template.content);

  useEffect(() => {
    setDisplayTitle(template.title);
    setDisplayContent(template.content);
  }, [template.title, template.content]);

  useEffect(() => {
    if (editing) {
      setEditTitle(displayTitle);
      setEditContent(displayContent);
      setTimeout(() => titleInputRef.current?.focus(), 0);
    }
  }, [editing]);

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.tmpl-menu-item')) return;
      setCtxMenu(null);
    };
    window.addEventListener('mousedown', dismiss);
    return () => window.removeEventListener('mousedown', dismiss);
  }, [ctxMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const EST_W = 90;
    const EST_H = 100;
    const x = e.clientX + EST_W > window.innerWidth ? e.clientX - EST_W : e.clientX;
    const y = e.clientY + EST_H > window.innerHeight ? e.clientY - EST_H : e.clientY;
    setCtxMenu({ x, y });
  };

  const handleSave = async () => {
    const title = editTitle.trim() || t('template.noTitle');
    setDisplayTitle(title);
    setDisplayContent(editContent);
    setEditing(false);
    await onUpdate(template.id, title, editContent);
  };

  const handleCancel = () => setEditing(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayText = truncateText(displayContent, 3, 200);

  return (
    <>
      <div
        className={`group relative bg-panel-card border border-panel-border rounded-lg p-3 cursor-pointer hover:bg-panel-hover transition-all duration-200 ${editing ? 'cursor-default' : ''}`}
        onContextMenu={handleContextMenu}
        onClick={() => {
          if (editing) return;
          onCopy(template);
        }}
      >
        {editing ? (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('template.editTitle')}
              className="w-full px-2 py-1 text-sm font-medium bg-panel-bg border border-panel-border rounded text-panel-text placeholder-panel-muted/50 focus:outline-none focus:border-panel-accent"
            />
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('template.editContent')}
              className="w-full min-h-[5rem] p-2 bg-panel-bg border border-panel-border rounded text-sm text-panel-text font-mono resize-y focus:outline-none focus:border-panel-accent"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs text-panel-muted hover:text-panel-text bg-panel-bg border border-panel-border rounded transition-colors"
              >
                {t('card.cancelEdit')}
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-xs text-white bg-panel-accent hover:bg-panel-accent/80 rounded transition-colors"
              >
                {t('card.saveEdit')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className={`text-sm font-medium mb-1 truncate text-panel-text ${!displayTitle && 'italic'}`}>
              {displayTitle || t('template.noTitle')}
            </h3>
            <p className={`text-sm whitespace-pre-wrap break-words leading-relaxed line-clamp-3 text-panel-muted ${!displayContent && 'italic'}`}>
              {displayContent ? displayText : t('template.noContent')}
            </p>
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-panel-card border border-panel-border rounded-lg py-1 shadow-xl min-w-[80px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={e => { e.stopPropagation(); setCtxMenu(null); setEditing(true); }}
            className="tmpl-menu-item w-full text-left px-3 py-1.5 text-xs text-panel-text hover:bg-panel-hover rounded"
          >
            {t('card.editContent')}
          </button>
          <button
            onClick={e => { e.stopPropagation(); setCtxMenu(null); onCopy(template); }}
            className="tmpl-menu-item w-full text-left px-3 py-1.5 text-xs text-panel-text hover:bg-panel-hover rounded"
          >
            {t('card.copyContent')}
          </button>
          <button
            onClick={e => { e.stopPropagation(); setCtxMenu(null); onDelete(template.id); }}
            className="tmpl-menu-item w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-panel-hover rounded"
          >
            {t('card.delete')}
          </button>
        </div>
      )}
    </>
  );
}