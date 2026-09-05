import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getClipboardHistory, copyToClipboard, autoPaste, togglePin, toggleFavorite, deleteClipboardItem, onClipboardChanged } from '../api';
import ClipboardCard from './ClipboardCard';
import CopyToast from './CopyToast';
import ScrollArea from './ScrollArea';
import type { ClipboardItem, HistoryQuery } from '../types';
import { getDateRange } from '../utils/format';
import { useSettings } from '../hooks/useSettings';

interface Props {
  query: HistoryQuery;
  refreshKey: number;
  onClose: () => void;
}

function buildQuery(q: HistoryQuery, offset: number, pageSize: number): HistoryQuery {
  const df = q.date_from;
  const KNOWN_FILTERS = ['all', 'today', '3days', '7days'];
  if (!df || KNOWN_FILTERS.includes(df)) {
    const { from, to } = getDateRange(df || 'all');
    return {
      keyword: q.keyword,
      item_type: q.item_type,
      date_from: from,
      date_to: to,
      tab: q.tab,
      source_app: q.source_app,
      limit: pageSize,
      offset,
    };
  }
  // Custom date range — append time so same-day selection works
  const dt = q.date_to;
  return {
    keyword: q.keyword,
    item_type: q.item_type,
    date_from: q.date_from,
    date_to: dt ? `${dt} 23:59:59` : null,
    tab: q.tab,
    source_app: q.source_app,
    limit: pageSize,
    offset,
  };
}

export default function CardList({ query, refreshKey, onClose }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const queryRef = useRef(query);
  queryRef.current = query;
  const pageRef = useRef(page);
  pageRef.current = page;
  const tRef = useRef(t);
  tRef.current = t;
  const fetchGenRef = useRef(0);
  // Lazy init from cached settings avoids a second fetch when page_size
  // happens to differ from the default.
  const { settings } = useSettings();
  const pageSizeRef = useRef(settings?.page_size || 50);

  const totalPages = Math.max(1, Math.ceil(total / pageSizeRef.current));

  // While a card is being edited (content or note), list-level shortcuts and
  // card clicks must not fire. Cards report their editing state here.
  const editingIdRef = useRef<number | null>(null);
  // Set at mousedown-capture so a click that merely dismisses an edit
  // (mousedown → blur-cancel → click) still suppresses the copy.
  const copySuppressRef = useRef(false);
  const handleEditingChange = useCallback((id: number | null) => {
    editingIdRef.current = id;
  }, []);
  const handleMouseDownCapture = useCallback(() => {
    copySuppressRef.current = editingIdRef.current !== null;
  }, []);

  const fetchPage = useCallback(async (pageNum: number) => {
    const gen = ++fetchGenRef.current;
    const ps = pageSizeRef.current;
    const offset = (pageNum - 1) * ps;
    const fetchQuery = buildQuery(queryRef.current, offset, ps);

    setLoading(true);
    try {
      const result = await getClipboardHistory(fetchQuery);
      if (fetchGenRef.current !== gen) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      if (fetchGenRef.current !== gen) return;
      console.error('Failed to fetch clipboard history:', err);
    } finally {
      if (fetchGenRef.current === gen) setLoading(false);
    }
  }, []);

  // ---- Data fetching ----
  // One data effect keyed on [resetToken, page]: query changes, settings
  // changes and refreshKey bump the token (plus reset to page 1); page
  // changes come from pagination. Each state change fetches exactly once.

  // Settings load/save: adopt new page size (a change resets + refetches)
  useEffect(() => {
    if (!settings) return;
    setAutoPasteEnabled(settings.auto_paste);
    const ps = settings.page_size || 50;
    if (ps !== pageSizeRef.current) {
      pageSizeRef.current = ps;
      setPage(1);
      setResetToken(c => c + 1);
    }
  }, [settings]);

  const skipFirstRef = useRef(true);
  // Filter/tab changes: reset to page 1 and refetch
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    setPage(1);
    setResetToken(c => c + 1);
  }, [query.keyword, query.item_type, query.date_from, query.date_to, query.tab, query.source_app]);

  const refreshKeyFirstRef = useRef(true);
  // Panel re-shown / explicit refresh
  useEffect(() => {
    if (refreshKeyFirstRef.current) { refreshKeyFirstRef.current = false; return; }
    setPage(1);
    setResetToken(c => c + 1);
  }, [refreshKey]);

  // When page or the reset token change, fetch that page
  useEffect(() => {
    fetchPage(page);
  }, [page, resetToken, fetchPage]);

  // ---- Live insert of new clipboard items ----
  // The backend emits the full item on every clipboard change. On the
  // unfiltered first page we insert it locally instead of refetching, so
  // the user isn't disrupted while browsing. Filtered views and deeper
  // pages pick the item up on the next refresh.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onClipboardChanged((item) => {
      if (pageRef.current !== 1) return;
      const q = queryRef.current;
      if (q.keyword || (q.item_type && q.item_type !== 'all') ||
          (q.tab && q.tab !== 'all') || (q.source_app && q.source_app !== 'all')) {
        return;
      }
      // Custom date range that excludes the new item
      if (q.date_from && q.date_from !== 'all' && q.date_from !== 'today' &&
          q.date_from !== '3days' && q.date_from !== '7days') {
        const day = item.created_at.slice(0, 10);
        if (day < q.date_from || (q.date_to && day > q.date_to)) return;
      }
      setItems(prev => {
        if (prev.some(i => i.id === item.id)) {
          return prev.map(i => i.id === item.id ? item : i);
        }
        // New item is the newest → first position after pinned items,
        // mirroring the backend ORDER BY is_pinned DESC, created_at DESC
        const pinnedCount = prev.filter(i => i.is_pinned).length;
        const next = [...prev.slice(0, pinnedCount), item, ...prev.slice(pinnedCount)];
        return next.length > pageSizeRef.current ? next.slice(0, pageSizeRef.current) : next;
      });
      setTotal(total => total + 1);
    }).then(fn => {
      if (cancelled) fn(); else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Reset focus when page or filters change
  useEffect(() => {
    setFocusIndex(-1);
  }, [page, query.keyword, query.item_type, query.date_from, query.date_to, query.tab]);

  // Clamp focusIndex when items shrink (e.g. after delete)
  useEffect(() => {
    if (focusIndex >= items.length) {
      setFocusIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, focusIndex]);

  // Auto-focus list when panel opens so keyboard nav works immediately
  useEffect(() => {
    listRef.current?.focus();
  }, [refreshKey]);

  const goToPage = useCallback((p: number) => {
    if (p < 1 || p > totalPages || loading) return;
    setPage(p);
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [totalPages, loading]);

  // Remove an item whose backing image is gone: drop the row (and its
  // orphaned files) so the dead card doesn't resurface on every copy.
  const removeMissingImageItem = useCallback((id: number) => {
    deleteClipboardItem(id).catch(() => {});
    setItems(prev => prev.filter(it => it.id !== id));
    setTotal(total => total - 1);
    fetchPage(pageRef.current);
  }, [fetchPage]);

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await copyToClipboard(item.id);
      if (autoPasteEnabled) {
        await autoPaste();
      }
      setToast({ message: tRef.current('list.copied'), type: 'success' });
      setTimeout(() => {
        setToast(null);
        // Collapse the panel only when the close-after-copy setting is on
        // (default true). When off, the panel stays open after copying.
        if (settings?.close_after_copy ?? true) onClose();
      }, 600);
    } catch (err) {
      let msg: string;
      // Structured CopyError from the backend (models.rs CopyError)
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string; count?: number }).code;
        if (code === 'image_not_found') {
          msg = tRef.current('list.imageNotFound');
          removeMissingImageItem(item.id);
        } else if (code === 'file_not_found') {
          msg = tRef.current('list.fileNotFound');
        } else if (code === 'files_not_found') {
          msg = tRef.current('list.filesNotFound', { count: (err as { count?: number }).count ?? 0 });
        } else {
          msg = tRef.current('list.error');
        }
      } else if (typeof err === 'string') {
        // Legacy string errors (defensive; backend now sends codes)
        const filesMatch = err.match(/^(\d+) files not found$/);
        if (err === 'Image file not found') {
          msg = tRef.current('list.imageNotFound');
          removeMissingImageItem(item.id);
        } else if (err === 'File not found') {
          msg = tRef.current('list.fileNotFound');
        } else if (filesMatch) {
          msg = tRef.current('list.filesNotFound', { count: parseInt(filesMatch[1]) });
        } else {
          msg = err;
        }
      } else {
        msg = tRef.current('list.error');
      }
      setToast({ message: msg, type: 'error' });
      setTimeout(() => setToast(null), 4000);
    }
  }, [autoPasteEnabled, onClose, removeMissingImageItem, settings]);

  // Copy gate for card clicks: swallow the click that dismisses an edit
  // (mousedown → blur-cancel → click), so dismissing never copies.
  const handleCardCopy = useCallback((item: ClipboardItem) => {
    if (copySuppressRef.current) {
      copySuppressRef.current = false;
      return;
    }
    handleCopy(item);
  }, [handleCopy]);

  const handleTogglePin = useCallback(async (id: number) => {
    try {
      const newState = await togglePin(id);
      setItems(prev => {
        const updated = prev.map(i => i.id === id ? { ...i, is_pinned: newState } : i);
        return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    } catch (err) { console.error(err); }
  }, []);

  const handleToggleFavorite = useCallback(async (id: number) => {
    try {
      const newState = await toggleFavorite(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_favorite: newState } : i));
    } catch (err) { console.error(err); }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      setDeletingIds(prev => new Set(prev).add(id));
      await deleteClipboardItem(id);
      await new Promise(r => setTimeout(r, 200));
      // Optimistic: remove locally, then refetch to fill the page gap
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(total => total - 1);
      fetchPage(pageRef.current);
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      console.error(err);
    }
  }, [fetchPage]);

  // ---- Keyboard navigation ----
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    // Editing state lives inside the cards; while active, every key here
    // belongs to the input (the inputs also stopPropagation as backup).
    if (editingIdRef.current !== null) return;

    // Number keys 1-9: quick-select and copy
    if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (idx < items.length) {
        handleCopy(items[idx]);
        setFocusIndex(idx);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex(prev => {
          if (prev >= items.length - 1) return 0;
          return prev + 1;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(prev => {
          if (prev <= 0) return items.length - 1;
          return prev - 1;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < items.length) {
          handleCopy(items[focusIndex]);
        }
        break;
      case 'Delete':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < items.length) {
          handleDelete(items[focusIndex].id);
        }
        break;
      case 'Escape':
        onClose();
        break;
      case 'Home':
        e.preventDefault();
        setFocusIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIndex(items.length - 1);
        break;
      case 'PageDown':
        e.preventDefault();
        goToPage(page === totalPages ? 1 : page + 1);
        break;
      case 'PageUp':
        e.preventDefault();
        goToPage(page === 1 ? totalPages : page - 1);
        break;
    }
  }, [items, focusIndex, handleCopy, handleDelete, onClose, page, totalPages, goToPage]);

  // If current page becomes empty after delete, go to previous page
  useEffect(() => {
    if (items.length === 0 && total > 0 && page > 1) {
      setPage(page - 1);
    }
  }, [items.length, total, page]);

  // If total shrinks so current page no longer exists, go to last page
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const footer = total > 0 && (
    <div className="shrink-0 px-3 py-1 border-t border-panel-border">
      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-panel-muted">
            {t('list.total', { count: total })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page === 1 ? totalPages : page - 1)}
              disabled={loading}
              className="px-2 py-0.5 rounded text-panel-muted hover:text-panel-text hover:bg-panel-card disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              ← {t('list.pagePrev')}
            </button>
            <span className="px-2 text-panel-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page === totalPages ? 1 : page + 1)}
              disabled={loading}
              className="px-2 py-0.5 rounded text-panel-muted hover:text-panel-text hover:bg-panel-card disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              {t('list.pageNext')} →
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center text-xs text-panel-muted">
          {t('list.total', { count: total })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <ScrollArea
        ref={listRef}
        onKeyDown={handleListKeyDown}
        onMouseDownCapture={handleMouseDownCapture}
      >
        {toast && <CopyToast message={toast.message} type={toast.type} />}

        {items.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-panel-muted">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">{t('list.empty')}</p>
            <p className="text-xs mt-1">{t('list.emptyHint')}</p>
          </div>
        )}

        {items.map((item, index) => (
          <ClipboardCard
            key={item.id}
            item={item}
            deleting={deletingIds.has(item.id)}
            focused={index === focusIndex}
            onCopy={handleCardCopy}
            onEditingChange={handleEditingChange}
            onTogglePin={handleTogglePin}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDelete}
            onImageMissing={(id: number) => {
              removeMissingImageItem(id);
              setToast({ message: tRef.current('list.imageNotFound'), type: 'error' });
              setTimeout(() => setToast(null), 4000);
            }}
          />
        ))}
      </ScrollArea>
      {footer}
    </>
  );
}
