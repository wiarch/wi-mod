"""Mod Organizer 2 al lado de wi-mod. Si los dos están, el usuario elige."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

try:
    import winreg
except ImportError:  # pragma: no cover
    winreg = None  # type: ignore[assignment]

_CACHE: Path | None = None
_LOOKED = False


def _data_file() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "mo2.json"


def _reg_sz(key, name: str) -> str:
    try:
        value, kind = winreg.QueryValueEx(key, name)
    except OSError:
        return ""
    if kind != winreg.REG_SZ or not isinstance(value, str):
        return ""
    return value.strip().strip('"')


def _exe_from_text(text: str) -> Path | None:
    raw = str(text or "")
    low = raw.lower()
    mark = "modorganizer.exe"
    at = low.find(mark)
    if at < 0:
        return None
    start = raw.rfind('"', 0, at)
    chunk = raw[start + 1 : at + len(mark)] if start >= 0 else raw[: at + len(mark)]
    path = Path(chunk.strip().strip('"'))
    return path if path.is_file() else None


def capture_nxm_handler() -> None:
    """Guarda el exe de MO2 si ahora mismo el protocolo nxm es suyo."""
    if sys.platform != "win32" or winreg is None:
        return
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\nxm\shell\open\command") as key:
            command = _reg_sz(key, "")
    except OSError:
        return
    if "wi-mod" in command.lower() or "app.py" in command.lower():
        return
    exe = _exe_from_text(command)
    if exe:
        _store(exe)


def _store(exe: Path) -> None:
    global _CACHE, _LOOKED
    _CACHE = exe
    _LOOKED = True
    path = _data_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"exe": str(exe)}), encoding="utf-8")
    except OSError:
        return


def _from_disk() -> Path | None:
    try:
        data = json.loads(_data_file().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    exe = Path(str(data.get("exe") or ""))
    return exe if exe.is_file() else None


def _from_uninstall() -> Path | None:
    if winreg is None:
        return None
    roots = (
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    )
    for hive, path in roots:
        try:
            with winreg.OpenKey(hive, path) as key:
                count = winreg.QueryInfoKey(key)[0]
                for index in range(count):
                    try:
                        with winreg.OpenKey(key, winreg.EnumKey(key, index)) as sub:
                            name = _reg_sz(sub, "DisplayName").lower()
                            if "mod organizer" not in name:
                                continue
                            for field in ("DisplayIcon", "InstallLocation"):
                                exe = _exe_from_text(_reg_sz(sub, field))
                                if exe:
                                    return exe
                                folder = Path(_reg_sz(sub, field))
                                candidate = folder / "ModOrganizer.exe"
                                if candidate.is_file():
                                    return candidate
                    except OSError:
                        continue
        except OSError:
            continue
    return None


def _from_process() -> Path | None:
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    try:
        proc = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "(Get-CimInstance Win32_Process -Filter \"Name='ModOrganizer.exe'\" | Select-Object -First 1 -ExpandProperty ExecutablePath)",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            creationflags=0x08000000,
            startupinfo=startup,
            stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return _exe_from_text((proc.stdout or "").strip())


def find_mo2() -> Path | None:
    global _CACHE, _LOOKED
    if sys.platform != "win32":
        return None
    if _LOOKED:
        return _CACHE if _CACHE and _CACHE.is_file() else None
    _LOOKED = True
    exe = _from_disk() or _from_uninstall() or _from_process()
    if exe:
        _store(exe)
    _CACHE = exe
    return exe


def downloads_dir(exe: Path) -> Path:
    ini = exe.parent / "ModOrganizer.ini"
    if ini.is_file():
        try:
            for line in ini.read_text(encoding="utf-8", errors="replace").splitlines():
                if not line.lower().startswith("download_directory="):
                    continue
                raw = line.split("=", 1)[1].strip().strip('"')
                if not raw:
                    break
                folder = Path(raw)
                if not folder.is_absolute():
                    folder = exe.parent / folder
                return folder
        except OSError:
            pass
    return exe.parent / "downloads"


def handoff(exe: Path, url: str) -> None:
    subprocess.Popen([str(exe), url], cwd=str(exe.parent), close_fds=True)


def ask_target(label: str) -> str:
    """'wimod' o 'mo2'. Sí = wi-mod, No = Mod Organizer 2."""
    if sys.platform != "win32":
        return "wimod"
    import ctypes

    text = (
        f"{label}\n\n"
        "wi-mod y Mod Organizer 2 están instalados.\n\n"
        "Sí = descargar en wi-mod\n"
        "No = descargar en Mod Organizer 2"
    )
    flags = 0x4 | 0x20 | 0x1000 | 0x10000
    try:
        answer = int(ctypes.windll.user32.MessageBoxW(None, text, "wi-mod", flags))
    except OSError:
        return "wimod"
    return "mo2" if answer == 7 else "wimod"
