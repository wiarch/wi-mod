# Migración Python → Tauri v2

Rama `tauri`. UI compartida en `web/`; Vite/Tauri entran por `src/`.

## Estructura

```
wi-mod/
├── web/                      # UI canónica (Python + Vite importan de aquí)
│   ├── index.html            # pywebview
│   ├── app.js / styles.css
│   └── brand/
├── src/                      # Entry Vite / Tauri
│   ├── index.html
│   ├── main.js               # import ../web/{styles,app}
│   └── services/
│       ├── runtime.ts        # isTauriRuntime()
│       ├── storage/          # SQLite | IndexedDB
│       └── api/              # invoke Rust | window.fetch
├── public/brand/             # estáticos Vite → dist/brand/
├── src-tauri/                # Rust (SQL plugin + http_proxy)
├── docs/                     # Landing + demo Pages (docs/app)
├── wi_mod/ + app.py          # LEGACY Python (activo hasta corte)
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
| `wi-mod.spec`, `wi-mod.bat`, `requirements.txt` | PyInstaller / dev | eliminar |
| `docs/app` | demo limitada Pages | opcional si gh-pages = `dist/` |

## Storage

`getStorageAdapter()` → Tauri SQLite o IndexedDB. Ver `src/services/storage/`.

## HTTP externo

`fetchExternalApi()` → Desktop `invoke('fetch_external_api')` (reqwest) / Web `fetch`. Ver `src/services/api/` + `src-tauri/src/http_proxy.rs`.

## Orden

1. `tauri:dev` con UI estática.
2. Sustituir `/api/library|settings|mods` por storage.
3. Sustituir proxies Python por `fetchExternalApi`.
4. Quitar Python; release con workflow.
