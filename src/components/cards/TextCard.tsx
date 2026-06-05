import type { ClipboardItem } from '../../types';
import { truncateText, formatCharCount } from '../../utils/format';

interface Props {
  item: ClipboardItem;
}

export default function TextCard({ item }: Props) {
  const text = item.content || '';
  const preview = truncateText(text, 3, 200);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-panel-accent/20 text-panel-accent rounded">文字</span>
        {item.char_count && (
          <span className="text-xs text-panel-muted">{formatCharCount(item.char_count)}</span>
        )}
      </div>
      <p className="text-sm text-panel-text whitespace-pre-wrap leading-relaxed">{preview}</p>
    </div>
  );
}
