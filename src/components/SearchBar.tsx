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
  disabled?: boolean;
}

export default function SearchBar({
  keyword, onKeywordChange,
  typeFilter, onTypeFilterChange,
  dateFilter, onDateFilterChange,
  customDateFrom, onCustomDateFromChange,
  customDateTo, onCustomDateToChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();

  const TYPE_OPTIONS: { value: FilterType; labelKey: string }[] = [
    { value: 'all', labelKey: 'search.typeAll' },
    { value: 'text', labelKey: 'search.typeText' },
    { value: 'image', labelKey: 'search.typeImage' },
    { value: 'file', labelKey: 'search.typeFile' },
    { value: 'template', labelKey: 'search.typeTemplate' },
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
          disabled={disabled}
          className={`w-full pl-9 pr-3 py-2 bg-panel-card border border-panel-border rounded-lg text-sm text-panel-text placeholder-panel-muted focus:outline-none focus:border-panel-accent ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-panel-muted shrink-0">{t('search.typeLabel')}</label>
        <select
          value={typeFilter}
          onChange={e => onTypeFilterChange(e.target.value as FilterType)}
          className="bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent"
        >
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
        <div className="w-px h-4 bg-panel-border" />
        <label className="text-xs text-panel-muted shrink-0">{t('search.dateLabel')}</label>
        <select
          value={dateFilter}
          onChange={e => onDateFilterChange(e.target.value as DateFilter)}
          disabled={disabled}
          className={`bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {DATE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
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
