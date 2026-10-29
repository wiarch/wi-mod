"""Mods ya descargados en Steam Workshop. No se suscribe ni se descarga nada."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from typing import Any

from wi_mod import __version__
from wi_mod.launch import _steam_libraries
from wi_mod.steam import SteamError

_META_FILES = (
    "info.json",
    "addon.json",
    "meta.json",
    "metadata.json",
    "modinfo.json",
    "mod.info",
    "descriptor.mod",
    "modinfo.lua",
)
_DESC_NAMES = {name.lower() for name in _META_FILES} | {"about.xml", "meta"}
_SKIP_DIRS = {"media", "textures", "texture", "sound", "sounds", "models", "anims", "animations"}
_CODE_DIRS = _SKIP_DIRS | {
    "java", "libs", "lib", "bin", "classes", "meta-inf", "natives",
    "src", "test", "tests", "fixtures",
}
_INFO_LINE = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$")
_VERSION_DIR = re.compile(r"\d+(?:\.\d+)*$")
_BBCODE = re.compile(r"\[/?[a-z0-9*]+(?:=[^\]]*)?\]", re.I)
_PREVIEW_NAMES = (
    "poster.png", "poster.jpg", "preview.png", "preview.jpg", "preview.jpeg",
    "thumbnail.png", "thumbnail.jpg", "thumb.png", "thumb.jpg", "icon.png",
)
_NAME_KEYS = ("name", "title", "Name", "Title", "modName")
_AUTHOR_KEYS = ("author", "Author", "creator", "Creator")
_SUMMARY_KEYS = ("description", "summary", "Description", "Summary")
_VERSION_KEYS = ("version", "Version")
_MAX_META = 256 * 1024
_COVERS: dict[int, str] = {}


def store_header(app_id: int) -> str:
    """Carátula de la ficha pública cuando el CDN viejo no tiene el archivo."""
    try:
        app_id = int(app_id)
    except (TypeError, ValueError):
        return ""
    if app_id <= 0:
        return ""
    if app_id in _COVERS:
        return _COVERS[app_id]
    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__}", "Accept": "application/json"},
    )
    header = ""
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        info = payload.get(str(app_id)) if isinstance(payload, dict) else None
        data = info.get("data") if isinstance(info, dict) else None
        if isinstance(data, dict):
            header = str(data.get("header_image") or "").strip()
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        header = ""
    _COVERS[app_id] = header
    return header


def steamapps_dirs() -> list[Path]:
    found: list[Path] = []
    seen: set[str] = set()
    for common in _steam_libraries():
        steamapps = common.parent
        key = str(steamapps).lower()
        if key in seen or steamapps.name.lower() != "steamapps" or not steamapps.is_dir():
            continue
        seen.add(key)
        found.append(steamapps)
    return found


def _read_text(path: Path, limit: int = _MAX_META) -> str:
    try:
        if not path.is_file() or path.stat().st_size > limit:
            return ""
        raw = path.read_bytes()
    except OSError:
        return ""
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le", errors="ignore")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be", errors="ignore")
    return raw.decode("utf-8", errors="ignore")


def _pick(data: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _from_json(path: Path) -> dict[str, str]:
    raw = _read_text(path)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        "name": _pick(data, _NAME_KEYS),
        "author": _pick(data, _AUTHOR_KEYS),
        "summary": _pick(data, _SUMMARY_KEYS),
        "version": _pick(data, _VERSION_KEYS),
    }


def _field(text: str, key: str) -> str:
    match = re.search(rf'(?im)^\s*{key}\s*[:=]\s*"([^"]+)"', text)
    if match:
        return match.group(1).strip()
    match = re.search(rf"(?im)<{key}>([^<]+)</{key}>", text)
    if match:
        return re.sub(r"\s+", " ", match.group(1)).strip()
    match = re.search(rf"(?im)^\s*{key}\s*=\s*([^\r\n]+)", text)
    if match:
        return match.group(1).strip().strip('"').strip()
    return ""


def _from_text(path: Path) -> dict[str, str]:
    text = _read_text(path)
    if not text:
        return {}
    return {
        "name": _field(text, "name") or _field(text, "title"),
        "author": _field(text, "author"),
        "summary": _field(text, "description") or _field(text, "summary"),
        "version": _field(text, "version"),
    }


def _clean(value: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", value or "").strip()
    return text[:limit]


def _vdf_value(block: str, key: str) -> str:
    match = re.search(rf'"{re.escape(key)}"\s+"([^"]*)"', block, re.I)
    return match.group(1).strip() if match else ""


def _acf_item_names(text: str) -> dict[int, str]:
    """Nombres dentro de appworkshop_<AppID>.acf, indexados por WorkshopID."""
    names: dict[int, str] = {}
    for match in re.finditer(r'"(\d+)"\s*\{', text):
        depth = 1
        index = match.end()
        while index < len(text) and depth:
            char = text[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            index += 1
        block = text[match.end():index - 1]
        title = (
            _vdf_value(block, "name")
            or _vdf_value(block, "title")
            or _vdf_value(block, "app_name")
            or _field(block, "name")
            or _field(block, "title")
        )
        if title and not title.isdigit():
            names[int(match.group(1))] = _clean(title, 180)
    return names


def workshop_titles(steamapps: Path, app_id: int) -> dict[int, str]:
    text = _read_text(steamapps / "workshop" / f"appworkshop_{app_id}.acf", 4 * 1024 * 1024)
    return _acf_item_names(text) if text else {}


def _binary_file(path: Path) -> bool:
    try:
        head = path.read_bytes()[:8]
    except OSError:
        return True
    if head.startswith((b"PK", b"\xca\xfe\xba\xbe", b"\x7fELF")):
        return True
    return b"\x00" in head


def _image_file(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return False
    if head.startswith((b"\x89PNG", b"\xff\xd8\xff", b"GIF8")):
        return True
    return head.startswith(b"RIFF") and b"WEBP" in head


def _codey(text: str) -> bool:
    low = (text or "").lower()
    return any(bit in low for bit in ("bytecode", ".class", ".jar", "java/", "ljava/", "cafe babe"))


def _bad_title(title: str) -> bool:
    text = (title or "").strip()
    if not text or text.isdigit() or _codey(text):
        return True
    return bool(re.fullmatch(r"[A-Za-z0-9_.$]{6,}", text) and text.count(".") >= 2)


def _parse_mod_info(text: str) -> dict[str, str]:
    """mod.info de Project Zomboid: name=, poster=, description= hasta la siguiente clave."""
    fields: dict[str, list[str]] = {}
    current = ""
    for line in text.splitlines():
        match = _INFO_LINE.match(line)
        if match:
            current = match.group(1).lower()
            fields.setdefault(current, [])
            value = match.group(2).strip()
            if value:
                fields[current].append(value)
            continue
        if current == "description":
            fields.setdefault("description", []).append(line.rstrip())
    def take(key: str) -> str:
        return "\n".join(fields.get(key) or []).strip()
    poster = take("poster") or take("icon")
    return {
        "name": take("name").splitlines()[0] if take("name") else "",
        "author": take("author").splitlines()[0] if take("author") else "",
        "summary": take("description"),
        "version": (take("modversion") or take("version")).splitlines()[0] if (take("modversion") or take("version")) else "",
        "poster": poster.splitlines()[0] if poster else "",
    }


def _plain_blurb(text: str) -> str:
    lines: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            if lines:
                break
            continue
        lines.append(line.strip())
    raw = _BBCODE.sub("", " ".join(lines))
    return _clean(raw, 400)


def _public_summary(folder: Path, info: Path, summary: str) -> str:
    clean = _clean(summary, 400)
    if clean and not _codey(clean):
        return clean
    for candidate in (info.parent / "steam.txt", info.parent.parent / "steam.txt", folder / "steam.txt"):
        text = _read_text(candidate, 64 * 1024)
        blurb = _plain_blurb(text) if text else ""
        if blurb and not _codey(blurb):
            return blurb
    return clean


def _resolve_poster(info: Path, rel: str) -> str:
    bases = [info.parent, info.parent.parent, info.parent.parent.parent]
    rel_path = Path(rel.replace("\\", "/")) if rel else None
    if rel_path is not None and ".." not in rel_path.parts and rel_path.parts:
        for base in bases:
            candidate = base / rel_path
            if _image_file(candidate):
                return str(candidate)
    for base in bases[:2]:
        for name in _PREVIEW_NAMES:
            candidate = base / name
            if _image_file(candidate):
                return str(candidate)
    return ""


def _meta_rank(path: Path) -> tuple:
    parent = path.parent.name
    version = bool(_VERSION_DIR.fullmatch(parent))
    parts = [part.lower() for part in path.parts]
    common = parent.lower() == "common" or "common" in parts[-3:]
    folder = path.parent.parent.name if version or parent.lower() == "common" else parent
    low = folder.lower()
    addon = " - " in folder or "patch" in low or "beta" in low
    kind = 0 if path.name.lower() == "mod.info" else 1
    if version:
        bits = [int(bit) for bit in parent.split(".")]
        ver = tuple(-bit for bit in bits) + (0,) * (4 - len(bits))
    else:
        ver = (0, 0, 0, 0)
    return (kind, 1 if common else 0, 1 if addon else 0, 1 if version else 0, ver, len(parts))


def _iter_meta(folder: Path) -> list[Path]:
    found: list[Path] = []
    stack: list[tuple[Path, int]] = [(folder, 0)]
    while stack and len(found) < 40:
        path, depth = stack.pop()
        try:
            children = list(path.iterdir())
        except OSError:
            continue
        for child in children:
            if child.is_dir():
                if depth < 4 and child.name.lower() not in _CODE_DIRS:
                    stack.append((child, depth + 1))
                continue
            low = child.name.lower()
            if low in {"mod.info", "descriptor.mod", "modinfo.lua"} or (depth <= 1 and child.suffix.lower() == ".vdf"):
                if not _binary_file(child):
                    found.append(child)
    return found


def _find_preview(folder: Path) -> str:
    stack: list[tuple[Path, int]] = [(folder, 0)]
    while stack:
        path, depth = stack.pop()
        try:
            children = list(path.iterdir())
        except OSError:
            continue
        for child in children:
            if child.is_file() and child.name.lower() in _PREVIEW_NAMES:
                return str(child)
            if child.is_dir() and depth < 3 and child.name.lower() not in _SKIP_DIRS:
                stack.append((child, depth + 1))
    return ""


def _folder_bytes(folder: Path) -> int:
    """Peso de los archivos dentro de la carpeta del mod."""
    total = 0
    stack = [folder]
    checked = 0
    while stack and checked < 20000:
        current = stack.pop()
        try:
            children = list(current.iterdir())
        except OSError:
            continue
        for child in children:
            checked += 1
            if child.is_file():
                try:
                    total += child.stat().st_size
                except OSError:
                    continue
            elif child.is_dir():
                stack.append(child)
    return total


def read_item_meta(folder: Path) -> dict[str, str]:
    """Título y descripción del mod.info principal. Ignora .class, .jar y librerías."""
    paths = sorted(_iter_meta(folder), key=_meta_rank)
    infos = [path for path in paths if path.name.lower() == "mod.info"]
    merged = {"name": "", "author": "", "summary": "", "version": "", "poster": ""}
    for path in infos or paths:
        if path.name.lower() == "mod.info":
            got = _parse_mod_info(_read_text(path))
            poster = _resolve_poster(path, got.get("poster") or "")
            summary = _public_summary(folder, path, got.get("summary") or "")
        elif path.suffix.lower() == ".json":
            got = _from_json(path)
            poster = ""
            summary = _clean(got.get("summary") or "", 400)
        else:
            got = _from_text(path)
            poster = ""
            summary = _clean(got.get("summary") or "", 400)
        title = _clean(got.get("name") or "", 180)
        if _bad_title(title):
            continue
        merged["name"] = title
        merged["author"] = _clean(got.get("author") or "", 120)
        merged["summary"] = summary if not _codey(summary) else ""
        merged["version"] = _clean(got.get("version") or "", 40)
        merged["poster"] = poster
        break
    if not merged["name"]:
        for child in _safe_named(folder):
            if child.suffix.lower() in {".esp", ".esm", ".esl"}:
                merged["name"] = child.stem
                break
        if not merged["name"]:
            packs = [child for child in _safe_named(folder) if child.suffix.lower() in {".jar", ".zip"}]
            if len(packs) == 1 and not _bad_title(packs[0].stem):
                merged["name"] = packs[0].stem
        merged["name"] = _clean(merged["name"], 180)
    if not merged["poster"]:
        merged["poster"] = _find_preview(folder)
    return merged


def _safe_named(folder: Path) -> list[Path]:
    try:
        return [child for child in folder.iterdir() if child.is_file()]
    except OSError:
        return []


def _manifest_names(dirs: list[Path]) -> dict[int, str]:
    """Nombre real en steamapps/appmanifest_<AppID>.acf."""
    names: dict[int, str] = {}
    for steamapps in dirs:
        try:
            manifests = list(steamapps.glob("appmanifest_*.acf"))
        except OSError:
            continue
        for manifest in manifests:
            text = _read_text(manifest, 256 * 1024)
            if not text:
                continue
            app_match = re.search(r'"appid"\s+"(\d+)"', text)
            name_match = re.search(r'"name"\s+"([^"]+)"', text)
            if not app_match or not name_match:
                continue
            title = _clean(name_match.group(1), 180)
            if title:
                names[int(app_match.group(1))] = title
    return names


def _scan_app_dir(
    content: Path,
    app_id: int,
    game_name: str,
    titles: dict[int, str],
    seen: set[int],
) -> list[dict[str, Any]]:
    """Subcarpetas numéricas: un WorkshopID por mod."""
    try:
        children = list(content.iterdir())
    except OSError:
        return []
    items: list[dict[str, Any]] = []
    for child in children:
        if not child.is_dir() or not child.name.isdigit():
            continue
        workshop_id = int(child.name)
        if workshop_id <= 0 or workshop_id in seen:
            continue
        seen.add(workshop_id)
        meta = read_item_meta(child)
        title = meta["name"]
        if _bad_title(title) or title == child.name:
            title = titles.get(workshop_id) or ""
        if _bad_title(title):
            title = f"Workshop {workshop_id}"
        weight = _folder_bytes(child)
        installed = weight > 0
        local_path = str(child)
        preview = meta.get("poster") or ""
        items.append({
            "title": title,
            "workshopId": workshop_id,
            "gameName": game_name,
            "localPath": local_path,
            "status": "installed" if installed else "empty",
            "bytes": weight,
            "preview": preview,
            "coverUrl": preview,
            "thumbnail": preview,
            "AppID": app_id,
            "GameName": game_name,
            "WorkshopID": workshop_id,
            "LocalPath": local_path,
            "name": title,
            "author": meta["author"],
            "summary": meta["summary"],
            "version": meta["version"],
        })
    return items


def scan_workshop(app_id: int, game_name: str = "", roots: list[Path] | None = None) -> list[dict[str, Any]]:
    """Un juego: steamapps/workshop/content/<AppID>/<WorkshopID>."""
    try:
        app_id = int(app_id)
    except (TypeError, ValueError):
        app_id = 0
    if app_id <= 0:
        raise SteamError("Ese juego no tiene AppID de Steam.", 400)
    dirs = steamapps_dirs() if roots is None else list(roots)
    if not dirs:
        raise SteamError("Steam no está instalado.", 404)
    items: list[dict[str, Any]] = []
    seen: set[int] = set()
    for steamapps in dirs:
        content = steamapps / "workshop" / "content" / str(app_id)
        if not content.is_dir():
            continue
        items.extend(_scan_app_dir(content, app_id, game_name, workshop_titles(steamapps, app_id), seen))
    if not items:
        raise SteamError("Ese juego no tiene mods en la Workshop.", 404)
    items.sort(key=lambda row: str(row["name"]).lower())
    return items


def scan_all_workshops(
    game_names: dict[int, str] | None = None,
    roots: list[Path] | None = None,
) -> list[dict[str, Any]]:
    """Todas las carpetas numéricas de steamapps/workshop/content/<AppID>."""
    dirs = steamapps_dirs() if roots is None else list(roots)
    if not dirs:
        raise SteamError("Steam no está instalado.", 404)
    labels = _manifest_names(dirs)
    for raw_id, raw_name in (game_names or {}).items():
        try:
            known_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        known_name = str(raw_name or "").strip()
        if known_id > 0 and known_name:
            labels[known_id] = known_name
    items: list[dict[str, Any]] = []
    seen: set[int] = set()
    for steamapps in dirs:
        content_root = steamapps / "workshop" / "content"
        if not content_root.is_dir():
            continue
        try:
            app_dirs = list(content_root.iterdir())
        except OSError:
            continue
        for app_dir in app_dirs:
            if not app_dir.is_dir() or not app_dir.name.isdigit():
                continue
            app_id = int(app_dir.name)
            if app_id <= 0 or app_id not in labels:
                continue
            game_name = labels[app_id]
            items.extend(_scan_app_dir(app_dir, app_id, game_name, workshop_titles(steamapps, app_id), seen))
    if not items:
        raise SteamError("No hay mods de Workshop en Steam.", 404)
    items.sort(key=lambda row: (str(row["gameName"]).lower(), str(row["name"]).lower()))
    return items
