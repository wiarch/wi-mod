import type { StorageAdapter } from "./StorageAdapter";
import type { Mod, Settings } from "./types";
import { normalizeSettings } from "./types";

const DB_NAME = "wi-mod";
const DB_VERSION = 1;
const STORE_MODS = "mods";
const STORE_SETTINGS = "settings";
const LS_MODS = "wi-mod-web-mods";
const LS_SETTINGS = "wi-mod-web-settings";
const SETTINGS_KEY = "app";

/**
 * Persistencia Web: IndexedDB, con LocalStorage si IDB no está disponible.
 */
export class WebStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private useLocalStorage = false;
  private ready: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db || this.useLocalStorage) return;
    if (!this.ready) this.ready = this.open();
    await this.ready;
  }

  private async open(): Promise<void> {
    if (typeof indexedDB === "undefined") {
      this.useLocalStorage = true;
      return;
    }
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_MODS)) {
            const mods = db.createObjectStore(STORE_MODS, { keyPath: "id" });
            mods.createIndex("gameDomain", "gameDomain", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
      });
    } catch {
      this.db = null;
      this.useLocalStorage = true;
    }
  }

  async getMods(gameId?: string): Promise<Mod[]> {
    await this.init();
    const domain = String(gameId || "").trim().toLowerCase();
    if (this.useLocalStorage) {
      const all = this.lsReadMods();
      return domain ? all.filter((m) => String(m.gameDomain || "").toLowerCase() === domain) : all;
    }
    const db = this.db!;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MODS, "readonly");
      const store = tx.objectStore(STORE_MODS);
      const req = domain
        ? store.index("gameDomain").getAll(domain)
        : store.getAll();
      req.onsuccess = () => resolve((req.result || []) as Mod[]);
      req.onerror = () => reject(req.error);
    });
  }

  async saveMod(mod: Mod): Promise<void> {
    if (!mod?.id) throw new Error("Mod sin id.");
    await this.init();
    const row: Mod = {
      ...mod,
      gameDomain: String(mod.gameDomain || "").trim().toLowerCase(),
    };
    if (this.useLocalStorage) {
      const all = this.lsReadMods();
      const idx = all.findIndex((m) => m.id === row.id);
      if (idx >= 0) all[idx] = row;
      else all.unshift(row);
      this.lsWriteMods(all);
      return;
    }
    const db = this.db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MODS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_MODS).put(row);
    });
  }

  async deleteMod(modId: string): Promise<void> {
    const id = String(modId || "").trim();
    if (!id) return;
    await this.init();
    if (this.useLocalStorage) {
      this.lsWriteMods(this.lsReadMods().filter((m) => m.id !== id));
      return;
    }
    const db = this.db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MODS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_MODS).delete(id);
    });
  }

  async getSettings(): Promise<Settings> {
    await this.init();
    if (this.useLocalStorage) {
      try {
        return normalizeSettings(JSON.parse(localStorage.getItem(LS_SETTINGS) || "null"));
      } catch {
        return normalizeSettings(null);
      }
    }
    const db = this.db!;
    const row = await new Promise<{ id: string; payload: Settings } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, "readonly");
      const req = tx.objectStore(STORE_SETTINGS).get(SETTINGS_KEY);
      req.onsuccess = () => resolve(req.result as { id: string; payload: Settings } | undefined);
      req.onerror = () => reject(req.error);
    });
    return normalizeSettings(row?.payload ?? null);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.init();
    const payload = normalizeSettings(settings);
    if (this.useLocalStorage) {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(payload));
      return;
    }
    const db = this.db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_SETTINGS).put({ id: SETTINGS_KEY, payload });
    });
  }

  private lsReadMods(): Mod[] {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_MODS) || "[]");
      return Array.isArray(raw) ? (raw as Mod[]) : [];
    } catch {
      return [];
    }
  }

  private lsWriteMods(mods: Mod[]): void {
    localStorage.setItem(LS_MODS, JSON.stringify(mods));
  }
}
