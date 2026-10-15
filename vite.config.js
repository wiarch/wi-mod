import { defineConfig } from "vite";
import { resolve } from "node:path";

// Frontend en src/ → estáticos limpios en dist/ (consumidos por Tauri).
export default defineConfig({
  root: resolve("src"),
  // Iconos/plataforma sin hash: dist/brand/* (referencias /brand/... en app.js)
  publicDir: resolve("public"),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: resolve("dist"),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
