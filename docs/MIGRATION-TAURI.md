# Migración Python → Tauri v2

Estado: **scaffold** en la rama `tauri`. El frontend vive en `src/` (Vite → `dist/`). El backend Rust aún no reemplaza a `wi_mod/`.

## Estructura nueva

```
wi-mod/
├── src/                 # Frontend (HTML/CSS/JS) — fuente Vite
│   ├── index.html
│   ├── main.js          # entry (importa styles + app)
│   ├── app.js
│   └── styles.css
├── public/brand/        # Iconos estáticos → dist/brand/ (sin hash)
├── dist/                # Build Vite (gitignore; frontendDist de Tauri)
├── src-tauri/           # Shell nativo Tauri v2
│   ├── Cargo.toml
│   ├── tauri.conf.json  # ventana 1200×800, título wi-mod
│   ├── capabilities/
│   ├── icons/
│   └── src/{main,lib}.rs
├── package.json
├── vite.config.js
├── web/                 # LEGACY pywebview (mantener hasta corte)
├── wi_mod/              # LEGACY API HTTP → commands Rust
├── docs/                # GitHub Pages / demo
└── app.py, wi-mod.spec  # LEGACY PyInstaller
```

## Comandos

```bash
npm install
# Requiere Rust + WebView2 (Win) o WebKitGTK (Linux): https://v2.tauri.app/start/prerequisites/
npm run tauri:dev
npm run tauri:build
```

Portable: el `.exe` de release sale en `src-tauri/target/release/wi-mod.exe` (y el instalador NSIS en `bundle/`). La carpeta `data/` debe vivir junto al ejecutable, igual que hoy.

## Obsoleto / no tocar en el corte final

| Archivo / carpeta | Rol actual | Acción |
|-------------------|------------|--------|
| `app.py` | Arranque pywebview + servidor | Eliminar al cortar Python |
| `wi_mod/server.py` | `ThreadingHTTPServer` `/api/*` | Reescribir como `#[tauri::command]` |
| `wi-mod.spec`, `build/` | PyInstaller | Eliminar |
| `wi-mod.bat`, `requirements.txt` | Dev Python | Eliminar o archivar |
| `web/` | UI servida por Python | Tras paridad, borrar; `src/` es la fuente |
| `dist/wi-mod.exe` (PyInstaller) | Portable viejo | Sustituir por artefacto Tauri; `dist/` pasa a ser solo Vite |

Mantener por ahora: `wi_mod/store.py` y lógica de datos (referencia al portar SQLite/JSON a Rust), `docs/` (Pages), tests Python hasta tener suite nueva.

## Orden sugerido

1. Scaffold (este commit) + `npm run tauri:dev` con UI estática.
2. Sustituir `fetch('/api/...')` por commands Tauri / plugin HTTP.
3. Portar `store`, auth local, Nexus/RAWG/etc. a Rust o a un worker.
4. Borrar capa Python y regenerar portable desde `tauri build`.
