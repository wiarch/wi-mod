# Migración Python → Tauri v2

Rama `tauri`. UI compartida en `web/`; Vite/Tauri entran por `src/`.

## Estructura

```
wi-mod/
├── web/                      # UI canónica (Python + Vite importan de aquí)
├── src/ + src-tauri/         # Entry Vite / Tauri (Rust)
├── public/brand/             # estáticos Vite → dist/brand/
├── docs/                     # Landing + demo Pages (docs/app)
├── wi_mod/ + app.py          # LEGACY Python (activo hasta corte)
├── requirements.txt          # deps Python
├── scripts/                  # bat + PyInstaller (legacy)
│   ├── wi-mod.bat
│   └── wi-mod.spec
├── data/keys.example.json    # plantilla de claves (data/keys.json gitignored)
├── package.json / vite.config.js
└── .github/workflows/        # build-and-release
```

## Comandos

```bash
npm install
# Rust + WebView2 / WebKitGTK: https://v2.tauri.app/start/prerequisites/
npm run tauri:dev
npm run tauri:build
```

Portable Tauri: `src-tauri/target/release/wi-mod.exe` (+ `data/` al lado).

## Legacy (no borrar aún)

| Pieza | Rol | Al cortar |
|-------|-----|-----------|
| `app.py`, `wi_mod/server.py` | HTTP + pywebview | → commands Rust |
| `scripts/wi-mod.spec`, `scripts/wi-mod.bat`, `requirements.txt` | PyInstaller / dev | eliminar |
| `docs/app` | demo limitada Pages | opcional si gh-pages = `dist/` |

## Storage

`getStorageAdapter()` → Tauri SQLite o IndexedDB. Ver `src/services/storage/`.

## HTTP externo

`fetchExternalApi()` → Desktop `invoke('fetch_external_api')` (reqwest) / Web `fetch`. Ver `src/services/api/` + `src-tauri/src/http_proxy.rs`.

## CI (`.github/workflows/build-and-release.yml`)

| Evento | Web (gh-pages) | Desktop Tauri + draft Release |
|--------|----------------|-------------------------------|
| Push a `main` | siempre | solo si cambia `package.json` / `wi_mod/__init__.py` versión |
| Tag `v*` | sí | sí |
| Actions manual | opcional | con `force_compile` |

Al subir versión: bumpea **a la vez** `wi_mod/__init__.py`, `package.json` y `src-tauri/tauri.conf.json` (misma regla que `docs/index.html`).

## Orden

1. `tauri:dev` con UI estática.
2. Sustituir `/api/library|settings|mods` por storage.
3. Sustituir proxies Python por `fetchExternalApi`.
4. Quitar Python; release con workflow.
