# Scripts

Helpers for the **legacy Python** desktop shell (`app.py` + `wi_mod/`).

| File | Use |
|------|-----|
| `../wi-mod.bat` | Root double-click launcher (calls this folder’s bat) |
| `wi-mod.bat` | `py -3 app.py` (repo `data/` + `mods/` + `instances/`) |
| `wi-mod.spec` | PyInstaller: `pyinstaller scripts/wi-mod.spec` (run from repo root) |

Dev hot-reload: `npm run tauri:dev` from repo root.
