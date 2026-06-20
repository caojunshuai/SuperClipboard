export type ItemType = 'text' | 'image' | 'file';

export interface ClipboardItem {
  id: number;
  item_type: ItemType;
  content: string | null;
  image_path: string | null;
  thumbnail_path: string | null;
  file_paths: string | null;
  source_app: string | null;
  char_count: number | null;
  image_size: string | null;
  is_pinned: boolean;
  is_favorite: boolean;
  metadata: string | null;
  note: string | null;
  image_exists: boolean;
  copy_count: number;
  created_at: string;
  updated_at: string;
}

export interface HistoryQuery {
  keyword: string | null;
  item_type: string | null;
  date_from: string | null;
  date_to: string | null;
  tab: string | null;
  source_app: string | null;
  offset: number;
  limit: number;
}

export interface HistoryResult {
  items: ClipboardItem[];
  total: number;
}

export interface AppSettings {
  hotkey: string;
  max_items: number;
  max_images: number;
  auto_paste: boolean;
  auto_start: boolean;
  language: string;
  always_on_top: boolean;
  page_size: number;
  theme: string;
}

export interface BuildInfo {
  version: string;
  build_time: string;
}

export interface ExportResult {
  count: number;
  output_path: string;
}

export interface BackupResult {
  count: number;
  output_path: string;
}

export interface RestoreResult {
  expected: number;
  imported: number;
  duplicates: number;
  truncated: boolean;
  skipped_by_limit: number;
  max_items: number;
  max_images: number;
}

export interface Template {
  id: number;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateListResult {
  templates: Template[];
}

export type TabType = 'all' | 'favorites';
export type FilterType = 'all' | 'text' | 'image' | 'file' | 'template';
export type DateFilter = 'all' | 'today' | '3days' | '7days' | 'custom';

export interface SourceCount {
  app: string;
  count: number;
}

export interface TopCopiedItem {
  preview: string;
  copy_count: number;
}

export interface TypeCounts {
  text: number;
  image: number;
  file: number;
  template: number;
  total: number;
}

export interface Statistics {
  total_items: number;
  today_hourly: number[];
  week_daily: [string, number][];
  month_daily: [string, number][];
  source_stats: SourceCount[];
  storage_text_bytes: number;
  storage_image_bytes: number;
  storage_db_bytes: number;
  top_copied: TopCopiedItem[];
}
