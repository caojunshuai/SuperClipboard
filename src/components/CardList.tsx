import { useState, useEffect, useCallback, useRef } from 'react';
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

export default function CardList({ query, refreshKey, onClose }: Props) {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [autoPasteEnabled, setAutoPasteEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings().then(s => setAutoPasteEnabled(s.auto_paste)).catch(() => {});
  }, []);

  const fetchItems = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const dateFilter = query.date_from || 'all';
      const { from, to } = getDateRange(dateFilter);
      const q: HistoryQuery = {
        ...query,
        date_from: from,
        date_to: to,
        limit: PAGE_SIZE,
        offset: reset ? 0 : items.length,
      };
      const result = await getClipboardHistory(q);
      if (reset) {
        setItems(result.items);
      } else {
        setItems(prev => [...prev, ...result.items]);
      }
      setTotal(result.total);
      setHasMore(result.items.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to fetch clipboard history:', err);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchItems(true);
  }, [query.keyword, query.item_type, query.date_from, query.tab, refreshKey]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchItems(false);
    }
  }, [loading, hasMore, fetchItems]);

  const handleCopy = useCallback(async (item: ClipboardItem) => {
    try {
      await copyToClipboard(item.id);
      if (autoPasteEnabled) {
        await autoPaste();
      }
      onClose();
    } catch (err) {
      const msg = typeof err === 'string' ? err : '操作失败';
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
      await deleteClipboardItem(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(t => t - 1);
    } catch (err) { console.error(err); }
  }, []);

  return (
    <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-2">
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
          <p className="text-sm">暂无剪切板记录</p>
          <p className="text-xs mt-1">使用 Ctrl+C 复制内容开始记录</p>
        </div>
      )}

      {items.map(item => (
        <ClipboardCard
          key={item.id}
          item={item}
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

      {total > 0 && (
        <div className="text-center text-xs text-panel-muted py-2 border-t border-panel-border mt-2">
          共 {total} 条记录
        </div>
      )}
    </div>
  );
}
