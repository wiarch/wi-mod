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
    try:
        mods = select_mods(
            library.list_mods(),
            scope=kind,
            platform=platform,
            game=game,
            modpack=modpack,
            ids=mod_ids,
        )
    except ValueError:
        if kind not in {"all", "game", "modpack"}:
            raise
        mods = []
    dest.parent.mkdir(parents=True, exist_ok=True)
    packs = _packs_for(library, kind, game, modpack, mods)
    catalog = _catalog_slice(library, kind, game, packs, mods)
    if not mods and not packs and not (catalog.get("games") or []) and kind != "all":
        raise ValueError("No hay nada que exportar con ese filtro.")
    if kind == "all" and not mods and not packs and not (catalog.get("games") or []):
        raise ValueError("La biblioteca está vacía.")
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
            "catalog": catalog,
            "modpacks": packs,
            "mods": mods,
        }
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for relative in _catalog_files(catalog):
            _add_if_present(bundle, library, relative)
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
        _restore_catalog(library, manifest.get("catalog"), scope=scope, game=game, modpack=modpack)
        for relative in _catalog_files(manifest.get("catalog") if isinstance(manifest.get("catalog"), dict) else {}):
            _extract(bundle, library, relative)
        id_map: dict[str, str] = {}
        raw_packs = [item for item in (manifest.get("modpacks") or []) if isinstance(item, dict) and item.get("name")]
        kind = (scope or "all").strip().lower()
        if kind == "game" and game:
            raw_packs = [item for item in raw_packs if str(item.get("gameDomain") or "").lower() == str(game).lower()]
        elif kind == "modpack" and modpack:
            raw_packs = [
                item for item in raw_packs
                if str(item.get("id") or "") == str(modpack) or str(item.get("name") or "").strip() == str(modpack)
            ]
        elif kind not in {"all", "game", "modpack", "platform", "selected"}:
            raw_packs = []
        for raw_pack in raw_packs:
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
        try:
            chosen = select_mods(
                raw_mods,
                scope=scope,
                platform=platform,
                game=game,
                modpack=modpack,
            )
        except ValueError:
            if kind not in {"all", "game", "modpack"}:
                raise
            chosen = []
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


def peek_library(archive: Path) -> dict[str, Any]:
    with zipfile.ZipFile(archive) as bundle:
        try:
            manifest = json.loads(bundle.read("manifest.json").decode("utf-8"))
        except KeyError as exc:
            raise ValueError("El archivo no es un paquete wi-mod.") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("El manifiesto del paquete está dañado.") from exc
    if manifest.get("format") != FORMAT:
        raise ValueError("El archivo no es un paquete wi-mod.")
    mods = [item for item in (manifest.get("mods") or []) if isinstance(item, dict)]
    packs = [item for item in (manifest.get("modpacks") or []) if isinstance(item, dict)]
    catalog = manifest.get("catalog") if isinstance(manifest.get("catalog"), dict) else {}
    games = [item for item in (catalog.get("games") or []) if isinstance(item, dict)]
    domains = {str(item.get("gameDomain") or "").lower() for item in games}
    domains.update(str(item.get("gameDomain") or "").lower() for item in mods)
    domains.discard("")
    game_rows = []
    for domain in sorted(domains):
        named = next((item for item in games if str(item.get("gameDomain") or "").lower() == domain), None)
        named = named or next((item for item in mods if str(item.get("gameDomain") or "").lower() == domain), None)
        count = sum(1 for item in mods if str(item.get("gameDomain") or "").lower() == domain)
        game_rows.append({
            "id": domain,
            "name": str((named or {}).get("gameName") or domain),
            "count": count,
        })
    pack_rows = []
    for pack in packs:
        pack_id = str(pack.get("id") or "")
        count = sum(1 for item in mods if str(item.get("modpackId") or "") == pack_id)
        pack_rows.append({
            "id": pack_id,
            "name": str(pack.get("name") or pack_id),
            "game": str(pack.get("gameName") or pack.get("gameDomain") or ""),
            "count": count,
        })
    return {"mods": len(mods), "games": game_rows, "modpacks": pack_rows}


def _packs_for(library: Library, kind: str, game: str | None, modpack: str | None, mods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    packs = library.list_modpacks()
    if kind == "all":
        return list(packs)
    if kind == "modpack" and modpack:
        return [pack for pack in packs if str(pack.get("id") or "") == str(modpack)]
    if kind == "game" and game:
        domain = str(game).lower()
        return [pack for pack in packs if str(pack.get("gameDomain") or "").lower() == domain]
    pack_ids = {str(mod.get("modpackId") or "") for mod in mods if mod.get("modpackId")}
    return [pack for pack in packs if pack.get("id") in pack_ids]


def _catalog_slice(library: Library, kind: str, game: str | None, packs: list[dict[str, Any]], mods: list[dict[str, Any]]) -> dict[str, Any]:
    catalog = library.catalog()
    if kind == "all":
        return catalog
    domains = set()
    if kind == "game" and game:
        domains.add(str(game).lower())
    domains.update(str(pack.get("gameDomain") or "").lower() for pack in packs)
    domains.update(str(mod.get("gameDomain") or "").lower() for mod in mods)
    domains.discard("")
    games = [
        item
        for item in (catalog.get("games") or [])
        if isinstance(item, dict) and str(item.get("gameDomain") or "").lower() in domains
    ]
    marks = {}
    for key, value in (catalog.get("marks") or {}).items():
        if not isinstance(value, dict):
            continue
        kind_name, _, item_id = str(key).partition(":")
        if kind_name == "modpack" and any(str(pack.get("id") or "") == item_id for pack in packs):
            marks[key] = value
        elif kind_name == "platform" and kind == "platform":
            marks[key] = value
        elif kind == "all":
            marks[key] = value
    return {
        "platforms": list(catalog.get("platforms") or []) if kind == "all" else [],
        "games": games,
        "categories": list(catalog.get("categories") or []) if kind == "all" else [],
        "skills": [],
        "rules": [],
        "marks": marks,
    }


def _catalog_files(catalog: dict[str, Any]) -> list[str]:
    found: list[str] = []
    blobs = list(catalog.get("games") or [])
    blobs.extend((catalog.get("marks") or {}).values())
    for item in blobs:
        if not isinstance(item, dict):
            continue
        for key in ("imageUrl", "logoUrl"):
            url = str(item.get(key) or "").strip()
            if url.startswith("/media/"):
                found.append(url[len("/media/"):])
    return found


def _restore_catalog(library: Library, catalog: Any, *, scope: str, game: str | None, modpack: str | None) -> None:
    if not isinstance(catalog, dict):
        return
    kind = (scope or "all").strip().lower()
    games = [item for item in (catalog.get("games") or []) if isinstance(item, dict)]
    if kind == "game" and game:
        games = [item for item in games if str(item.get("gameDomain") or "").lower() == str(game).lower()]
    elif kind == "modpack":
        games = games
    elif kind not in {"all", "game", "modpack", "platform"}:
        games = []
    for item in games:
        try:
            library.add_catalog_item("game", item)
        except ValueError:
            continue
    if kind == "all":
        for name in catalog.get("platforms") or []:
            try:
                library.add_catalog_item("platform", {"name": name})
            except ValueError:
                continue
        for name in catalog.get("categories") or []:
            try:
                library.add_catalog_item("category", {"name": name})
            except ValueError:
                continue
    for key, value in (catalog.get("marks") or {}).items():
        if not isinstance(value, dict):
            continue
        mark_kind, _, item_id = str(key).partition(":")
        if kind == "game" and mark_kind not in {"platform", "category"}:
            continue
        if kind == "modpack" and mark_kind == "modpack" and modpack and item_id != str(modpack):
            continue
        try:
            library.set_mark(mark_kind, item_id, str(value.get("emoji") or ""), str(value.get("imageUrl") or ""))
        except ValueError:
            continue


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
