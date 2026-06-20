use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ItemType {
    Text,
    Image,
    File,
}

impl ItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ItemType::Text => "text",
            ItemType::Image => "image",
            ItemType::File => "file",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(ItemType::Text),
            "image" => Some(ItemType::Image),
            "file" => Some(ItemType::File),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: ItemType,
    pub content: Option<String>,
    pub image_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_paths: Option<String>,
    pub source_app: Option<String>,
    pub char_count: Option<i64>,
    pub image_size: Option<String>,
    pub is_pinned: bool,
    pub is_favorite: bool,
    pub metadata: Option<String>,
    #[serde(default)]
    pub content_hash: Option<i64>,
    #[serde(default)]
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// Whether the original image file still exists on disk (false → file was deleted).
    /// Not persisted to DB — computed at query time.
    #[serde(default = "default_true")]
    pub image_exists: bool,
    /// How many times this text item has been copied (via panel or clipboard monitor dedup).
    #[serde(default)]
    pub copy_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub keyword: Option<String>,
    pub item_type: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub tab: Option<String>,
    pub source_app: Option<String>,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryResult {
    pub items: Vec<ClipboardItem>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub hotkey: String,
    pub max_items: i64,
    pub max_images: i64,
    pub auto_paste: bool,
    pub auto_start: bool,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    #[serde(default = "default_theme")]
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildInfo {
    pub version: String,
    pub build_time: String,
}

/// Result of an export operation (text/images).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub count: usize,
    pub output_path: String,
}

/// Result of a backup operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub count: usize,
    pub output_path: String,
}

/// Structured result of a restore operation — enables the frontend
/// to display a clean i18n summary rather than a raw log line.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    /// Total items found in the backup archive.
    pub expected: usize,
    /// Items successfully imported (new, non-duplicate, within capacity).
    pub imported: usize,
    /// Items skipped because they already exist in the DB (content-hash dedup).
    pub duplicates: usize,
    /// Whether import stopped early due to capacity limits.
    pub truncated: bool,
    /// Items that could not be imported because the limit was reached.
    /// (expected - imported - duplicates - items_before_truncation)
    pub skipped_by_limit: usize,
    /// Configured max text items (informational, for display).
    pub max_items: i64,
    /// Configured max image items (informational, for display).
    pub max_images: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateListResult {
    pub templates: Vec<Template>,
}

/// Statistics for the statistics panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Statistics {
    pub total_items: i64,
    /// Copy count per hour for today (index 0 = hour 0).
    pub today_hourly: Vec<i64>,
    /// (date_label, count) for this week.
    pub week_daily: Vec<(String, i64)>,
    /// (date_label, count) for this month.
    pub month_daily: Vec<(String, i64)>,
    /// Source app stats, ordered by count descending.
    pub source_stats: Vec<SourceCount>,
    /// Text content storage in bytes.
    pub storage_text_bytes: u64,
    /// Image + thumbnail file storage in bytes.
    pub storage_image_bytes: u64,
    /// Database file size in bytes.
    pub storage_db_bytes: u64,
    /// Top 10 most-copied text items.
    pub top_copied: Vec<TopCopiedItem>,
}

/// Per-source-app count for statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCount {
    pub app: String,
    pub count: i64,
}

/// Top copied text item for statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopCopiedItem {
    /// Truncated content preview (first ~50 chars).
    pub preview: String,
    pub copy_count: i64,
}

/// Counts of items by type, for the clear-data UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeCounts {
    pub text: i64,
    pub image: i64,
    pub file: i64,
    pub template: i64,
    pub total: i64,
}

fn default_language() -> String {
    // Empty = not set yet; frontend will detect system locale on first launch
    String::new()
}

fn default_true() -> bool {
    true
}

fn default_page_size() -> i64 {
    20
}

fn default_theme() -> String {
    "dark".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+V".to_string(),
            max_items: 1000,
            max_images: 100,
            auto_paste: false,
            auto_start: true,
            language: default_language(),
            always_on_top: true,
            page_size: 20,
            theme: default_theme(),
        }
    }
}
