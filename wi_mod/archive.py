"""Paquete único .wimod.zip con la ficha y los archivos de cada mod."""

from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from wi_mod.store import Library

FORMAT = "wimod"
VERSION = 1


def select_mods(
    mods: list[dict[str, Any]],
    *,
    scope: str = "all",
    platform: str | None = None,
    game: str | None = None,
    modpack: str | None = None,
    ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    kind = (scope or "all").strip().lower()
    if kind == "selected":
        if not ids:
            raise ValueError("Marca al menos un mod o elige otro alcance.")
        wanted = set(ids)
        picked = [mod for mod in mods if mod.get("id") in wanted]
        if not picked:
            raise ValueError("Ningún mod seleccionado existe en la biblioteca.")
        return picked
    if kind == "platform":
        value = str(platform or "").strip()
        if not value:
            raise ValueError("Elige una plataforma.")
        picked = [mod for mod in mods if str(mod.get("platform") or "Nexus") == value]
    elif kind == "game":
        value = str(game or "").strip().lower()
        if not value:
            raise ValueError("Elige un juego.")
        picked = [mod for mod in mods if str(mod.get("gameDomain") or "").lower() == value]
    elif kind == "modpack":
        value = str(modpack or "").strip()
        if not value:
            raise ValueError("Elige un modpack.")
        picked = [
            mod
            for mod in mods
            if str(mod.get("modpackId") or "") == value
            or str(mod.get("modpack") or "").strip() == value
        ]
    elif kind == "all":
        picked = list(mods)
    else:
        raise ValueError("Alcance no válido.")
    if not picked:
        raise ValueError("No hay mods con ese filtro.")
    return picked


def export_label(
    *,
    scope: str = "all",
    platform: str | None = None,
    game: str | None = None,
    modpack: str | None = None,
) -> str:
    kind = (scope or "all").strip().lower()
    if kind == "platform" and platform:
        return f"wi-mod-{_slug(platform)}"
    if kind == "game" and game:
        return f"wi-mod-{_slug(game)}"
    if kind == "modpack" and modpack:
        return f"wi-mod-pack-{_slug(str(modpack))}"
    if kind == "selected":
        return "wi-mod-seleccion"
    return "wi-mod"


def export_library(
    library: Library,
    dest: Path,
    mod_ids: list[str] | None = None,
    *,
    scope: str = "all",
    platform: str | None = None,
    game: str | None = None,
    modpack: str | None = None,
) -> tuple[Path, int]:
    kind = (scope or "all").strip().lower()
    if mod_ids is not None and kind == "all" and not platform and not game and not modpack:
        kind = "selected"
    mods = select_mods(
        library.list_mods(),
        scope=kind,
        platform=platform,
        game=game,
        modpack=modpack,
        ids=mod_ids,
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    pack_ids = {str(mod.get("modpackId") or "") for mod in mods if mod.get("modpackId")}
    if kind == "modpack" and modpack:
        pack_ids.add(str(modpack))
    packs = [pack for pack in library.list_modpacks() if pack.get("id") in pack_ids]
    label_pack = next((pack for pack in packs if pack.get("id") == modpack), packs[0] if packs else None)
    count = 0
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        manifest = {
            "format": FORMAT,
            "version": VERSION,
            "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "scope": {
                "kind": scope,
                "platform": platform,
                "game": game,
                "modpack": modpack,
                "modpackName": (label_pack or {}).get("name"),
            },
            "modpacks": packs,
            "mods": mods,
        }
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for mod in mods:
            count += 1
            _add_if_present(bundle, library, mod.get("pictureFile"))
            for item in mod.get("files") or []:
                _add_if_present(bundle, library, item.get("storedAs"))
    return dest, count


def import_library(
    library: Library,
    archive: Path,
    *,
    scope: str = "all",
    platform: str | None = None,
    game: str | None = None,
    modpack: str | None = None,
) -> dict[str, int]:
    added = 0
    updated = 0
    skipped = 0
    packs_in = 0
    with zipfile.ZipFile(archive) as bundle:
        try:
            manifest = json.loads(bundle.read("manifest.json").decode("utf-8"))
        except KeyError as exc:
            raise ValueError("El archivo no es un paquete wi-mod.") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("El manifiesto del paquete está dañado.") from exc
        if manifest.get("format") != FORMAT:
            raise ValueError("El archivo no es un paquete wi-mod.")
        id_map: dict[str, str] = {}
        for raw_pack in manifest.get("modpacks") or []:
            if not isinstance(raw_pack, dict) or not raw_pack.get("name"):
                continue
            stored = library.upsert_modpack(raw_pack)
            packs_in += 1
            old_id = str(raw_pack.get("id") or "")
            if old_id:
                id_map[old_id] = stored["id"]
            by_name = {
                str(cat.get("name") or "").strip().lower(): str(cat.get("id") or "")
                for cat in (stored.get("categories") or [])
                if isinstance(cat, dict) and cat.get("id")
            }
            for old_cat in raw_pack.get("categories") or []:
                if not isinstance(old_cat, dict) or not old_cat.get("id"):
                    continue
                new_id = by_name.get(str(old_cat.get("name") or "").strip().lower())
                if new_id:
                    id_map[str(old_cat["id"])] = new_id
        raw_mods = [item for item in (manifest.get("mods") or []) if isinstance(item, dict) and item.get("name")]
        chosen = select_mods(
            raw_mods,
            scope=scope,
            platform=platform,
            game=game,
            modpack=modpack,
        )
        chosen_keys = {_mod_key(mod) for mod in chosen}
        for raw in raw_mods:
            if _mod_key(raw) not in chosen_keys:
                skipped += 1
                continue
            copied = _materialize(bundle, library, raw)
            old_pack = str(copied.get("modpackId") or "")
            old_cat = str(copied.get("modpackCategoryId") or "")
            if old_pack and old_pack in id_map:
                copied["modpackId"] = id_map[old_pack]
            if old_cat and old_cat in id_map:
                copied["modpackCategoryId"] = id_map[old_cat]
            game_domain = copied.get("gameDomain") or ""
            nexus_id = copied.get("modId")
            existing = None
            if game_domain and isinstance(nexus_id, int):
                existing = library.find_nexus(game_domain, nexus_id)
            pack_fields = {
                "modpackId": copied.get("modpackId") or "",
                "modpackCategoryId": copied.get("modpackCategoryId") or "",
                "modpackNotes": copied.get("modpackNotes") or "",
            }
            if existing:
                files = copied.get("files") or []
                meta = dict(copied)
                meta.pop("id", None)
                meta.pop("files", None)
                meta.pop("addedAt", None)
                meta.pop("modpackId", None)
                meta.pop("modpackCategoryId", None)
                meta.pop("modpack", None)
                meta["fetchedAt"] = copied.get("fetchedAt")
                library.apply_remote(existing["id"], meta)
                library.update(existing["id"], pack_fields)
                if copied.get("pictureFile"):
                    library.set_picture(existing["id"], copied["pictureFile"])
                _merge_files(library, existing["id"], files)
                updated += 1
            else:
                stored_files = list(copied.get("files") or [])
                copied["files"] = []
                created = library.add(copied)
                library.update(created["id"], pack_fields)
                _merge_files(library, created["id"], stored_files)
                if copied.get("pictureFile"):
                    library.set_picture(created["id"], copied["pictureFile"])
                added += 1
    return {"added": added, "updated": updated, "skipped": skipped, "modpacks": packs_in}


def _mod_key(mod: dict[str, Any]) -> tuple[Any, ...]:
    game = str(mod.get("gameDomain") or "").lower()
    nexus_id = mod.get("modId")
    if game and isinstance(nexus_id, int):
        return ("nexus", game, nexus_id)
    return ("id", mod.get("id") or mod.get("name") or "")


def _slug(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value).strip()).strip("-").lower()
    return (text[:48] or "pack")


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
