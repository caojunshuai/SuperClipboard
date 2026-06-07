import { useTranslation } from 'react-i18next';
import type { FilterType, DateFilter } from '../types';

interface Props {
  keyword: string;
  onKeywordChange: (v: string) => void;
  typeFilter: FilterType;
  onTypeFilterChange: (v: FilterType) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (v: DateFilter) => void;
}

export default function SearchBar({
  keyword, onKeywordChange,
  typeFilter, onTypeFilterChange,
  dateFilter, onDateFilterChange,
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
      </div>
    </div>
  );
}
