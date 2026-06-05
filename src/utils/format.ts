export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function truncateText(text: string, maxLines: number = 3, maxChars: number = 200): string {
  const lines = text.split('\n');
  let result = '';
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    if (i > 0) result += '\n';
    result += lines[i];
  }
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '...';
  }
  if (lines.length > maxLines) {
    result += '\n...';
  }
  return result;
}

export function formatCharCount(count: number): string {
  if (count < 1000) return `${count} 字`;
  return `${(count / 1000).toFixed(1)}k 字`;
}

export function parseFilePaths(filePathsJson: string): string[] {
  try {
    return JSON.parse(filePathsJson);
  } catch {
    return [filePathsJson];
  }
}

export function getDateRange(filter: string): { from: string | null; to: string | null } {
  const now = new Date();
  const to = now.toISOString().slice(0, 19);
  let from: string | null = null;

  switch (filter) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      from = d.toISOString().slice(0, 19);
      break;
    }
    case '3days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 3);
      from = d.toISOString().slice(0, 19);
      break;
    }
    case '7days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 19);
      break;
    }
  }

  return { from, to };
}
