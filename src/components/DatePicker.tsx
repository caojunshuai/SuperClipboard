import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string;  // YYYY-MM-DD
  max?: string;
  align?: 'left' | 'right'; // popup alignment
  className?: string;
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ZH_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const EN_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const ZH_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function DatePicker({ value, onChange, min, max, align = 'left', className }: Props) {
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const MONTHS = isZh ? ZH_MONTHS : EN_MONTHS;
  const DAYS = isZh ? ZH_DAYS : EN_DAYS;

  const parseDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return { year: y || 2000, month: (m || 1) - 1, day: d || 1 };
  };

  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return parseDate(value);
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseDate(value));
  }, [value]);

  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewDate.year, viewDate.month, 1).getDay();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const dayCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) dayCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) dayCells.push(d);

  const formatDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const { year, month, day } = parseDate(dateStr);
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const isDisabled = (day: number) => {
    const m = String(viewDate.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${viewDate.year}-${m}-${d}`;
    if (min && dateStr < min) return true;
    if (max && dateStr > max) return true;
    return false;
  };

  const changeMonth = (delta: number) => {
    setViewDate(v => {
      const m = v.month + delta;
      if (m < 0) return { ...v, year: v.year - 1, month: 11 };
      if (m > 11) return { ...v, year: v.year + 1, month: 0 };
      return { ...v, month: m };
    });
  };

  const changeYear = (delta: number) => {
    setViewDate(v => ({ ...v, year: v.year + delta }));
  };

  const selectDay = (day: number) => {
    const m = String(viewDate.month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${viewDate.year}-${m}-${d}`);
    setIsOpen(false);
  };

  const goToToday = () => {
    onChange(todayStr);
    setViewDate({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate() });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1.5 bg-panel-card border border-panel-border rounded text-xs text-panel-text pl-2 pr-2 py-1 hover:border-panel-muted focus:outline-none focus:border-panel-accent min-w-[110px]"
      >
        <span className={value ? '' : 'text-panel-muted'}>
          {value ? formatDisplay(value) : ' '}
        </span>
        <svg className="w-3.5 h-3.5 text-panel-muted shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.5" />
          <path d="M16 2v4M8 2v4" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3 10h18" strokeWidth="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div className={`absolute top-full mt-1 z-50 bg-panel-card border border-panel-border rounded-lg p-3 shadow-xl select-none ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2 gap-0.5">
            <button
              type="button"
              onClick={() => changeYear(-1)}
              className="p-0.5 text-panel-muted hover:text-panel-text rounded"
              title={isZh ? '上一年' : 'Previous year'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-0.5 text-panel-muted hover:text-panel-text rounded"
              title={isZh ? '上一月' : 'Previous month'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm text-panel-text font-medium min-w-[110px] text-center">
              {MONTHS[viewDate.month]} {viewDate.year}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-0.5 text-panel-muted hover:text-panel-text rounded"
              title={isZh ? '下一月' : 'Next month'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => changeYear(1)}
              className="p-0.5 text-panel-muted hover:text-panel-text rounded"
              title={isZh ? '下一年' : 'Next year'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7m-8-14l7 7-7 7" />
              </svg>
            </button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="w-8 h-7 flex items-center justify-center text-xs text-panel-muted">
                {d}
              </div>
            ))}
          </div>
          {/* Day grid */}
          <div className="grid grid-cols-7">
            {dayCells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} className="w-8 h-8" />;
              const m = String(viewDate.month + 1).padStart(2, '0');
              const d = String(day).padStart(2, '0');
              const dateStr = `${viewDate.year}-${m}-${d}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === value;
              const disabled = isDisabled(day);
              return (
                <button
                  key={`${viewDate.year}-${viewDate.month}-${day}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={`w-8 h-8 text-xs rounded-full flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-panel-accent text-white'
                      : isToday
                      ? 'text-panel-accent font-bold'
                      : disabled
                      ? 'text-panel-muted/30 cursor-not-allowed'
                      : 'text-panel-text hover:bg-panel-hover'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {/* Today button */}
          <div className="mt-2 pt-1.5 border-t border-panel-border flex justify-end">
            <button
              type="button"
              onClick={goToToday}
              className="text-xs text-panel-accent hover:text-panel-text"
            >
              {isZh ? '今天' : 'Today'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
