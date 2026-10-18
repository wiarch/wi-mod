"""Copia el mod a una carpeta de wi-mod y lo enlaza dentro de Data.

Hardlink si el disco es el mismo. Si no, symlink. No borra archivos del juego
que wi-mod no haya creado. Gana el mod con mayor prioridad.
"""

from __future__ import annotations

import json
import os
import shutil
import zipfile
from pathlib import Path
from typing import Any

from wi_mod.fomod import parse_module
from wi_mod.packages import classify, list_entries, read_member
from wi_mod.store import Library

_MANIFEST = "deploy-links.json"


def data_dir(launch_path: str) -> Path:
    path = Path(str(launch_path or "").strip())
    if not path.exists():
        raise ValueError("La ruta del juego ya no existe.")
    if path.is_file():
        path = path.parent
    if path.name.lower() == "data" and path.is_dir():
        return path
    nested = path / "Data"
    if nested.is_dir():
        return nested
    raise ValueError("No encuentro la carpeta Data junto al juego.")


def _manifest_path(library: Library) -> Path:
    return library.root / _MANIFEST


def _load_manifest(library: Library) -> dict[str, Any]:
    path = _manifest_path(library)
    if not path.is_file():
        return {"links": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"links": {}}
    if not isinstance(data.get("links"), dict):
        data["links"] = {}
    return data


def _save_manifest(library: Library, data: dict[str, Any]) -> None:
    path = _manifest_path(library)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe(relative: str) -> str:
    rel = relative.replace("\\", "/").lstrip("/")
    if not rel or ".." in Path(rel).parts:
        raise ValueError("Ruta insegura en el paquete.")
    return rel


def _link(source: Path, dest: Path) -> str:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() or dest.is_symlink():
        dest.unlink()
    try:
        os.link(source, dest)
        return "hardlink"
    except OSError:
        os.symlink(source, dest)
        return "symlink"


def _extract_zip(archive: Path, names: list[str], staging: Path) -> list[Path]:
    written: list[Path] = []
    wanted = {name.replace("\\", "/").lower(): name for name in names}
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            if info.is_dir():
                continue
            key = info.filename.replace("\\", "/").lower()
            if key not in wanted:
                continue
            target = staging / _safe(wanted[key])
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as src, target.open("wb") as out:
                shutil.copyfileobj(src, out, length=1024 * 1024)
            written.append(target)
    return written


def _mod_archive(library: Library, mod: dict[str, Any]) -> Path:
    files = [item for item in (mod.get("files") or []) if isinstance(item, dict)]
    for item in files:
        relative = str(item.get("storedAs") or "").strip()
        if not relative:
            continue
        path = library.absolute(relative)
        if path.is_file() and path.suffix.lower() in {".zip", ".7z", ".rar"}:
            return path
    raise ValueError("Descarga el .zip, .7z o .rar del mod antes de instalarlo.")


def _selected_map(info: dict[str, str], plan: dict[str, Any], plugins: list[str] | None) -> list[tuple[str, str]]:
    """(ruta dentro del zip, ruta dentro de Data)."""
    root = info.get("root") or ""
    if info["kind"] == "STANDARD":
        return []
    chosen = {name.strip().lower() for name in (plugins or []) if str(name).strip()}
    pairs: list[tuple[str, str]] = []
    for row in plan.get("requiredFiles") or []:
        pairs.extend(_fomod_pair(root, row))
    for step in plan.get("installSteps") or []:
        for group in step.get("groups") or []:
            for plugin in group.get("plugins") or []:
                required = str(plugin.get("type") or "") == "Required"
                if not required and plugin.get("name", "").strip().lower() not in chosen:
                    continue
                for row in plugin.get("files") or []:
                    pairs.extend(_fomod_pair(root, row))
    return pairs


def _fomod_pair(root: str, row: dict[str, str]) -> list[tuple[str, str]]:
    source = _safe(f"{root}{row.get('source') or ''}")
    dest = str(row.get("destination") or "").replace("\\", "/").strip("/")
    if not dest:
        dest = Path(source).name
    return [(source, dest)]


def inspect_mod(library: Library, mod: dict[str, Any]) -> dict[str, Any]:
    archive = _mod_archive(library, mod)
    names = list_entries(archive)
    info = classify(names)
    plan = None
    if info["kind"] == "FOMOD":
        plan = parse_module(read_member(archive, info["fomod"]))
    return {"kind": info["kind"], "root": info["root"], "archive": str(archive), "plan": plan}


def deploy_mod(
    library: Library,
    mod: dict[str, Any],
    launch_path: str,
    plugins: list[str] | None = None,
) -> dict[str, Any]:
    archive = _mod_archive(library, mod)
    names = list_entries(archive)
    info = classify(names)
    plan = parse_module(read_member(archive, info["fomod"])) if info["kind"] == "FOMOD" else None
    if info["kind"] == "FOMOD" and plugins is None:
        return {"kind": "FOMOD", "deployed": False, "plan": plan}
    game_data = data_dir(launch_path)
    staging = library.root / "staged" / str(mod.get("id") or "mod")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    placed: list[tuple[Path, str]] = []
    if info["kind"] == "STANDARD":
        root = (info.get("root") or "").lower()
        picked = []
        rels = []
        for name in names:
            low = name.lower()
            if root and not low.startswith(root):
                continue
            rel = name[len(info.get("root") or ""):].lstrip("/")
            if not rel:
                continue
            picked.append(name)
            rels.append(rel)
        if archive.suffix.lower() != ".zip":
            raise ValueError("El despliegue de .7z/.rar aún usa 7-Zip solo para leer. Comprime o baja el mod en .zip.")
        written = _extract_zip(archive, picked, staging)
        by_name = {path.name.lower(): path for path in written}
        # written keeps full relative path under staging because _extract_zip uses archive name
        for src_name, rel in zip(picked, rels):
            src = staging / _safe(src_name)
            if src.is_file():
                placed.append((src, _safe(rel)))
        del by_name
    else:
        if archive.suffix.lower() != ".zip":
            raise ValueError("El instalador FOMOD de .7z/.rar necesita el paquete en .zip por ahora.")
        pairs = _selected_map(info, plan or {}, plugins or [])
        if not pairs:
            raise ValueError("Elige al menos una opción del FOMOD.")
        # folders: expand to files under that prefix
        expanded: list[tuple[str, str]] = []
        lower_names = {name.lower(): name for name in names}
        for source, dest in pairs:
            source_low = source.lower().rstrip("/")
            exact = lower_names.get(source_low)
            if exact:
                expanded.append((exact, dest))
                continue
            prefix = source_low if source_low.endswith("/") else source_low + "/"
            for low, original in lower_names.items():
                if not low.startswith(prefix):
                    continue
                tail = original[len(prefix):]
                expanded.append((original, _safe(f"{dest}/{tail}" if dest else tail)))
        written_names = [row[0] for row in expanded]
        _extract_zip(archive, written_names, staging)
        for original, dest in expanded:
            src = staging / _safe(original)
            if src.is_file():
                placed.append((src, dest))
    if not placed:
        raise ValueError("El paquete no dejó archivos para enlazar.")
    manifest = _load_manifest(library)
    links: dict[str, Any] = manifest["links"]
    priority = int(mod.get("priority") or 0)
    linked = 0
    skipped = 0
    kind_used = "hardlink"
    for src, rel in placed:
        key = rel.lower()
        current = links.get(key)
        if isinstance(current, dict) and int(current.get("priority") or 0) > priority and current.get("modId") != mod.get("id"):
            skipped += 1
            continue
        dest = game_data / rel
        if dest.exists() and not isinstance(current, dict):
            skipped += 1
            continue
        kind_used = _link(src, dest)
        links[key] = {
            "modId": str(mod.get("id") or ""),
            "priority": priority,
            "relative": rel,
            "dataDir": str(game_data),
        }
        linked += 1
    manifest["dataDir"] = str(game_data)
    _save_manifest(library, manifest)
    return {
        "kind": info["kind"],
        "deployed": True,
        "linked": linked,
        "skipped": skipped,
        "link": kind_used,
        "dataDir": str(game_data),
        "plan": plan,
    }


def purge(library: Library, launch_path: str = "") -> dict[str, int]:
    manifest = _load_manifest(library)
    removed = 0
    data = None
    if launch_path:
        try:
            data = data_dir(launch_path)
        except ValueError:
            data = None
    for row in list((manifest.get("links") or {}).values()):
        if not isinstance(row, dict):
            continue
        base = Path(str(row.get("dataDir") or (data or "")))
        rel = str(row.get("relative") or "")
        if not base or not rel:
            continue
        dest = base / rel
        if dest.is_symlink() or dest.exists():
            try:
                dest.unlink()
                removed += 1
            except OSError:
                continue
    _save_manifest(library, {"links": {}})
    return {"removed": removed}
