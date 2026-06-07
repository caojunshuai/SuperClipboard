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
  );
}
