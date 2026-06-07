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
