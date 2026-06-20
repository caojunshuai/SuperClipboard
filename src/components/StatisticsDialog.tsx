import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStatistics } from '../api';
import type { Statistics } from '../types';
import ScrollArea from './ScrollArea';

interface Props {
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(1)} ${units[unitIdx]}`;
}

const WEEK_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEK_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StatisticsDialog({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendTab, setTrendTab] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    getStatistics()
      .then(s => { setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Trend chart data ──────────────────────────────────────
  const trendData = (() => {
    if (!stats) return [];
    const isZh = i18n.language.startsWith('zh');
    switch (trendTab) {
      case 'today':
        return stats.today_hourly.map((cnt, hour) => ({
          label: `${hour}`,
          count: cnt,
        }));
      case 'week': {
        const labels = isZh ? WEEK_LABELS_ZH : WEEK_LABELS_EN;
        const map = new Map(stats.week_daily);
        return labels.map((l, i) => {
          // match by position (Mon=0 ... Sun=6)
          const key = stats.week_daily[i]?.[0] ?? '';
          return { label: l, count: map.get(key) ?? 0 };
        });
      }
      case 'month':
        return stats.month_daily.map(([day, cnt]) => ({
          label: day.slice(5), // "06-15"
          count: cnt,
        }));
    }
  })();

  // ── Source app data (top 20 + "others") ───────────────────
  const sourceData = (() => {
    if (!stats) return [];
    const top20 = stats.source_stats.slice(0, 20);
    const othersCount = stats.source_stats.slice(20).reduce((s, x) => s + x.count, 0);
    const result = top20.map(s => ({ name: s.app, count: s.count }));
    if (othersCount > 0) {
      result.push({ name: t('statistics.sourceOther'), count: othersCount });
    }
    const max = Math.max(...result.map(r => r.count), 1);
    return result.map(r => ({ ...r, pct: ((r.count / max) * 100).toFixed(0) }));
  })();

  // ── Storage data ──────────────────────────────────────────
  const storageData = stats ? [
    { label: t('statistics.storageText'), bytes: stats.storage_text_bytes, color: '#3b82f6' },
    { label: t('statistics.storageImage'), bytes: stats.storage_image_bytes, color: '#8b5cf6' },
    { label: t('statistics.storageDb'), bytes: stats.storage_db_bytes, color: '#f59e0b' },
  ] : [];
  const storageMax = Math.max(...storageData.map(s => s.bytes), 1);

  const todayTotal = stats ? stats.today_hourly.reduce((a, b) => a + b, 0) : 0;
  const weekTotal = stats ? stats.week_daily.reduce((a, [, b]) => a + b, 0) : 0;
  const monthTotal = stats ? stats.month_daily.reduce((a, [, b]) => a + b, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel-bg border border-panel-border rounded-xl p-6 w-[calc(100%-2rem)] max-w-[680px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('statistics.title')}</h2>

        <ScrollArea className="pr-1 space-y-5">
          {loading ? (
            <p className="text-sm text-panel-muted text-center py-8">{t('statistics.loading')}</p>
          ) : !stats ? (
            <p className="text-sm text-panel-muted text-center py-8">{t('statistics.emptyData')}</p>
          ) : (
            <>
              {/* ── Overview cards ─────────────────────────── */}
              <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-3">
                {[
                  { label: t('statistics.overviewTotal'), value: stats.total_items },
                  { label: t('statistics.overviewToday'), value: todayTotal },
                  { label: t('statistics.overviewWeek'), value: weekTotal },
                  { label: t('statistics.overviewMonth'), value: monthTotal },
                ].map(card => (
                  <div key={card.label} className="bg-panel-card rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-panel-text">{card.value.toLocaleString()}</div>
                    <div className="text-xs text-panel-muted mt-1">{card.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Trend chart ────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-panel-text">{t('statistics.trendTitle')}</h3>
                  <div className="flex gap-1 bg-panel-card rounded-lg p-0.5">
                    {(['today', 'week', 'month'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setTrendTab(tab)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          trendTab === tab
                            ? 'bg-panel-hover text-panel-text font-medium'
                            : 'text-panel-muted hover:text-panel-text'
                        }`}
                      >
                        {t(`statistics.trendTab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as any)}
                      </button>
                    ))}
                  </div>
                </div>
                {trendData.length > 0 && (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: -8 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ color: '#9ca3af' }}
                        formatter={((value: any) => [value ?? 0, t('statistics.overviewToday')]) as any}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Top copied ────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-panel-text mb-3">{t('statistics.topCopied')}</h3>
                {stats.top_copied && stats.top_copied.length > 0 ? (
                  <div className="space-y-1.5">
                    {stats.top_copied.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 bg-panel-card rounded-lg px-3 py-2">
                        <span className="text-xs font-medium text-panel-muted w-5 shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs text-panel-text flex-1 truncate" title={item.preview}>
                          {item.preview}
                        </span>
                        <span className="text-xs text-blue-400 font-medium shrink-0">
                          ×{item.copy_count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-panel-muted">{t('statistics.emptyData')}</p>
                )}
              </div>

              {/* ── Source apps ────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-panel-text mb-3">{t('statistics.sourceTitle')}</h3>
                {sourceData.length > 0 ? (
                  <div className="space-y-2">
                    {sourceData.map(s => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="text-xs text-panel-text w-20 min-[480px]:w-28 truncate text-right shrink-0" title={s.name}>{s.name}</span>
                        <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden min-w-0">
                          <div
                            className="h-full rounded-full bg-blue-500/60 transition-all"
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-panel-muted w-9 min-[480px]:w-12 shrink-0 text-right">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-panel-muted">{t('statistics.emptyData')}</p>
                )}
              </div>

              {/* ── Storage ────────────────────────────────── */}
              <div className="pb-2">
                <h3 className="text-sm font-semibold text-panel-text mb-3">{t('statistics.storageTitle')}</h3>
                <div className="space-y-2">
                  {storageData.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-xs text-panel-text w-12 shrink-0">{s.label}</span>
                      <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(s.bytes / storageMax) * 100}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <span className="text-xs text-panel-muted w-20 shrink-0 text-right">
                        {formatBytes(s.bytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end mt-4 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs text-panel-muted hover:text-panel-text bg-panel-card rounded-lg hover:bg-panel-hover transition-colors">
            {t('statistics.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
