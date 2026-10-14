"""Paquete único .wimod.zip con la ficha y los archivos de cada mod."""

from __future__ import annotations

import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from wi_mod.store import Library

FORMAT = "wimod"
VERSION = 1


def export_library(library: Library, dest: Path, mod_ids: list[str] | None) -> tuple[Path, int]:
    mods = library.list_mods()
    if mod_ids is not None:
        wanted = set(mod_ids)
        mods = [mod for mod in mods if mod["id"] in wanted]
    dest.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        manifest = {
            "format": FORMAT,
            "version": VERSION,
            "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "mods": mods,
        }
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for mod in mods:
            count += 1
            _add_if_present(bundle, library, mod.get("pictureFile"))
            for item in mod.get("files") or []:
                _add_if_present(bundle, library, item.get("storedAs"))
    return dest, count


def import_library(library: Library, archive: Path) -> dict[str, int]:
    added = 0
    updated = 0
    with zipfile.ZipFile(archive) as bundle:
        try:
            manifest = json.loads(bundle.read("manifest.json").decode("utf-8"))
        except KeyError as exc:
            raise ValueError("El archivo no es un paquete wi-mod.") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("El manifiesto del paquete está dañado.") from exc
        if manifest.get("format") != FORMAT:
            raise ValueError("El archivo no es un paquete wi-mod.")
        for raw in manifest.get("mods") or []:
            if not isinstance(raw, dict) or not raw.get("name"):
                continue
            copied = _materialize(bundle, library, raw)
            game = copied.get("gameDomain") or ""
            nexus_id = copied.get("modId")
            existing = None
            if game and isinstance(nexus_id, int):
                existing = library.find_nexus(game, nexus_id)
            if existing:
                files = copied.get("files") or []
                meta = dict(copied)
                meta.pop("id", None)
                meta.pop("files", None)
                meta.pop("addedAt", None)
                meta["fetchedAt"] = copied.get("fetchedAt")
                library.apply_remote(existing["id"], meta)
                if copied.get("pictureFile"):
                    library.set_picture(existing["id"], copied["pictureFile"])
                _merge_files(library, existing["id"], files)
                updated += 1
            else:
                stored_files = list(copied.get("files") or [])
                copied["files"] = []
                created = library.add(copied)
                _merge_files(library, created["id"], stored_files)
                if copied.get("pictureFile"):
                    library.set_picture(created["id"], copied["pictureFile"])
                added += 1
    return {"added": added, "updated": updated}


def _merge_files(library: Library, mod_id: str, files: list[dict[str, Any]]) -> None:
    current = library.get(mod_id) or {}
    owned = {(item.get("name"), item.get("size")) for item in current.get("files") or []}
    owned_paths = {item.get("storedAs") for item in current.get("files") or []}
    for item in files:
        if item.get("storedAs") in owned_paths:
            continue
        key = (item.get("name"), item.get("size"))
        if key in owned:
            continue
        relative = item.get("storedAs")
        if not relative:
            continue
        source = library.absolute(relative)
        if not source.exists():
            continue
        library.add_file(mod_id, item.get("name") or source.name, source)


def _materialize(bundle: zipfile.ZipFile, library: Library, mod: dict[str, Any]) -> dict[str, Any]:
    copied = dict(mod)
    copied["files"] = []
    picture = mod.get("pictureFile")
    if isinstance(picture, str):
        extracted = _extract(bundle, library, picture)
        copied["pictureFile"] = extracted
    for item in mod.get("files") or []:
        if not isinstance(item, dict):
            continue
        relative = item.get("storedAs")
        if not isinstance(relative, str):
            continue
        extracted = _extract(bundle, library, relative)
        if not extracted:
            continue
        cloned = dict(item)
        cloned["storedAs"] = extracted
        copied["files"].append(cloned)
    return copied


def _extract(bundle: zipfile.ZipFile, library: Library, relative: str) -> str | None:
    arc = relative.replace("\\", "/")
    if arc.startswith("/") or ".." in Path(arc).parts:
        return None
    try:
        info = bundle.getinfo(arc)
    except KeyError:
        return None
    dest = library.absolute(arc)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with bundle.open(info) as src, dest.open("wb") as out:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    return arc


def _add_if_present(bundle: zipfile.ZipFile, library: Library, relative: str | None) -> None:
    if not relative:
        return
    try:
        path = library.absolute(relative)
    except ValueError:
        return
    if path.is_file():
        bundle.write(path, relative.replace("\\", "/"))
