import { useTranslation } from 'react-i18next';
import type { FilterType, DateFilter } from '../types';
import DatePicker from './DatePicker';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validDate(v: string): string {
  if (!v) return todayStr();
  const year = parseInt(v.slice(0, 4));
  if (isNaN(year) || year < 2000 || year > 2100) return todayStr();
  return v;
}

interface Props {
  keyword: string;
  onKeywordChange: (v: string) => void;
  typeFilter: FilterType;
  onTypeFilterChange: (v: FilterType) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (v: DateFilter) => void;
  customDateFrom: string;
  onCustomDateFromChange: (v: string) => void;
  customDateTo: string;
  onCustomDateToChange: (v: string) => void;
  sourceApp: string;
  onSourceAppChange: (v: string) => void;
  sourceApps: string[];
}

export default function SearchBar({
  keyword, onKeywordChange,
  typeFilter, onTypeFilterChange,
  dateFilter, onDateFilterChange,
  customDateFrom, onCustomDateFromChange,
  customDateTo, onCustomDateToChange,
  sourceApp, onSourceAppChange, sourceApps,
}: Props) {
  const { t } = useTranslation();

  const TYPE_OPTIONS: { value: FilterType; labelKey: string }[] = [
    { value: 'all', labelKey: 'search.typeAll' },
    { value: 'text', labelKey: 'search.typeText' },
    { value: 'image', labelKey: 'search.typeImage' },
    { value: 'file', labelKey: 'search.typeFile' },
  ];

  const DATE_OPTIONS: { value: DateFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'search.dateAll' },
    { value: 'today', labelKey: 'search.dateToday' },
    { value: '3days', labelKey: 'search.date3Days' },
    { value: '7days', labelKey: 'search.date7Days' },
    { value: 'custom', labelKey: 'search.dateCustom' },
  ];

  return (
    <div className="p-3 space-y-2 border-b border-panel-border">
      <div className="relative">
        <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-panel-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full pl-9 pr-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text placeholder-panel-muted focus:outline-none focus:border-panel-accent"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex gap-1">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onTypeFilterChange(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                typeFilter === opt.value
                  ? 'bg-panel-accent text-white'
                  : 'bg-panel-card text-panel-muted hover:text-panel-text'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <div className="w-px bg-panel-border" />
        <select
          value={dateFilter}
          onChange={e => onDateFilterChange(e.target.value as DateFilter)}
          className="bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent"
        >
          {DATE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
        {sourceApps.length > 0 && (
          <>
            <div className="w-px bg-panel-border" />
            <select
              value={sourceApp}
              onChange={e => onSourceAppChange(e.target.value)}
              className="bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent max-w-[120px] truncate"
            >
              <option value="all">{t('search.typeAll')}</option>
              {sourceApps.map(app => (
                <option key={app} value={app}>{app.replace(/\.exe$/i, '')}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-panel-muted shrink-0">{t('search.dateFrom')}</span>
          <DatePicker
            value={customDateFrom}
            onChange={v => onCustomDateFromChange(validDate(v))}
            min="2000-01-01"
            max="2100-12-31"
            align="left"
          />
          <span className="text-xs text-panel-muted shrink-0">{t('search.dateTo')}</span>
          <DatePicker
            value={customDateTo}
            onChange={v => onCustomDateToChange(validDate(v))}
            min="2000-01-01"
            max="2100-12-31"
            align="right"
          />
        </div>
      )}
    </div>
  );
}
