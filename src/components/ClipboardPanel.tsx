import { useState } from 'react';
import SearchBar from './SearchBar';
import TabBar from './TabBar';
import CardList from './CardList';
import type { FilterType, DateFilter, TabType } from '../types';

interface Props {
  refreshKey: number;
  onClose: () => void;
}

export default function ClipboardPanel({ refreshKey, onClose }: Props) {
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [tab, setTab] = useState<TabType>('all');

  return (
    <div className="flex flex-col h-full">
      <SearchBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />
      <TabBar tab={tab} onTabChange={setTab} />
      <CardList
        query={{
          keyword: keyword || null,
          item_type: typeFilter,
          tab,
          date_from: dateFilter,
          date_to: null,
          offset: 0,
          limit: 100,
        }}
        refreshKey={refreshKey}
        onClose={onClose}
      />
    </div>
  );
}
