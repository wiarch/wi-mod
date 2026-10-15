import type { StorageAdapter } from "./StorageAdapter";
import type { Mod, Settings } from "./types";
import { normalizeSettings } from "./types";

type SqlDatabase = {
  execute: (query: string, bindValues?: unknown[]) => Promise<unknown>;
  select: <T>(query: string, bindValues?: unknown[]) => Promise<T>;
};

const DB_URL = "sqlite:wi-mod.db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mods (
  id TEXT PRIMARY KEY NOT NULL,
  game_domain TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mods_game ON mods(game_domain);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
`;

/**
 * Persistencia Desktop vía @tauri-apps/plugin-sql (SQLite).
 * El schema también se declara en migraciones Rust (src-tauri).
 */
export class TauriStorageAdapter implements StorageAdapter {
  private db: SqlDatabase | null = null;
  private ready: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (!this.ready) this.ready = this.open();
    await this.ready;
  }

  private async open(): Promise<void> {
    const mod = await import("@tauri-apps/plugin-sql");
    const Database = mod.default;
    this.db = (await Database.load(DB_URL)) as SqlDatabase;
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await this.db.execute(stmt);
    }
  }

  private async conn(): Promise<SqlDatabase> {
    await this.init();
    if (!this.db) throw new Error("SQLite no inicializado.");
    return this.db;
  }

  async getMods(gameId?: string): Promise<Mod[]> {
    const db = await this.conn();
    const domain = String(gameId || "").trim().toLowerCase();
    const rows = domain
      ? await db.select<{ id: string; payload: string }[]>(
          "SELECT id, payload FROM mods WHERE game_domain = $1 ORDER BY id",
          [domain],
        )
      : await db.select<{ id: string; payload: string }[]>(
          "SELECT id, payload FROM mods ORDER BY id",
        );
    return rows.map((row) => this.parseMod(row.payload, row.id)).filter(Boolean) as Mod[];
  }

  async saveMod(mod: Mod): Promise<void> {
    if (!mod?.id) throw new Error("Mod sin id.");
    const db = await this.conn();
    const domain = String(mod.gameDomain || "").trim().toLowerCase();
    const payload = JSON.stringify(mod);
    await db.execute(
      `INSERT INTO mods (id, game_domain, payload) VALUES ($1, $2, $3)
       ON CONFLICT(id) DO UPDATE SET game_domain = excluded.game_domain, payload = excluded.payload`,
      [mod.id, domain, payload],
    );
  }

  async deleteMod(modId: string): Promise<void> {
    const id = String(modId || "").trim();
    if (!id) return;
    const db = await this.conn();
    await db.execute("DELETE FROM mods WHERE id = $1", [id]);
  }

  async getSettings(): Promise<Settings> {
    const db = await this.conn();
    const rows = await db.select<{ payload: string }[]>(
      "SELECT payload FROM settings WHERE id = 1 LIMIT 1",
    );
    if (!rows.length) return normalizeSettings(null);
    try {
      return normalizeSettings(JSON.parse(rows[0].payload));
    } catch {
      return normalizeSettings(null);
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    const db = await this.conn();
    const payload = JSON.stringify(normalizeSettings(settings));
    await db.execute(
      `INSERT INTO settings (id, payload) VALUES (1, $1)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      [payload],
    );
  }

  private parseMod(payload: string, fallbackId: string): Mod | null {
    try {
      const data = JSON.parse(payload) as Mod;
      if (!data.id) data.id = fallbackId;
      return data;
    } catch {
      return null;
    }
  }
}
