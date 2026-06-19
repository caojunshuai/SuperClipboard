import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getClipboardHistory, copyToClipboard, autoPaste, togglePin, toggleFavorite, deleteClipboardItem, getSettings } from '../api';
import ClipboardCard from './ClipboardCard';
import type { ClipboardItem, HistoryQuery } from '../types';
import { getDateRange } from '../utils/format';

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
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const queryRef = useRef(query);
  queryRef.current = query;
  const tRef = useRef(t);
  tRef.current = t;
  const fetchGenRef = useRef(0);
  const pageSizeRef = useRef(50);

  const totalPages = Math.max(1, Math.ceil(total / pageSizeRef.current));

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

  // Load settings on mount + panel shown, then fetch
  useEffect(() => {
    getSettings().then(s => {
      setAutoPasteEnabled(s.auto_paste);
      pageSizeRef.current = s.page_size || 50;
      setPage(1);
      fetchPage(1);
    }).catch(() => {});
  }, [refreshKey]);

  // When filters/tabs change, reset to page 1
  useEffect(() => {
    setPage(1);
    fetchPage(1);
  }, [query.keyword, query.item_type, query.date_from, query.date_to, query.tab, query.source_app]);

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

  // When page changes, fetch that page
  useEffect(() => {
    fetchPage(page);
  }, [page]);

  const goToPage = useCallback((p: number) => {
    if (p < 1 || p > totalPages || loading) return;
    setPage(p);
    listRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [totalPages, loading]);

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await copyToClipboard(item.id);
      if (autoPasteEnabled) {
        await autoPaste();
      }
      setToast({ message: tRef.current('list.copied'), type: 'success' });
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 600);
    } catch (err) {
      let msg: string;
      if (typeof err === 'string') {
        // Map known Rust errors to i18n keys
        const filesMatch = err.match(/^(\d+) files not found$/);
        if (err === 'Image file not found') {
          msg = tRef.current('list.imageNotFound');
          deleteClipboardItem(item.id).catch(() => {});
          setItems(prev => prev.filter(it => it.id !== item.id));
          setTotal(t => t - 1);
          fetchPage(page);
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
  }, [autoPasteEnabled, onClose, page, fetchPage]);

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
      setTotal(t => t - 1);
      fetchPage(page);
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
  }, [page, fetchPage]);

  // ---- Keyboard navigation ----
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (items.length === 0) return;

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
        if (page < totalPages) goToPage(page + 1);
        break;
      case 'PageUp':
        e.preventDefault();
        if (page > 1) goToPage(page - 1);
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
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1 || loading}
              className="px-2 py-0.5 rounded text-panel-muted hover:text-panel-text hover:bg-panel-card disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              ← {t('list.pagePrev')}
            </button>
            <span className="px-2 text-panel-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages || loading}
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
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin outline-none focus-visible:outline-none"
      >
        {toast && (
          <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg transition-all ${
            toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500 text-white'
          }`}>
            {toast.message}
          </div>
        )}

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
            onCopy={handleCopy}
            onTogglePin={handleTogglePin}
            onToggleFavorite={handleToggleFavorite}
            onDelete={handleDelete}
            onImageMissing={(id: number) => {
              deleteClipboardItem(id).catch(() => {});
              setItems(prev => prev.filter(it => it.id !== id));
              setTotal(t => t - 1);
              fetchPage(page);
              setToast({ message: tRef.current('list.imageNotFound'), type: 'error' });
              setTimeout(() => setToast(null), 4000);
            }}
          />
        ))}
      </div>
      {footer}
    </>
  );
}
