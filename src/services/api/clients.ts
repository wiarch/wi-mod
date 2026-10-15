import { fetchExternalApi } from "./fetchExternal";
import type { FetchExternalResponse } from "./types";

/** Atajos tipados por proveedor. */

export function nexusGet(
  path: string,
  apiKey: string,
  query?: Record<string, string>,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({ provider: "nexus", method: "GET", path, apiKey, query });
}

export function nexusPost(
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({ provider: "nexus", method: "POST", path, apiKey, body });
}

export function curseforgeGet(
  path: string,
  apiKey: string,
  query?: Record<string, string>,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({
    provider: "curseforge",
    method: "GET",
    path,
    apiKey,
    query,
  });
}

export function steamGet(
  path: string,
  apiKey: string,
  query?: Record<string, string>,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({ provider: "steam", method: "GET", path, apiKey, query });
}

export function rawgGet(
  path: string,
  apiKey: string,
  query?: Record<string, string>,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({ provider: "rawg", method: "GET", path, apiKey, query });
}

/** Modrinth es público; en Web va por fetch CORS, en Desktop por Rust. */
export function modrinthGet(
  path: string,
  query?: Record<string, string>,
): Promise<FetchExternalResponse> {
  return fetchExternalApi({ provider: "modrinth", method: "GET", path, query });
}
