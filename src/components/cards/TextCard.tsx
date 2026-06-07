import type { ClipboardItem } from '../../types';
import { truncateText } from '../../utils/format';

interface Props {
  item: ClipboardItem;
  expanded?: boolean;
}

export default function TextCard({ item, expanded }: Props) {
  const text = item.content || '';
  const displayText = expanded ? text : truncateText(text, 3, 200);

  return (
    <p className={`text-sm text-panel-text whitespace-pre-wrap break-words leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{displayText}</p>
  );
}
