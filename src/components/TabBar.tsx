import { useTranslation } from 'react-i18next';
import type { TabType, TabCounts } from '../types';
import starSvg from '../assets/icons/favorite-fill.svg';

interface Props {
  tab: TabType;
  onTabChange: (tab: TabType) => void;
  sourceApp: string;
  onSourceAppChange: (v: string) => void;
  sourceApps: string[];
  showSourceFilter: boolean;
  tabCounts: TabCounts;
}

export default function TabBar({ tab, onTabChange, sourceApp, onSourceAppChange, sourceApps, showSourceFilter, tabCounts }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center border-b border-panel-border px-3">
      <button
        onClick={() => onTabChange('all')}
        className={`px-3 py-2 text-sm border-b-2 transition-colors ${
          tab === 'all'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        {t('tab.all')}
        <span className="ml-1 text-xs text-panel-muted">{tabCounts.all.toLocaleString()}</span>
      </button>
      <button
        onClick={() => onTabChange('favorites')}
        className={`px-3 py-2 text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
          tab === 'favorites'
            ? 'border-panel-accent text-panel-accent'
            : 'border-transparent text-panel-muted hover:text-panel-text'
        }`}
      >
        <img src={starSvg} className="w-4 h-4 block" alt="" />
        {t('tab.favorites')}
        <span className="text-xs text-panel-muted">{tabCounts.favorites.toLocaleString()}</span>
      </button>
      <div className="flex-1" />
      {showSourceFilter && sourceApps.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-panel-muted">{t('search.sourceLabel')}</label>
          <select
            value={sourceApp}
            onChange={e => onSourceAppChange(e.target.value)}
            className="bg-panel-card border border-panel-border rounded-md text-xs text-panel-text px-2 py-1 focus:outline-none focus:border-panel-accent max-w-[130px] truncate"
          >
            <option value="all">{t('search.sourceAll')}</option>
            {sourceApps.map(app => (
              <option key={app} value={app}>{app.replace(/\.exe$/i, '')}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
