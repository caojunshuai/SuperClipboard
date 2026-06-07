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
  created_at: string;
  updated_at: string;
}

export interface HistoryQuery {
  keyword: string | null;
  item_type: string | null;
  date_from: string | null;
  date_to: string | null;
  tab: string | null;
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
}

export interface BuildInfo {
  version: string;
  build_time: string;
}

export type TabType = 'all' | 'favorites';
export type FilterType = 'all' | 'text' | 'image' | 'file';
export type DateFilter = 'all' | 'today' | '3days' | '7days' | 'custom';
