import { isTauriRuntime } from "../runtime";
import type { FetchExternalRequest, FetchExternalResponse } from "./types";
import { webFetchExternal } from "./webFetch";

/**
 * Proxy unificado:
 * - Desktop (Tauri): `invoke('fetch_external_api')` → reqwest en Rust (sin CORS).
 * - Web: `window.fetch` (Modrinth / APIs con CORS; Nexus REST suele requerir Desktop).
 */
export async function fetchExternalApi(
  request: FetchExternalRequest,
): Promise<FetchExternalResponse> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<FetchExternalResponse>("fetch_external_api", { request });
  }
  return webFetchExternal(request);
}
