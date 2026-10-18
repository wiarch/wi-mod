

# 🎮 wi-mod

  **Your local, portable, and unified multi-game mod library.**

  ![English](https://img.shields.io/badge/Language-English-blue)
  ![Español](https://img.shields.io/badge/Idioma-Español-red)

  ![GitHub Release](https://img.shields.io/github/v/release/wiarch/wi-mod?color=7289da&style=for-the-badge)
  ![Tauri v2](https://img.shields.io/badge/Powered%20by-Tauri%20v2-blue?style=for-the-badge&logo=tauri)
  ![GitHub Pages](https://img.shields.io/badge/Demo-Live%20Web-brightgreen?style=for-the-badge&logo=github)
  ![License](https://img.shields.io/github/license/wiarch/wi-mod?style=for-the-badge)

  [🌐 Try Web Demo](https://wiarch.github.io/wi-mod/) • [⬇️ Download for Windows / Linux](https://github.com/wiarch/wi-mod/releases/latest) • [💬 Report Issue](https://github.com/wiarch/wi-mod/issues)

---







## 📌 What is wi-mod?

**wi-mod** gathers your mods from various platforms and websites (Nexus Mods, Modrinth, CurseForge, Steam Workshop, ModDB, and standalone pages) into a single centralized hub on your PC.

It is not designed to replace advanced installation managers like *Mod Organizer 2* or *Vortex*: it is the **companion organization tool** for searching, bookmarking, and discovering mods across your multi-game library without constantly jumping between browser tabs.

---



## ✨ Key Features

- 📦 **100% Portable:** A single lightweight executable with no installer or external runtime requirements.
- 🔒 **Privacy-First:** Runs entirely locally (`SQLite`/`IndexedDB`). No cloud account or telemetry.
- 🌐 **Multi-Platform Integration:** Import cards and fetch metadata from:
  - Nexus Mods · Modrinth · CurseForge · Steam Workshop · ModDB
- 🎨 **Dynamic Themes:** UI color schemes inspired by each platform's aesthetic.
- 🌍 **Multilingual:** Automatic system language detection (English and Spanish supported out of the box).
- ⚡ **Ultra-Lightweight Performance:** Built with **Tauri v2 + Rust**, consuming under 40 MB of RAM.

---



## 🛠️ Tech Stack

The GitHub language bar is high in **Python** because the shipping desktop shell today is still `app.py` + `wi_mod/` (HTTP API, pywebview, Nexus/RAWG/etc.). **Tauri v2 + Rust** is the target stack and already powers the Vite/`src-tauri` path; both share the same UI in `web/`.

| Layer | Technology |
| ----- | ---------- |
| **Desktop (current)** | [Python 3](https://www.python.org/) — `app.py`, `wi_mod/`, `requirements.txt` (local HTTP + [pywebview](https://pywebview.flowrl.com/)) |
| **Desktop (Tauri)** | [Rust](https://www.rust-lang.org/) + [Tauri v2](https://tauri.app/) — `src-tauri/` (migration in progress; see `docs/MIGRATION-TAURI.md`) |
| **Frontend UI** | HTML5, CSS3, JavaScript — shared `web/` (also Vite via `src/`) |
| **Database** | SQLite (desktop) / IndexedDB (web demo) |
| **API integrations** | Nexus Mods, Modrinth, CurseForge, Steam Workshop, ModDB, RAWG |
| **CI/CD** | GitHub Actions (web Pages + Tauri releases) |


---



## 🚀 Installation & Usage



### 💻 Desktop Executable (Recommended)

1. Go to the [wi-mod Releases page](https://github.com/wiarch/wi-mod/releases/latest).
2. Download the portable file for your OS (`.exe` for Windows or `.AppImage` / portable binary for Linux).
3. Run it directly without installation.



### 🌐 Web Demo

Try the interface directly in your browser at **[wiarch.github.io/wi-mod](https://wiarch.github.io/wi-mod/)**. *(Data is stored locally in your browser using IndexedDB).*

---



## 📝 Commits

Mensajes con [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, etc. Así se pueden generar changelogs automáticamente.

## 📂 Repo layout

| Path | Role |
|------|------|
| `web/` | Shared UI (Python shell + Vite import) |
| `src/` + `src-tauri/` | Tauri v2 frontend entry + Rust |
| `wi_mod/` + `app.py` | Legacy Python desktop (until cutover) |
| `scripts/` | `wi-mod.bat`, PyInstaller `wi-mod.spec` |
| `data/keys.example.json` | API key template (`data/keys.json` is local-only) |
| `docs/` | Landing + GitHub Pages demo |

## 💻 Local Development

```bash
git clone https://github.com/wiarch/wi-mod.git
cd wi-mod

# Tauri (recommended)
npm install
npm run tauri:dev

# Legacy Python shell
pip install -r requirements.txt
python app.py
# or: scripts\wi-mod.bat
```

