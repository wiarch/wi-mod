import { defineConfig } from "vite";
import { resolve } from "node:path";

const rootDir = resolve(".");

// Entry en src/; UI compartida en web/; brand en public/ → dist/brand/
export default defineConfig({
  root: resolve("src"),
  publicDir: resolve("public"),
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [rootDir] },
    proxy: {
      "/api": "http://127.0.0.1:47621",
      "/media": "http://127.0.0.1:47621",
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: resolve("dist"),
    emptyOutDir: true,
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      input: {
        main: resolve("src/index.html"),
        splashscreen: resolve("src/splash.html"),
      },
    },
  },
});
