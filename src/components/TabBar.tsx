import { useTranslation } from 'react-i18next';
import type { TabType } from '../types';
import starSvg from '../assets/icons/favorite-fill.svg';

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
        className={`px-4 py-2 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
          tab === 'favorites'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        <img src={starSvg} className="w-4 h-4 block" alt="" />
        {t('tab.favorites')}
      </button>
    </div>
  );
}
