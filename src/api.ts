import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { HistoryQuery, HistoryResult, ClipboardItem, AppSettings, BuildInfo, ExportResult, BackupResult, RestoreResult } from './types';

export async function getClipboardHistory(query: HistoryQuery): Promise<HistoryResult> {
  return invoke('get_clipboard_history', { query });
}

export async function copyToClipboard(id: number): Promise<void> {
  return invoke('copy_to_clipboard', { id });
}

export async function autoPaste(): Promise<void> {
  return invoke('auto_paste');
}

export async function togglePin(id: number): Promise<boolean> {
  return invoke('toggle_pin', { id });
}

export async function toggleFavorite(id: number): Promise<boolean> {
  return invoke('toggle_favorite', { id });
}

export async function deleteClipboardItem(id: number): Promise<void> {
  return invoke('delete_clipboard_item', { id });
}

export async function deleteClipboardItems(ids: number[]): Promise<void> {
  return invoke('delete_clipboard_items', { ids });
}

export async function exportText(ids: number[], outputPath: string): Promise<ExportResult> {
  return invoke('export_text', { ids, outputPath });
}

export async function exportImages(ids: number[], outputDir: string): Promise<ExportResult> {
  return invoke('export_images', { ids, outputDir });
}

export async function backup(outputPath: string): Promise<BackupResult> {
  return invoke('backup', { outputPath });
}

export async function restore(backupPath: string): Promise<RestoreResult> {
  return invoke('restore', { backupPath });
}

export async function getSettings(): Promise<AppSettings> {
  return invoke('get_settings');
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke('update_settings', { settings });
}

export async function getItemCount(): Promise<number> {
  return invoke('get_item_count');
}

export async function getSourceApps(): Promise<string[]> {
  return invoke('get_source_apps');
}

export function onClipboardChanged(callback: (item: ClipboardItem) => void): Promise<UnlistenFn> {
  return listen<ClipboardItem>('clipboard-changed', (event) => {
    callback(event.payload);
  });
}

export async function hideWindow(): Promise<void> {
  return invoke('hide_window');
}

export async function startDrag(): Promise<void> {
  return invoke('start_drag');
}

export async function readImageBase64(path: string): Promise<string> {
  return invoke('read_image_base64', { path });
}

export async function openImagePreview(path: string): Promise<void> {
  return invoke('open_image_preview', { path });
}

export async function updateContent(id: number, content: string): Promise<string> {
  return invoke('update_content', { id, content });
}

export async function updateNote(id: number, note: string | null): Promise<void> {
  return invoke('update_note', { id, note });
}

export async function getAppVersion(): Promise<string> {
  return invoke('get_app_version');
}

export async function clearAllData(): Promise<number> {
  return invoke('clear_all_data');
}

export async function getBuildInfo(): Promise<BuildInfo> {
  return invoke('get_build_info');
}

export function onPanelShown(callback: () => void): Promise<UnlistenFn> {
  return listen<void>('panel-shown', () => {
    callback();
  });
}
