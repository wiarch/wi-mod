export type ExternalProvider =
  | "nexus"
  | "curseforge"
  | "steam"
  | "rawg"
  | "modrinth";

export type HttpMethod = "GET" | "POST";

export interface FetchExternalRequest {
  provider: ExternalProvider;
  method?: HttpMethod;
  /** Ruta relativa al host del proveedor, ej. `/v1/games/skyrim/mods/1.json` */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Clave del proveedor (desde Settings). Obligatoria en Desktop salvo Modrinth. */
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface FetchExternalResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
}

export const PROVIDER_BASE: Record<ExternalProvider, string> = {
  nexus: "https://api.nexusmods.com",
  curseforge: "https://api.curseforge.com",
  steam: "https://api.steampowered.com",
  rawg: "https://api.rawg.io",
  modrinth: "https://api.modrinth.com",
};
