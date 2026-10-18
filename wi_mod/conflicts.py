"""Conflictos de archivos entre mods activos del mismo juego.

El de mayor prioridad gana: se carga después y pisa la misma ruta.
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any

from wi_mod.store import DISABLED_SUFFIX, Library

_CACHE: dict[str, tuple[int, int, frozenset[str]]] = {}


def _keys(path: Path) -> frozenset[str]:
    try:
        stat = path.stat()
    except OSError:
        return frozenset()
    stamp = (stat.st_mtime_ns, stat.st_size)
    hit = _CACHE.get(str(path))
    if hit and hit[0] == stamp[0] and hit[1] == stamp[1]:
        return hit[2]
    names: set[str] = set()
    try:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as bundle:
                for info in bundle.infolist()[:8000]:
                    if info.is_dir():
                        continue
                    rel = info.filename.replace("\\", "/").strip("/")
                    low = rel.lower()
                    if not rel or low.startswith("__macosx/") or low.endswith("/"):
                        continue
                    names.add(low)
        else:
            name = path.name
            if name.lower().endswith(DISABLED_SUFFIX):
                name = name[: -len(DISABLED_SUFFIX)]
            if name:
                names.add(name.lower())
    except (OSError, zipfile.BadZipFile):
        names = set()
    frozen = frozenset(names)
    _CACHE[str(path)] = (stamp[0], stamp[1], frozen)
    return frozen


def _active(mod: dict[str, Any]) -> bool:
    return "in" in str(mod.get("status") or "").split("+")


def annotate(library: Library, mods: list[dict[str, Any]]) -> None:
    """Añade conflict a cada mod público. No escribe la biblioteca."""
    owners: dict[tuple[str, str], list[tuple[int, str, str]]] = {}
    keys_of: dict[str, frozenset[str]] = {}
    for mod in mods:
        mod_id = str(mod.get("id") or "")
        game = str(mod.get("gameDomain") or "").strip().lower()
        if not mod_id or not _active(mod):
            keys_of[mod_id] = frozenset()
            continue
        found: set[str] = set()
        for item in mod.get("files") or []:
            if not isinstance(item, dict):
                continue
            relative = str(item.get("storedAs") or "").strip()
            if not relative:
                continue
            try:
                path = library.absolute(relative)
            except ValueError:
                continue
            if path.is_file():
                found.update(_keys(path))
        frozen = frozenset(found)
        keys_of[mod_id] = frozen
        priority = int(mod.get("priority") or 0)
        name = str(mod.get("name") or mod_id)
        for key in frozen:
            owners.setdefault((game, key), []).append((priority, mod_id, name))

    for mod in mods:
        mod_id = str(mod.get("id") or "")
        game = str(mod.get("gameDomain") or "").strip().lower()
        mine = keys_of.get(mod_id) or frozenset()
        wins: set[str] = set()
        loses: set[str] = set()
        if mine and _active(mod):
            priority = int(mod.get("priority") or 0)
            for key in mine:
                group = owners.get((game, key)) or []
                if len(group) < 2:
                    continue
                top = max(row[0] for row in group)
                if priority == top and sum(1 for row in group if row[0] == top) == 1:
                    for row in group:
                        if row[1] != mod_id:
                            wins.add(row[2])
                elif priority < top:
                    for row in group:
                        if row[0] == top and row[1] != mod_id:
                            loses.add(row[2])
        mod["conflict"] = {
            "wins": len(wins),
            "loses": len(loses),
            "overwrites": sorted(wins)[:8],
            "overwrittenBy": sorted(loses)[:8],
        }
