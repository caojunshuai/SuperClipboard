import { useState, useEffect, useCallback } from 'react';
import SearchBar from './SearchBar';
import TabBar from './TabBar';
import CardList from './CardList';
import type { FilterType, DateFilter, TabType } from '../types';
import { getSourceApps } from '../api';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  refreshKey: number;
  onClose: () => void;
}

export default function ClipboardPanel({ refreshKey, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [tab, setTab] = useState<TabType>('all');
  const [customDateFrom, setCustomDateFrom] = useState(todayStr());
  const [customDateTo, setCustomDateTo] = useState(todayStr());
  const [sourceApp, setSourceApp] = useState('all');
  const [sourceApps, setSourceApps] = useState<string[]>([]);

  useEffect(() => {
    getSourceApps().then(setSourceApps).catch(() => {});
  }, [refreshKey]);

  const handleFromChange = useCallback((v: string) => {
    setCustomDateFrom(v);
    if (v > customDateTo) setCustomDateTo(v);
  }, [customDateTo]);

  const handleToChange = useCallback((v: string) => {
    setCustomDateTo(v);
    if (v < customDateFrom) setCustomDateFrom(v);
  }, [customDateFrom]);

  return (
    <div className="flex flex-col h-full">
      <SearchBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        customDateFrom={customDateFrom}
        onCustomDateFromChange={handleFromChange}
        customDateTo={customDateTo}
        onCustomDateToChange={handleToChange}
      />
      <TabBar
        tab={tab}
        onTabChange={setTab}
        sourceApp={sourceApp}
        onSourceAppChange={setSourceApp}
        sourceApps={sourceApps}
        showSourceFilter={typeFilter === 'text'}
      />
      <CardList
        query={{
          keyword: keyword || null,
          item_type: typeFilter,
          tab,
          date_from: dateFilter === 'custom' ? customDateFrom : dateFilter,
          date_to: dateFilter === 'custom' ? customDateTo : null,
          source_app: sourceApp === 'all' ? null : sourceApp,
          offset: 0,
          limit: 100,
        }}
        refreshKey={refreshKey}
        onClose={onClose}
      />
    </div>
  );
}
