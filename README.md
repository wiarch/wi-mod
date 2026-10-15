# wi-mod

Biblioteca local y portable de mods (v0.7.5). **Open source**, pensado para la comunidad.

Junta mods de distintos juegos y plataformas (Nexus, Modrinth, CurseForge, Steam, ModDB y más) en un solo sitio en tu PC. No sustituye a Nexus ni a Mod Organizer 2: es el complemento para buscar, guardar y organizar tu biblioteca multi-juego sin saltar entre webs.

En desarrollo. Corre solo en tu máquina, sin cuenta en la nube. Descarga y feedback: [wiarch.github.io/wi-mod](https://wiarch.github.io/wi-mod/).

## Qué hace

- Guarda fichas de mods (enlace, portada, resumen, categoría, juego, plataforma).
- Busca y añade desde Nexus, Modrinth, CurseForge, Steam Workshop, ModDB e independientes.
- Organiza por juego activo, categorías y modpacks.
- Temas por plataforma; UI ES/EN.
- Login local; portable sin instalador.
- Demo web limitada en `docs/app/`.

## Estructura (rama `tauri`)

| Ruta | Uso |
|------|-----|
| `web/` | UI canónica (Python y Vite) |
| `src/` | Entry Vite + `services/` (storage, API) |
| `src-tauri/` | Shell Tauri v2 + proxy HTTP Rust |
| `wi_mod/` + `app.py` | Backend Python (legacy, aún activo) |
| `docs/` | Landing + demo GitHub Pages |
| `public/brand/` | Iconos del build Vite |

Migración: [docs/MIGRATION-TAURI.md](docs/MIGRATION-TAURI.md).

## Tecnologías

| Capa | `main` (estable) | `tauri` (en curso) |
|------|------------------|---------------------|
| Runtime | Python 3.12 + pywebview | Tauri v2 (Rust) |
| UI | `web/` vía HTTP local | `web/` vía Vite → WebView |
| Datos | JSON + SQLite en `data/` | StorageAdapter (SQLite / IndexedDB) |
| APIs | `wi_mod/*.py` | `fetchExternalApi` → reqwest / fetch |
| Empaque | PyInstaller | `tauri build` + Actions |

## Dev

```bash
# Python (rama main / legacy)
pip install -r requirements.txt
python app.py

# Tauri (rama tauri; requiere Rust)
npm install
npm run tauri:dev
```

APIs opcionales (Ajustes): Nexus, CurseForge, Steam, RAWG. Modrinth es público.

## Estado

Open source · Windows disponible · Linux (Tauri/AppImage) en progreso.
