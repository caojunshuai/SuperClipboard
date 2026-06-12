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

const PAGE_SIZE = 50;
const MAX_VISIBLE = 200;

function buildQuery(q: HistoryQuery, offset: number): HistoryQuery {
  const dateFilter = q.date_from || 'all';
  const { from, to } = getDateRange(dateFilter);
  return {
    keyword: q.keyword,
    item_type: q.item_type,
    date_from: from,
    date_to: to,
    tab: q.tab,
    limit: PAGE_SIZE,
    offset,
  };
}

export default function CardList({ query, refreshKey, onClose }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Refs for latest values — avoids stale closures in async callbacks
  const queryRef = useRef(query);
  queryRef.current = query;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const fetchGenRef = useRef(0);

  useEffect(() => {
    getSettings().then(s => setAutoPasteEnabled(s.auto_paste)).catch(() => {});
  }, []);

  // Effect for initial fetch and filter/tab changes.
  // Uses generation counter — immune to React StrictMode double-invocation.
  useEffect(() => {
    const gen = ++fetchGenRef.current;

    const run = async () => {
      const fetchQuery = buildQuery(queryRef.current, 0);
      setLoading(true);
      try {
        const result = await getClipboardHistory(fetchQuery);
        if (fetchGenRef.current !== gen) return;
        setItems(result.items);
        setTotal(result.total);
        setHasMore(result.items.length >= PAGE_SIZE);
      } catch (err) {
        if (fetchGenRef.current !== gen) return;
        console.error('Failed to fetch clipboard history:', err);
      } finally {
        if (fetchGenRef.current === gen) setLoading(false);
      }
    };
    run();
  }, [query.keyword, query.item_type, query.date_from, query.tab, refreshKey]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    const currentLen = itemsRef.current.length;
    const fetchQuery = buildQuery(queryRef.current, currentLen);

    setLoading(true);
    try {
      const result = await getClipboardHistory(fetchQuery);
      const newLen = currentLen + result.items.length;
      const capped = newLen > MAX_VISIBLE;

      setItems(prev => {
        const next = [...prev, ...result.items];
        return next.length > MAX_VISIBLE ? next.slice(0, MAX_VISIBLE) : next;
      });
      setTotal(result.total);
      setHasMore(!capped && result.items.length >= PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await copyToClipboard(item.id);
      if (autoPasteEnabled) {
        await autoPaste();
      }
      onClose();
    } catch (err) {
      const msg = typeof err === 'string' ? err : t('list.error');
      setToast({ message: msg, type: 'error' });
      setTimeout(() => setToast(null), 4000);
    }
  }, [autoPasteEnabled, onClose]);

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
      // Start exit animation
      setDeletingIds(prev => new Set(prev).add(id));
      await deleteClipboardItem(id);
      // Wait for fade-out animation
      await new Promise(r => setTimeout(r, 200));
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(t => t - 1);
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
  }, []);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg transition-all ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'
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

      {items.map(item => (
        <ClipboardCard
          key={item.id}
          item={item}
          deleting={deletingIds.has(item.id)}
          onCopy={handleCopy}
          onTogglePin={handleTogglePin}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
        />
      ))}

      {loading && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-panel-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {hasMore && !loading && (
        <button
          onClick={loadMore}
          className="w-full py-2 text-xs text-panel-muted hover:text-panel-text border border-dashed border-panel-border rounded-lg transition-colors"
        >
          {t('list.loadMore')} ({t('list.showing', { shown: items.length, total })})
        </button>
      )}

      {!hasMore && total > 0 && (
        <div className="text-center text-xs text-panel-muted py-2 border-t border-panel-border mt-2">
          {t('list.total', { count: total })}
        </div>
      )}
    </div>
  );
}
