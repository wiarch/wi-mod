/**
 * Entry Vite. UI clásica en web/ (también la sirve Python/pywebview).
 * Capa nueva: src/services/{storage,api}/
 */
import "../web/styles.css";
import "../web/app.js";

if (window.__TAURI_INTERNALS__) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    getCurrentWindow().onCloseRequested((event) => {
      if (window.wiModClosing) return;
      event.preventDefault();
      if (window.wiModAskQuit) window.wiModAskQuit();
    });
  }).catch(() => {});
}
