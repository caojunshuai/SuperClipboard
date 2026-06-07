import type { ClipboardItem } from '../../types';
import { truncateText } from '../../utils/format';
import { useTranslation } from 'react-i18next';

interface Props {
  item: ClipboardItem;
  expanded?: boolean;
}

export default function TextCard({ item, expanded }: Props) {
  const { t } = useTranslation();
  const text = item.content || '';
  const displayText = expanded ? text : truncateText(text, 3, 200);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-panel-accent/20 text-panel-accent rounded">{t('card.textType')}</span>
        {item.char_count && (
          <span className="text-xs text-panel-muted">{item.char_count < 1000 ? t('time.charCount', { count: item.char_count }) : t('time.charCountK', { count: (item.char_count / 1000).toFixed(1) })}</span>
        )}
      </div>
      <p className={`text-sm text-panel-text whitespace-pre-wrap break-words leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{displayText}</p>
    </div>
  );
}
