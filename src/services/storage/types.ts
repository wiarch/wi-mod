/** Tipos alineados con `wi_mod/store.py` (ficha de mod + ajustes). */

export type ThemeId = "nexus" | "modrinth" | "curseforge" | "steam" | "moddb" | "rawg";
export type LanguageId = "es" | "en";

export interface ModFile {
  id: string;
  name?: string;
  size?: number;
  [key: string]: unknown;
}

export interface Mod {
  id: string;
  nexusUrl: string;
  platform: string;
  gameDomain: string;
  gameName: string;
  modId: number | string | null;
  name: string;
  summary: string;
  summaryEs: string;
  author: string;
  category: string;
  categoryEs: string;
  categorySource: string;
  version: string;
  updatedAt: string | null;
  createdAt: string | null;
  endorsements: number;
  downloads: number;
  uniqueDownloads: number;
  pictureFile: string | null;
  pictureUrl: string | null;
  filesUrl: string;
  primaryFileId: number | string | null;
  primaryFileName: string | null;
  modpackId: string;
  modpackCategoryId: string;
  modpack: string;
  modpackNotes: string;
  notes: string;
  techNotes: string;
  compatNotes: string;
  emoji: string;
  skill: string;
  rule: string;
  files: ModFile[];
  addedAt: string;
  fetchedAt: string | null;
  checkedAt: string | null;
  updateAvailable: boolean;
  remoteVersion: string;
  [key: string]: unknown;
}

export interface SettingsProfile {
  name?: string;
  [key: string]: unknown;
}

export interface Settings {
  apiKey: string;
  rawgApiKey: string;
  curseforgeApiKey: string;
  steamApiKey: string;
  language: LanguageId;
  theme: ThemeId;
  profile: SettingsProfile;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  rawgApiKey: "",
  curseforgeApiKey: "",
  steamApiKey: "",
  language: "es",
  theme: "nexus",
  profile: {},
};

export function blankMod(partial: Partial<Mod> = {}): Mod {
  const id =
    partial.id ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`);
  return {
    id,
    nexusUrl: "",
    platform: "Nexus",
    gameDomain: "",
    gameName: "",
    modId: null,
    name: "",
    summary: "",
    summaryEs: "",
    author: "",
    category: "General",
    categoryEs: "",
    categorySource: "nexus",
    version: "",
    updatedAt: null,
    createdAt: null,
    endorsements: 0,
    downloads: 0,
    uniqueDownloads: 0,
    pictureFile: null,
    pictureUrl: null,
    filesUrl: "",
    primaryFileId: null,
    primaryFileName: null,
    modpackId: "",
    modpackCategoryId: "",
    modpack: "",
    modpackNotes: "",
    notes: "",
    techNotes: "",
    compatNotes: "",
    emoji: "",
    skill: "",
    rule: "",
    files: [],
    addedAt: new Date().toISOString(),
    fetchedAt: null,
    checkedAt: null,
    updateAvailable: false,
    remoteVersion: "",
    ...partial,
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const theme = String(data.theme || "nexus").toLowerCase();
  const allowed: ThemeId[] = ["nexus", "modrinth", "curseforge", "steam", "moddb", "rawg"];
  return {
    apiKey: String(data.apiKey || ""),
    rawgApiKey: String(data.rawgApiKey || ""),
    curseforgeApiKey: String(data.curseforgeApiKey || ""),
    steamApiKey: String(data.steamApiKey || ""),
    language: String(data.language || "es").toLowerCase().startsWith("en") ? "en" : "es",
    theme: (allowed.includes(theme as ThemeId) ? theme : "nexus") as ThemeId,
    profile:
      data.profile && typeof data.profile === "object"
        ? (data.profile as SettingsProfile)
        : {},
  };
}
