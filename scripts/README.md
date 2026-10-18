# Scripts

Helpers for the **legacy Python** desktop shell (`app.py` + `wi_mod/`).

| File | Use |
|------|-----|
| `wi-mod.bat` | Launch `dist/wi-mod.exe` if present, else `py -3 app.py` from repo root |
| `wi-mod.spec` | PyInstaller: `pyinstaller scripts/wi-mod.spec` (run from repo root) |

Tauri lives at the repo root (`npm run tauri:dev`). Do not mix these launchers with the Rust build.
