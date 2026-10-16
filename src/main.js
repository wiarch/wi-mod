/**
 * Entry Vite. UI clásica en web/ (también la sirve Python/pywebview).
 * Capa nueva: src/services/{storage,api}/
 */
import "../web/styles.css";
import "../web/app.js";

function closeSplash() {
  if (closeSplash.done || !window.__TAURI_INTERNALS__) return;
  closeSplash.done = true;
  import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("destroy_splashscreen"))
    .catch(() => {});
}

window.addEventListener("wimod-ready", closeSplash, { once: true });
setTimeout(closeSplash, 14000);
