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
VERSION = 2


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
            raise ValueError("Elige una instancia.")
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
    include_files: bool = True,
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
        # Copia mutable: reescribe rutas de imagen a carpetas del zip
        packs_out = [dict(pack) for pack in packs]
        mods_out = [dict(mod) for mod in mods]
        raw_marks = catalog.get("marks") if isinstance(catalog.get("marks"), dict) else {}
        catalog_out = {
            **catalog,
            "marks": {
                str(key): dict(value)
                for key, value in raw_marks.items()
                if isinstance(value, dict)
            },
            "games": [dict(item) for item in (catalog.get("games") or []) if isinstance(item, dict)],
        }
        used_arcs: set[str] = set()

        def put(source_rel: str | None, arcname: str) -> str | None:
            return _add_as(bundle, library, source_rel, arcname, used_arcs)

        # Marcas de modpack / categoría / plataforma → carpetas propias
        for key, mark in list(catalog_out["marks"].items()):
            kind_name, _, item_id = str(key).partition(":")
            src = _media_rel(mark.get("imageUrl"))
            if not src:
                continue
            if kind_name == "modpack":
                pack = next((row for row in packs_out if str(row.get("id") or "") == item_id), None)
                folder = _slug(str((pack or {}).get("name") or item_id))
                arc = put(src, f"modpacks/{folder}/mark{_suffix(src)}")
            elif kind_name == "category":
                arc = put(src, f"categories/{_slug(item_id)}/mark{_suffix(src)}")
            elif kind_name == "platform":
                arc = put(src, f"platforms/{_slug(item_id)}/mark{_suffix(src)}")
            else:
                arc = put(src, f"marks/{_slug(key)}/mark{_suffix(src)}")
            if arc:
                mark["imageUrl"] = f"/media/{arc}"

        # Imágenes de categorías dentro de cada modpack
        for pack in packs_out:
            pack_folder = _slug(str(pack.get("name") or pack.get("id") or "pack"))
            cats = []
            for cat in pack.get("categories") or []:
                if not isinstance(cat, dict):
                    continue
                row = dict(cat)
                src = _media_rel(row.get("imageUrl"))
                if src:
                    cat_folder = _slug(str(row.get("name") or row.get("id") or "cat"))
                    arc = put(src, f"modpacks/{pack_folder}/categories/{cat_folder}/image{_suffix(src)}")
                    if arc:
                        row["imageUrl"] = f"/media/{arc}"
                cats.append(row)
            pack["categories"] = cats

        # Portadas de mods + archivos descargados
        for mod in mods_out:
            count += 1
            mod_folder = _slug(str(mod.get("name") or mod.get("id") or "mod"))
            pic = str(mod.get("pictureFile") or "").strip()
            if pic:
                arc = put(pic, f"fichas/{mod_folder}/picture{_suffix(pic)}")
                if arc:
                    mod["pictureFile"] = arc
            files_out = []
            for item in mod.get("files") or []:
                if not isinstance(item, dict):
                    continue
                row = dict(item)
                stored = str(row.get("storedAs") or "").strip()
                if stored and include_files:
                    raw_name = Path(stored).name
                    safe = re.sub(r"[^\w.\-]+", "-", raw_name).strip(".-")[:80] or "file"
                    # Prefijo mods/ → carpeta de descargas del programa al importar
                    arc = put(stored, f"mods/{mod_folder}/{safe}")
                    if arc:
                        row["storedAs"] = arc
                elif stored:
                    row["storedAs"] = ""
                files_out.append(row)
            mod["files"] = files_out

        manifest = {
            "format": FORMAT,
            "version": VERSION,
            "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "layout": {
                "manifest": "manifest.json",
                "modpacks": "modpacks/<nombre>/mark.* + categories/<cat>/image.*",
                "categories": "categories/<nombre>/mark.*",
                "platforms": "platforms/<nombre>/mark.*",
                "fichas": "fichas/<mod>/picture.*",
                "archivos": "mods/<mod>/*",
            },
            "scope": {
                "kind": scope,
                "platform": platform,
                "game": game,
                "modpack": modpack,
                "modpackName": (label_pack or {}).get("name"),
            },
            "catalog": catalog_out,
            "modpacks": packs_out,
            "mods": mods_out,
        }
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
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
        catalog_blob = manifest.get("catalog") if isinstance(manifest.get("catalog"), dict) else {}
        raw_packs = [item for item in (manifest.get("modpacks") or []) if isinstance(item, dict) and item.get("name")]
        for relative in _asset_paths(catalog_blob, raw_packs, []):
            _extract(bundle, library, relative)
        id_map: dict[str, str] = {}
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
        elif kind_name == "category" and (kind == "all" or kind == "modpack" or kind == "game"):
            marks[key] = value
        elif kind_name == "platform" and (kind == "platform" or kind == "all"):
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


def _media_rel(url: str | None) -> str | None:
    text = str(url or "").strip()
    if text.startswith("/media/"):
        return text[len("/media/") :].replace("\\", "/")
    return None


def _suffix(relative: str) -> str:
    return Path(relative).suffix.lower() or ".bin"


def _asset_paths(
    catalog: dict[str, Any],
    packs: list[dict[str, Any]],
    mods: list[dict[str, Any]],
) -> list[str]:
    """Rutas locales de imágenes de marcas, categorías de pack y mods."""
    found: list[str] = []
    seen: set[str] = set()

    def add(rel: str | None) -> None:
        if not rel:
            return
        key = rel.replace("\\", "/")
        if key in seen:
            return
        seen.add(key)
        found.append(key)

    marks = catalog.get("marks") if isinstance(catalog.get("marks"), dict) else {}
    for mark in marks.values():
        if isinstance(mark, dict):
            add(_media_rel(mark.get("imageUrl")))
    for pack in packs:
        if not isinstance(pack, dict):
            continue
        for cat in pack.get("categories") or []:
            if isinstance(cat, dict):
                add(_media_rel(cat.get("imageUrl")))
    for mod in mods:
        if isinstance(mod, dict):
            pic = str(mod.get("pictureFile") or "").strip()
            if pic:
                add(pic.replace("\\", "/"))
    return found


def _catalog_files(catalog: dict[str, Any]) -> list[str]:
    """Compat: solo marcas/juegos del catálogo (imports viejos)."""
    return _asset_paths(catalog, [], [])


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
    _add_as(bundle, library, relative, str(relative or "").replace("\\", "/"), set())


def _add_as(
    bundle: zipfile.ZipFile,
    library: Library,
    relative: str | None,
    arcname: str,
    used: set[str],
) -> str | None:
    if not relative or not arcname:
        return None
    try:
        path = library.absolute(relative)
    except ValueError:
        return None
    if not path.is_file():
        return None
    arc = arcname.replace("\\", "/").lstrip("/")
    if ".." in Path(arc).parts:
        return None
    final = arc
    if final in used:
        stem = Path(final).stem
        suffix = Path(final).suffix
        parent = str(Path(final).parent).replace("\\", "/")
        n = 2
        while True:
            candidate = f"{parent}/{stem}-{n}{suffix}" if parent != "." else f"{stem}-{n}{suffix}"
            if candidate not in used:
                final = candidate
                break
            n += 1
    used.add(final)
    bundle.write(path, final)
    return final
