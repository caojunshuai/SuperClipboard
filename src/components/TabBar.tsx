import { useTranslation } from 'react-i18next';
import type { TabType } from '../types';

interface Props {
  tab: TabType;
  onTabChange: (tab: TabType) => void;
}

export default function TabBar({ tab, onTabChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex border-b border-panel-border px-3">
      <button
        onClick={() => onTabChange('all')}
        className={`px-4 py-2 text-sm border-b-2 transition-colors ${
          tab === 'all'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        {t('tab.all')}
      </button>
      <button
        onClick={() => onTabChange('favorites')}
        className={`px-4 py-2 text-sm border-b-2 transition-colors ${
          tab === 'favorites'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        {t('tab.favorites')}
      </button>
    </div>
  );
}
