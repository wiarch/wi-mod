"""Mira mods/downloads y la carpeta Descargas.

Un .zip, .7z, .rar o .jar nuevo y ya cerrado se lee, se empareja con el mod
que está en «Sin archivo local» y se mueve a mods/{juego}/….
En Descargas solo entra si coincide con un mod que aún no tiene archivo.
En mods/downloads, si no hay ficha, se crea una.
"""

from __future__ import annotations

import os
import re
import sys
import threading
import time
import zipfile
from pathlib import Path
from typing import Any

_ARCHIVES = {".zip", ".7z", ".rar", ".jar"}
_PARTIAL = (".crdownload", ".partial", ".tmp", ".download")
_thread: threading.Thread | None = None


def start_download_watcher(app: Any) -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_loop, args=(app,), name="wi-mod-downloads", daemon=True)
    _thread.start()


def _loop(app: Any) -> None:
    inbox = app.library.program_root / "mods" / "downloads"
    try:
        inbox.mkdir(parents=True, exist_ok=True)
    except OSError:
        return
    started = time.time()
    seen: dict[str, int] = {}
    done: set[str] = set()
    fails: dict[str, int] = {}
    while True:
        folders = [inbox]
        system = _system_downloads()
        if system is not None:
            try:
                if system.resolve() != inbox.resolve():
                    folders.append(system)
            except OSError:
                folders.append(system)
        for folder in folders:
            strict = folder != inbox
            try:
                entries = list(folder.iterdir())
            except OSError:
                continue
            for path in entries:
                _consider(app, path, strict, started, seen, done, fails)
        time.sleep(1.5)


def _system_downloads() -> Path | None:
    if sys.platform == "win32":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
            ) as key:
                raw, _ = winreg.QueryValueEx(key, "{374DE290-123F-4565-9164-39C4925E467B}")
            path = Path(os.path.expandvars(str(raw)))
            if path.is_dir():
                return path
        except OSError:
            pass
    path = Path.home() / "Downloads"
    return path if path.is_dir() else None


def _consider(app: Any, path: Path, strict: bool, started: float, seen: dict[str, int], done: set[str], fails: dict[str, int]) -> None:
    try:
        if not path.is_file():
            return
        suffix = path.suffix.lower()
        if suffix not in _ARCHIVES or path.name.lower().endswith(_PARTIAL):
            return
        if path.with_name(path.name + ".crdownload").exists() or path.with_name(path.name + ".part").exists():
            return
        stat = path.stat()
    except OSError:
        return
    if stat.st_size <= 0:
        return
    if strict and stat.st_mtime < started:
        return
    key = f"{path}|{stat.st_mtime_ns}|{stat.st_size}"
    if key in done:
        return
    last = seen.get(str(path))
    if last != stat.st_size:
        seen[str(path)] = stat.st_size
        return
    if _already(app, path.name):
        done.add(key)
        return
    try:
        status = _attach(app, path, strict)
    except Exception as exc:  # noqa: BLE001
        fails[key] = fails.get(key, 0) + 1
        if fails[key] >= 3:
            done.add(key)
            app.note(f"No pude guardar {path.name}: {exc}", ok=False, reload=False)
        return
    if status == "skip":
        done.add(key)
        return
    done.add(key)


def _attach(app: Any, path: Path, strict: bool) -> str:
    info = _read(path)
    mods = app.library.list_mods()
    if not info.get("mod_id"):
        info["mod_id"] = _id_in_name(path.stem, mods)
    mod = _match(mods, info, path.name, waiting_only=strict)
    if mod is None and strict:
        return "skip"
    if mod is None:
        g_domain = info.get("game") or ""
        g_name = info.get("game_name") or info.get("game") or ""
        if g_domain and hasattr(app, "ensure_game"):
            try:
                app.ensure_game(g_domain, g_name)
            except Exception:
                pass
        fields: dict[str, Any] = {
            "name": path.stem,
            "platform": "Nexus" if info.get("mod_id") else "Independiente",
            "gameDomain": g_domain,
            "gameName": g_name,
            "version": info.get("version") or "",
            "primaryFileName": path.name,
        }
        if info.get("mod_id"):
            fields["modId"] = info["mod_id"]
        if info.get("file_id"):
            fields["primaryFileId"] = info["file_id"]
        mod = app.library.add(fields)
    record = app.library.add_file(str(mod.get("id") or ""), path.name, path)
    if not record:
        raise ValueError("No está en la biblioteca.")
    app.note(f"Listo para instalar: {mod.get('name') or path.stem}", ok=True, reload=True)
    return "ok"


def _already(app: Any, name: str) -> bool:
    low = name.lower()
    for mod in app.library.list_mods():
        for item in mod.get("files") or []:
            if isinstance(item, dict) and str(item.get("name") or "").lower() == low:
                return True
    return False


def _match(mods: list[dict], info: dict, filename: str, *, waiting_only: bool) -> dict | None:
    pool = [mod for mod in mods if isinstance(mod, dict) and (not waiting_only or not _has_file(mod))]
    mod_id = info.get("mod_id")
    if mod_id:
        game = _key(info.get("game") or "")
        hits = []
        for mod in pool:
            if _as_int(mod.get("modId")) != mod_id:
                continue
            if game and _key(mod.get("gameDomain")) != game and _key(mod.get("gameName")) != game:
                continue
            hits.append(mod)
        if len(hits) == 1:
            return hits[0]
        if hits and not game:
            return hits[0]
    low = filename.lower()
    named = [mod for mod in pool if str(mod.get("primaryFileName") or "").lower() == low]
    if len(named) == 1:
        return named[0]
    return None


def _read(path: Path) -> dict[str, Any]:
    info: dict[str, Any] = {"mod_id": None, "file_id": None, "game": "", "game_name": "", "version": ""}
    names = _entries(path)
    low = [name.lower() for name in names]
    meta = next((name for name in names if name.lower().endswith("meta.ini")), "")
    if meta:
        try:
            _apply_ini(info, _member(path, meta).decode("utf-8", "replace"))
        except (OSError, ValueError, zipfile.BadZipFile):
            pass
    minecraft = path.suffix.lower() == ".jar" or any(
        name.endswith("fabric.mod.json") or name.endswith("mods.toml") for name in low
    )
    if minecraft and not info["game"]:
        info["game"] = "minecraft"
        info["game_name"] = "Minecraft"
    if not info["mod_id"]:
        info["mod_id"] = None
    return info


def _apply_ini(info: dict[str, Any], text: str) -> None:
    bag: dict[str, str] = {}
    for line in text.splitlines():
        if "=" not in line or line.startswith("["):
            continue
        key, value = line.split("=", 1)
        bag[key.strip().lower()] = value.strip()
    info["mod_id"] = _as_int(bag.get("modid"))
    info["file_id"] = _as_int(bag.get("fileid") or bag.get("file_id"))
    info["version"] = bag.get("version") or ""
    raw = bag.get("game") or bag.get("gamename") or bag.get("game_name") or ""
    info["game_name"] = raw
    info["game"] = _key(raw)


def _entries(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix in {".zip", ".jar"}:
        try:
            with zipfile.ZipFile(path) as bundle:
                return [item.filename.replace("\\", "/") for item in bundle.infolist() if not item.is_dir()]
        except zipfile.BadZipFile:
            return []
    try:
        from wi_mod.packages import list_entries

        return list_entries(path)
    except (OSError, ValueError):
        return []


def _member(path: Path, member: str) -> bytes:
    if path.suffix.lower() in {".zip", ".jar"}:
        with zipfile.ZipFile(path) as bundle:
            return bundle.read(member)
    from wi_mod.packages import read_member

    return read_member(path, member)


def _id_in_name(stem: str, mods: list[dict]) -> int | None:
    known = {_as_int(mod.get("modId")) for mod in mods}
    known.discard(None)
    for chunk in re.findall(r"\d{3,}", stem):
        number = int(chunk)
        if number in known:
            return number
    return None


def _has_file(mod: dict) -> bool:
    return any(isinstance(item, dict) and str(item.get("storedAs") or "").strip() for item in (mod.get("files") or []))


def _key(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _as_int(value: object) -> int | None:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return number or None
