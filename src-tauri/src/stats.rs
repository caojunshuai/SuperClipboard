use rusqlite::params;
use crate::models::{SourceCount, Statistics, TopCopiedItem};
use crate::storage::get_conn;

/// Compute statistics for the statistics panel.
/// Runs 7 SQL queries + filesystem size checks.
pub fn get_statistics(app_data_dir: &std::path::Path) -> Result<Statistics, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;

    // Total items
    let total_items: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Today hourly (0..23)
    let today_hourly: Vec<i64> = {
        let mut stmt = conn.prepare(
            "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE date(created_at) = date('now', 'localtime')
             GROUP BY hour ORDER BY hour"
        ).map_err(|e| e.to_string())?;
        let rows: Vec<(i64, i64)> = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();

        let mut hourly = vec![0i64; 24];
        for (hour, cnt) in rows {
            if hour >= 0 && hour < 24 {
                hourly[hour as usize] = cnt;
            }
        }
        hourly
    };

    // Week daily (calendar week Mon-Sun, zero-filled)
    let week_daily: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "WITH RECURSIVE dates(d) AS (
                SELECT date('now', 'localtime',
                    CASE CAST(strftime('%w', 'now', 'localtime') AS INTEGER)
                        WHEN 0 THEN '-6 days'
                        WHEN 1 THEN '0 days'
                        WHEN 2 THEN '-1 days'
                        WHEN 3 THEN '-2 days'
                        WHEN 4 THEN '-3 days'
                        WHEN 5 THEN '-4 days'
                        WHEN 6 THEN '-5 days'
                    END
                )
                UNION ALL
                SELECT date(d, '+1 day')
                FROM dates
                WHERE d < date('now', 'localtime',
                    CASE CAST(strftime('%w', 'now', 'localtime') AS INTEGER)
                        WHEN 0 THEN '0 days'
                        WHEN 1 THEN '6 days'
                        WHEN 2 THEN '5 days'
                        WHEN 3 THEN '4 days'
                        WHEN 4 THEN '3 days'
                        WHEN 5 THEN '2 days'
                        WHEN 6 THEN '1 days'
                    END
                )
            )
            SELECT dates.d AS day, COALESCE(sub.cnt, 0) AS cnt
            FROM dates
            LEFT JOIN (
                SELECT date(created_at) AS day, COUNT(*) AS cnt
                FROM clipboard_items
                WHERE created_at >= date('now', 'localtime',
                    CASE CAST(strftime('%w', 'now', 'localtime') AS INTEGER)
                        WHEN 0 THEN '-6 days'
                        WHEN 1 THEN '0 days'
                        WHEN 2 THEN '-1 days'
                        WHEN 3 THEN '-2 days'
                        WHEN 4 THEN '-3 days'
                        WHEN 5 THEN '-4 days'
                        WHEN 6 THEN '-5 days'
                    END
                )
                GROUP BY day
            ) sub ON dates.d = sub.day
            ORDER BY dates.d"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Month daily
    let month_daily: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT date(created_at) AS day, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
             GROUP BY day ORDER BY day"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Source app stats (top apps by count)
    let source_stats: Vec<SourceCount> = {
        let mut stmt = conn.prepare(
            "SELECT source_app, COUNT(*) AS cnt
             FROM clipboard_items
             WHERE source_app IS NOT NULL AND source_app != ''
             GROUP BY source_app
             ORDER BY cnt DESC"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map([], |row| {
            Ok(SourceCount {
                app: row.get::<_, String>(0)?,
                count: row.get::<_, i64>(1)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect::<Vec<_>>();
        result
    };

    // Storage: text content size
    let storage_text_bytes: u64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM clipboard_items WHERE type = 'text'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;

    // Storage: image + thumbnail files
    let storage_image_bytes: u64 = {
        let mut total: u64 = 0;
        for dir_name in &["images", "thumbnails"] {
            let dir = app_data_dir.join(dir_name);
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            total += meta.len();
                        }
                    }
                }
            }
        }
        total
    };

    // Storage: database file
    let storage_db_bytes: u64 = {
        let db_path = app_data_dir.join("superclipboard.db");
        std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
    };

    // Top copied text items (top 10)
    let top_copied: Vec<TopCopiedItem> = {
        let mut stmt = conn.prepare(
            "SELECT content, copy_count
             FROM clipboard_items
             WHERE type = 'text' AND copy_count > 0
             ORDER BY copy_count DESC
             LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let result: Vec<TopCopiedItem> = stmt.query_map([], |row| {
            Ok(TopCopiedItem {
                preview: row.get::<_, String>(0)?,
                copy_count: row.get::<_, i64>(1)?,
            })
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();
        result
    };

    Ok(Statistics {
        total_items,
        today_hourly,
        week_daily,
        month_daily,
        source_stats,
        storage_text_bytes,
        storage_image_bytes,
        storage_db_bytes,
        top_copied,
    })
}

/// Daily record counts for a given month — powers the calendar indicator dots.
pub fn get_daily_counts(year: i32, month: i32) -> Result<Vec<(String, i64)>, String> {
    let conn = get_conn().lock().map_err(|e| e.to_string())?;
    let month_str = format!("{:04}-{:02}", year, month);
    let mut stmt = conn.prepare(
        "SELECT date(created_at) AS day, COUNT(*) AS cnt
         FROM clipboard_items
         WHERE strftime('%Y-%m', created_at) = ?1
         GROUP BY day ORDER BY day"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![month_str], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok()).collect();
    Ok(rows)
}
