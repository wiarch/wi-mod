declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** True si el frontend corre dentro del shell Tauri v2. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}
