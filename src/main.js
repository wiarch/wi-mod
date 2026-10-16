/**
 * Entry Vite. UI clásica en web/ (también la sirve Python/pywebview).
 * Capa nueva: src/services/{storage,api}/
 */
import "../web/styles.css";
import "../web/app.js";

const splashAt = performance.now();

function closeSplash() {
  if (closeSplash.armed || !window.__TAURI_INTERNALS__) return;
  closeSplash.armed = true;
  const wait = Math.max(0, 3000 - (performance.now() - splashAt));
  setTimeout(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("destroy_splashscreen"))
      .catch(() => {});
  }, wait);
}

window.addEventListener("wimod-ready", closeSplash, { once: true });
setTimeout(closeSplash, 14000);
