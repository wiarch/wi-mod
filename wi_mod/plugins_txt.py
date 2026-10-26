"""Activa y desactiva plugins en plugins.txt de Skyrim (formato con asterisco).

Ruta: %LOCALAPPDATA%\\Skyrim Special Edition\\plugins.txt. *Mod.esp = activo.
Los .esm/.esl van antes que los .esp y los maestros de Bethesda al inicio.
"""

from __future__ import annotations

import os
from pathlib import Path

_FOLDERS = {
    "skyrimspecialedition": "Skyrim Special Edition",
    "skyrim": "Skyrim",
    "skyrimvr": "Skyrim VR",
}
_EXTENSIONS = (".esm", ".esl", ".esp")
_BASE = ("Update.esm", "Dawnguard.esm", "HearthFires.esm", "Dragonborn.esm")
_ENCODING = "cp1252"

Entry = tuple[bool, str]


def is_plugin(name: str) -> bool:
    return str(name or "").lower().endswith(_EXTENSIONS)


def plugins_path(game_domain: str = "skyrimspecialedition") -> Path:
    folder = _FOLDERS.get(str(game_domain or "").strip().lower())
    if not folder:
        raise ValueError("Este juego no usa plugins.txt de Skyrim.")
    local = os.environ.get("LOCALAPPDATA", "").strip()
    if not local:
        raise ValueError("No encuentro LOCALAPPDATA para ubicar plugins.txt.")
    return Path(local) / folder / "plugins.txt"


def read_plugins(path: Path) -> list[Entry]:
    """[(activo, nombre)] en el orden del archivo. Ignora comentarios y vacíos."""
    if not path.is_file():
        return []
    entries: list[Entry] = []
    for raw in path.read_text(encoding=_ENCODING, errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        enabled = line.startswith("*")
        name = line.lstrip("*").strip()
        if name:
            entries.append((enabled, name))
    return entries


def _rank(name: str) -> tuple[int, int]:
    low = name.lower()
    for index, base in enumerate(_BASE):
        if low == base.lower():
            return (0, index)
    return (1, 0) if low.endswith((".esm", ".esl")) else (2, 0)


def sort_plugins(entries: list[Entry]) -> list[Entry]:
    """Base de Bethesda, luego .esm/.esl, luego .esp. Mantiene el orden relativo."""
    return sorted(entries, key=lambda row: _rank(row[1]))


_HEADER = (
    "# This file is used by Skyrim to keep track of your downloaded content.",
    "# Please do not modify this file.",
)


def write_plugins(path: Path, entries: list[Entry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{'*' if enabled else ''}{name}" for enabled, name in sort_plugins(entries)]
    text = "\n".join([*_HEADER, *lines]) + "\n"
    temp = path.with_name(path.name + ".wi-tmp")
    temp.write_bytes(text.encode(_ENCODING, errors="replace"))
    os.replace(temp, path)


def _with_base(entries: list[Entry], data: Path | None) -> list[Entry]:
    """Añade los maestros de Bethesda que existan en Data. Skyrim.esm no se lista."""
    known = {name.lower() for _, name in entries}
    out = [(enabled, name) for enabled, name in entries if name.lower() != "skyrim.esm"]
    known.discard("skyrim.esm")
    for base in _BASE:
        if base.lower() in known:
            continue
        if data is not None and (data / base).is_file():
            out.append((True, base))
    return out


def ensure_plugins(game_domain: str, data: Path) -> None:
    """Si plugins.txt no carga las expansiones o las creaciones, las vuelve a activar."""
    path = plugins_path(game_domain)
    current = read_plugins(path)
    entries = _with_base(list(current), data)
    known = {name.lower() for _, name in entries}
    if data.is_dir():
        for file in data.iterdir():
            name = file.name
            if not file.is_file() or not is_plugin(name):
                continue
            low = name.lower()
            if low == "skyrim.esm" or low in known:
                continue
            if not current or low.startswith("cc") or low == "_resourcepack.esl":
                entries.append((True, name))
                known.add(low)
    if [(flag, name.lower()) for flag, name in entries] == [(flag, name.lower()) for flag, name in current]:
        return
    if entries:
        write_plugins(path, entries)


def enable_plugins(names: list[str], game_domain: str = "skyrimspecialedition", data: Path | None = None) -> list[str]:
    """Deja `*nombre` en plugins.txt (lo crea si no existe). Devuelve los activados."""
    wanted = [str(name).strip() for name in names if is_plugin(str(name).strip())]
    path = plugins_path(game_domain)
    entries = _with_base(read_plugins(path), data)
    index = {name.lower(): pos for pos, (_, name) in enumerate(entries)}
    for name in wanted:
        pos = index.get(name.lower())
        if pos is None:
            index[name.lower()] = len(entries)
            entries.append((True, name))
        else:
            entries[pos] = (True, entries[pos][1])
    write_plugins(path, entries)
    return wanted


def disable_plugins(names: list[str], game_domain: str = "skyrimspecialedition", remove: bool = True) -> list[str]:
    """Quita la línea (remove=True) o el asterisco. Nunca toca los maestros de Bethesda."""
    wanted = {str(name).strip().lower() for name in names if is_plugin(str(name).strip())}
    wanted -= {base.lower() for base in _BASE}
    path = plugins_path(game_domain)
    if not wanted or not path.is_file():
        return []
    entries = read_plugins(path)
    kept: list[Entry] = []
    changed: list[str] = []
    for enabled, name in entries:
        if name.lower() not in wanted:
            kept.append((enabled, name))
            continue
        changed.append(name)
        if not remove:
            kept.append((False, name))
    write_plugins(path, kept)
    return changed
