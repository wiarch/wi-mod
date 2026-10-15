# wi-mod

Biblioteca local y portable de mods para Windows (v0.7.1). **Open source.** Junta mods de distintos juegos y plataformas en un solo sitio en tu PC: no sustituye a Nexus ni a Mod Organizer 2; es el complemento para buscar, guardar y ordenar tu biblioteca multi-juego sin saltar entre webs.

En desarrollo. Corre solo en tu máquina (`127.0.0.1`), sin cuenta en la nube y sin enviar tu biblioteca a ningún servidor. Todo queda en una carpeta `data/` al lado del programa.

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

| Capa | Stack |
|------|--------|
| Runtime | Python 3.12 |
| UI | HTML/CSS/JS en ventana **pywebview** (WebView2 en Windows) |
| Servidor local | `http.server` / `ThreadingHTTPServer` en `127.0.0.1` |
| Datos | JSON + SQLite en `data/` (no va al repo) |
| Empaquetado | **PyInstaller** → `dist/wi-mod.exe` |
| Página / demo | estático en `docs/` (GitHub Pages) |

APIs externas (opcionales, claves en Ajustes): Nexus Mods, CurseForge, Steam Web API, RAWG. Modrinth es público. ModDB se usa por URL/página (sin API oficial).

## Plataformas

Nexus Mods · Modrinth · CurseForge · Steam Workshop · ModDB · Independiente / página oficial.

## Estado

Open source. Windows disponible. Linux: próximamente. Proyecto en desarrollo activo; feedback bienvenido desde la página pública.
