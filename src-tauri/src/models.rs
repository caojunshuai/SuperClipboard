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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub keyword: Option<String>,
    pub item_type: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub tab: Option<String>,
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

fn default_language() -> String {
    // Empty = not set yet; frontend will detect system locale on first launch
    String::new()
}

fn default_true() -> bool {
    true
}

fn default_page_size() -> i64 {
    50
}

fn default_theme() -> String {
    "dark".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+V".to_string(),
            max_items: 3000,
            max_images: 500,
            auto_paste: false,
            auto_start: false,
            language: default_language(),
            always_on_top: true,
            page_size: 50,
            theme: default_theme(),
        }
    }
}
