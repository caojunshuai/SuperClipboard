import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getStatistics, getDailyCounts } from '../api';
import type { Statistics } from '../types';
import ScrollArea from './ScrollArea';
import { useModal } from '../hooks/useModal';
import { formatBytes } from '../utils/format';

interface Props {
  onClose: () => void;
}

const WEEK_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEK_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ZH_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CONTRIB_CLASSES = ['bg-contrib-0', 'bg-contrib-1', 'bg-contrib-2', 'bg-contrib-3', 'bg-contrib-4'];

export default function StatisticsDialog({ onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Contribution graph month state ────────────────────────
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-based
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [monthLoading, setMonthLoading] = useState(true);

  useEffect(() => {
    getStatistics()
      .then(s => { setStats(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Fetch daily counts whenever the viewed month changes
  useEffect(() => {
    let cancelled = false;
    setMonthLoading(true);
    getDailyCounts(viewYear, viewMonth)
      .then(m => { if (!cancelled) setMonthCounts(m); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMonthLoading(false); });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth]);

  const { backdropProps, stopPropagation } = useModal(onClose);

  // ── Contribution graph grid (Mon-first calendar month) ────
  const isZh = i18n.language.startsWith('zh');
  const WEEK_LABELS = isZh ? WEEK_LABELS_ZH : WEEK_LABELS_EN;
  const MONTHS = isZh ? ZH_MONTHS : EN_MONTHS;
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateKey = (day: number) => `${viewYear}-${pad(viewMonth)}-${pad(day)}`;

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun..6=Sat
  const firstOffset = firstDow === 0 ? 6 : firstDow - 1;           // 0=Mon..6=Sun
  const gridCells: (number | null)[] = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  const viewMonthTotal = Object.values(monthCounts).reduce((a, b) => a + b, 0);
  const monthMax = Math.max(...Object.values(monthCounts), 0);
  // GitHub-style 4-level green scale, thresholds bucketed by the month max.
  // Sparse months (max <= 4) scale linearly so a single copy doesn't turn dark green.
  const levelOf = (cnt: number): number => {
    if (cnt <= 0) return 0;
    if (monthMax <= 4) return Math.min(4, cnt);
    const t1 = Math.ceil(monthMax / 4);
    const t2 = Math.ceil(monthMax / 2);
    const t3 = Math.ceil((monthMax * 3) / 4);
    return cnt >= t3 ? 4 : cnt >= t2 ? 3 : cnt >= t1 ? 2 : 1;
  };

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;

  const changeMonth = (delta: number) => {
    const m = viewMonth + delta;
    if (m < 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else if (m > 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m);
  };

  const changeYear = (delta: number) => setViewYear(y => y + delta);

  // ── Source app data (top 10) ──────────────────────────────
  const sourceData = (() => {
    if (!stats) return [];
    // Display source app names without the .exe suffix
    const cleanAppName = (app: string) => app.replace(/\.exe$/i, '');
    const result = stats.source_stats.slice(0, 10).map(s => ({ name: cleanAppName(s.app), count: s.count }));
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" {...backdropProps}>
      <div
        className="bg-panel-bg border border-panel-border rounded-xl p-6 w-[calc(100%-2rem)] max-w-[680px] max-h-[90vh] shadow-2xl flex flex-col"
        onClick={stopPropagation}
      >
        {/* Title */}
        <h2 className="text-lg font-semibold text-panel-text mb-4">{t('statistics.title')}</h2>

        <ScrollArea className="space-y-5">
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

              {/* ── Contribution graph (month calendar) ────── */}
              <div>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-panel-text">{t('statistics.trendTitle')}</h3>
                </div>
                <div className="max-w-[490px] mx-auto">
                {/* Month/year switcher, centered over the graph */}
                <div className="flex items-center gap-0.5 bg-panel-card rounded-lg p-0.5 w-fit mx-auto mb-2">
                    <button
                      onClick={() => changeYear(-1)}
                      title={isZh ? '上一年' : 'Previous year'}
                      className="p-1 text-panel-muted hover:text-panel-text rounded-md transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => changeMonth(-1)}
                      title={isZh ? '上一月' : 'Previous month'}
                      className="p-1 text-panel-muted hover:text-panel-text rounded-md transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-xs text-panel-text font-medium min-w-[76px] text-center">
                      {MONTHS[viewMonth - 1]} {viewYear}
                    </span>
                    <button
                      onClick={() => changeMonth(1)}
                      disabled={isCurrentMonth}
                      title={isZh ? '下一月' : 'Next month'}
                      className={`p-1 rounded-md transition-colors ${
                        isCurrentMonth ? 'text-panel-muted/30 cursor-not-allowed' : 'text-panel-muted hover:text-panel-text'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => changeYear(1)}
                      disabled={viewYear >= now.getFullYear()}
                      title={isZh ? '下一年' : 'Next year'}
                      className={`p-1 rounded-md transition-colors ${
                        viewYear >= now.getFullYear() ? 'text-panel-muted/30 cursor-not-allowed' : 'text-panel-muted hover:text-panel-text'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7m-8-14l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-[repeat(7,minmax(0,36px))] gap-1 mb-1 justify-between">
                  {WEEK_LABELS.map(d => (
                    <div key={d} className="w-full h-5 flex items-center justify-center text-[10px] text-panel-muted">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Day grid, colored by copy-count intensity */}
                <div className="grid grid-cols-[repeat(7,minmax(0,36px))] gap-1 justify-between">
                  {gridCells.map((day, i) => {
                    if (day === null) return <div key={`e${i}`} className="w-full aspect-square" />;
                    const key = dateKey(day);
                    const count = monthCounts[key] ?? 0;
                    const level = levelOf(count);
                    const isToday = key === todayStr;
                    return (
                      <div
                        key={key}
                        title={t('statistics.trendDayCount', { count })}
                        className={`w-full aspect-square rounded-[4px] flex items-center justify-center text-[10px] cursor-default select-none transition-colors ${CONTRIB_CLASSES[level]} ${
                          level >= 3 ? 'text-white' : 'text-panel-muted'
                        } ${isToday ? 'ring-2 ring-panel-accent' : ''} hover:ring-2 hover:ring-panel-muted/60`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
                {/* Hover detail / month total + legend */}
                <div className="flex items-center justify-between gap-6 mt-2 flex-wrap">
                  <div className="text-xs text-panel-muted">
                    {monthLoading ? (
                      <span>{t('statistics.loading')}</span>
                    ) : (
                      <span>{t('statistics.trendMonthTotal', { count: viewMonthTotal })}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-panel-muted">
                    <span>{isZh ? '少' : 'Less'}</span>
                    {[0, 1, 2, 3, 4].map(level => (
                      <div key={level} className={`w-2.5 h-2.5 rounded-[2px] ${CONTRIB_CLASSES[level]}`} />
                    ))}
                    <span>{isZh ? '多' : 'More'}</span>
                  </div>
                </div>
                </div>
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
                        <span className="text-xs text-panel-text w-20 min-[480px]:w-24 truncate shrink-0" title={s.name}>{s.name}</span>
                        <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden min-w-0">
                          <div
                            className="h-full rounded-full bg-blue-500/60 transition-all"
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-panel-muted w-14 shrink-0 text-right">
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
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="text-xs text-panel-text w-20 min-[480px]:w-24 shrink-0">{s.label}</span>
                      <div className="flex-1 bg-panel-card rounded-full h-5 overflow-hidden min-w-0">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(s.bytes / storageMax) * 100}%`, backgroundColor: s.color }}
                        />
                      </div>
                      <span className="text-xs text-panel-muted w-14 shrink-0 text-right">
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
