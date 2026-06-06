import type { ClipboardItem } from '../../types';
import { parseFilePaths } from '../../utils/format';

interface Props {
  item: ClipboardItem;
}

export default function FileCard({ item }: Props) {
  const paths = item.file_paths ? parseFilePaths(item.file_paths) : [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">文件</span>
        <span className="text-xs text-panel-muted">{paths.length} 个文件</span>
      </div>
      <div className="space-y-0.5">
        {paths.slice(0, 3).map((p, i) => (
          <p key={i} className="text-sm text-panel-text truncate" title={p}>
            📄 {p.split('\\').pop() || p}
          </p>
        ))}
        {paths.length > 3 && (
          <p className="text-xs text-panel-muted">...还有 {paths.length - 3} 个文件</p>
        )}
      </div>
    </div>
  );
}
