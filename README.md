

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


| Layer                | Technology                                                          |
| -------------------- | ------------------------------------------------------------------- |
| **Core / Backend**   | [Rust](https://www.rust-lang.org/) + [Tauri v2](https://tauri.app/) |
| **Frontend UI**      | HTML5, CSS3, JavaScript (Vite)                                      |
| **Database**         | SQLite (Desktop) / IndexedDB (Web Demo)                             |
| **API Integrations** | Nexus Mods API, CurseForge API, Steam Web API, RAWG API             |
| **CI/CD**            | GitHub Actions (Automated cross-platform releases)                  |


---



## 🚀 Installation & Usage



### 💻 Desktop Executable (Recommended)

1. Go to the [wi-mod Releases page](https://github.com/wiarch/wi-mod/releases/latest).
2. Download the portable file for your OS (`.exe` for Windows or `.AppImage` / portable binary for Linux).
3. Run it directly without installation.



### 🌐 Web Demo

Try the interface directly in your browser at **[wiarch.github.io/wi-mod](https://wiarch.github.io/wi-mod/)**. *(Data is stored locally in your browser using IndexedDB).*

---



## 💻 Local Development

To contribute or build the project locally:

```bash
# 1. Clone the repository
git clone [https://github.com/wiarch/wi-mod.git](https://github.com/wiarch/wi-mod.git)
cd wi-mod

# 2. Install Node.js dependencies
npm install

# 3. Run the development environment with Tauri
npm run tauri dev
```

