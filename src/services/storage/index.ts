import { isTauriRuntime } from "../runtime";
import type { StorageAdapter } from "./StorageAdapter";
import { TauriStorageAdapter } from "./TauriStorageAdapter";
import { WebStorageAdapter } from "./WebStorageAdapter";

export type { StorageAdapter } from "./StorageAdapter";
export type { Mod, Settings, ThemeId, LanguageId, ModFile } from "./types";
export { DEFAULT_SETTINGS, blankMod, normalizeSettings } from "./types";
export { TauriStorageAdapter } from "./TauriStorageAdapter";
export { WebStorageAdapter } from "./WebStorageAdapter";
export { isTauriRuntime } from "../runtime";

let singleton: StorageAdapter | null = null;

/**
 * Factory: SQLite (Tauri) o IndexedDB/LocalStorage (navegador / GitHub Pages).
 */
export function getStorageAdapter(): StorageAdapter {
  if (!singleton) {
    singleton = isTauriRuntime()
      ? new TauriStorageAdapter()
      : new WebStorageAdapter();
  }
  return singleton;
}

/** Solo tests. */
export function resetStorageAdapterForTests(): void {
  singleton = null;
}
