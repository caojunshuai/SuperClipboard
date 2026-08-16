/** Format a Date as "YYYY-MM-DD" (local time). */
export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Format a byte count as "1.2 KB" style string with auto unit. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(1)} ${units[unitIdx]}`;
}

/**
 * Format a stored timestamp for display:
 * today → "今天 HH:MM:SS", yesterday → "昨天 HH:MM:SS", older → "YYYY-MM-DD HH:MM:SS".
 */
export function formatTime(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const timeStr = `${hh}:${mm}:${ss}`;

    if (targetDay.getTime() === today.getTime()) {
      return t('time.today', { time: timeStr });
    } else if (targetDay.getTime() === yesterday.getTime()) {
      return t('time.yesterday', { time: timeStr });
    } else {
      return `${toDateStr(d)} ${timeStr}`;
    }
  } catch {
    return dateStr;
  }
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

export function parseFilePaths(filePathsJson: string): string[] {
  try {
    return JSON.parse(filePathsJson);
  } catch {
    return [filePathsJson];
  }
}

/**
 * Format a Date as local-time string matching SQLite datetime('now', 'localtime').
 * Output: "YYYY-MM-DD HH:MM:SS" (no 'T', no timezone suffix).
 * Using ISO UTC (toISOString) would mismatch DB-stored local time, causing
 * incorrect string comparisons across timezone boundaries.
 */
function toLocalTimeStr(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

export function getDateRange(filter: string): { from: string | null; to: string | null } {
  // 'all' means no date filtering — both bounds must be null.
  // Previously we leaked a UTC 'to' bound even for 'all', which mismatched
  // the DB's local-time created_at and excluded everything in UTC+X timezones.
  if (filter === 'all') {
    return { from: null, to: null };
  }

  const now = new Date();
  const to = toLocalTimeStr(now);
  let from: string | null = null;

  switch (filter) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      from = toLocalTimeStr(d);
      break;
    }
    case '3days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 3);
      from = toLocalTimeStr(d);
      break;
    }
    case '7days': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = toLocalTimeStr(d);
      break;
    }
  }

  return { from, to };
}
