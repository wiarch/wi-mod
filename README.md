# wi-mod

Biblioteca local y portable de mods para Windows (v0.7.2). **Open source**, pensado para la comunidad.

Junta mods de distintos juegos y plataformas (Nexus, Modrinth, CurseForge, Steam, ModDB y más) en un solo sitio en tu PC. No sustituye a Nexus ni a Mod Organizer 2: es el complemento para buscar, guardar y organizar tu biblioteca multi-juego sin saltar entre webs.

En desarrollo. Corre solo en tu máquina (`127.0.0.1`), sin cuenta en la nube. Descarga gratis, prueba y deja feedback: [wiarch.github.io/wi-mod](https://wiarch.github.io/wi-mod/).

## Qué hace

- Guarda fichas de mods (enlace, portada, resumen, categoría, juego, plataforma).
- Busca y añade desde Nexus Mods, Modrinth, CurseForge, Steam Workshop, ModDB y páginas independientes (según juego y claves API).
- Organiza por juego activo, categorías y modpacks.
- Temas visuales por plataforma (Nexus, Modrinth, CurseForge, Steam, RAWG).
- Interfaz en español/inglés; detecta el idioma del sistema.
- Login local por usuario/clave (sin servicio externo).
- Versión portable: un `.exe` + `LEEME.txt`, sin instalador.
- Demo web limitada en `docs/` para probar sin descargar (se reinicia sola).

## Tecnologías

| Capa | Stack (rama `main`) | Stack (rama `tauri`, en curso) |
|------|---------------------|--------------------------------|
| Runtime | Python 3.12 | **Tauri v2** (Rust) |
| UI | HTML/CSS/JS + **pywebview** | HTML/CSS/JS + **Vite** → WebView2 / WebKitGTK |
| Backend | `ThreadingHTTPServer` `/api/*` | Commands Rust (pendiente) |
| Datos | JSON + SQLite en `data/` | igual (portable junto al exe) |
| Empaquetado | **PyInstaller** | `tauri build` (NSIS / AppImage) |
| Página / demo | `docs/` (GitHub Pages) | igual |

Guía de migración: [docs/MIGRATION-TAURI.md](docs/MIGRATION-TAURI.md).

APIs externas (opcionales, claves en Ajustes): Nexus Mods, CurseForge, Steam Web API, RAWG. Modrinth es público. ModDB se usa por URL/página (sin API oficial).

## Plataformas

Nexus Mods · Modrinth · CurseForge · Steam Workshop · ModDB · Independiente / página oficial.

## Estado

Open source · comunidad. Windows disponible. Linux: próximamente. Feedback: [wiarch.github.io/wi-mod](https://wiarch.github.io/wi-mod/).
