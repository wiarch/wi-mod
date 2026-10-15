import type { Mod, Settings } from "./types";

/**
 * Contrato único Desktop (SQLite) / Web (IndexedDB).
 * gameId = Nexus/RAWG `gameDomain` (ej. skyrimspecialedition).
 */
export interface StorageAdapter {
  /** Abre DB / object stores. Idempotente. */
  init(): Promise<void>;

  getMods(gameId?: string): Promise<Mod[]>;
  saveMod(mod: Mod): Promise<void>;
  deleteMod(modId: string): Promise<void>;

  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
}
