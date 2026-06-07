import type { ClipboardItem } from '../../types';
import { parseFilePaths } from '../../utils/format';
import { useTranslation } from 'react-i18next';

interface Props {
  item: ClipboardItem;
  expanded?: boolean;
}

export default function FileCard({ item, expanded }: Props) {
  const { t } = useTranslation();
  const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];

  const displayPaths = expanded ? paths : paths.slice(0, 3);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">{t('card.fileType')}</span>
        <span className="text-xs text-panel-muted">{t('card.filesCount', { count: paths.length })}</span>
      </div>
      <div className="space-y-0.5">
        {displayPaths.map((p, i) => (
          <p key={i} className="text-sm text-panel-text truncate" title={p}>
            📄 {p.split('\\').pop() || p}
          </p>
        ))}
        {!expanded && paths.length > 3 && (
          <p className="text-xs text-panel-muted">{t('card.moreFiles', { count: paths.length - 3 })}</p>
        )}
      </div>
    </div>
  );
}
