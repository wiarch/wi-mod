"""Ficha de CurseForge. La API pide clave. Docs: https://docs.curseforge.com/rest-api/"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from wi_mod import __version__

API = "https://api.curseforge.com/v1"
_SLUG = re.compile(r"curseforge\.com/([^/]+)/([^/]+)/([^/?#]+)", re.IGNORECASE)
_ALIASES = {
    "worldofwarcraft": "wow",
    "wow": "wow",
}
_games: dict[str, int] = {}


class CurseForgeError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def project_ref(url: str) -> tuple[str, str, str] | None:
    match = _SLUG.search(str(url or ""))
    if not match:
        return None
    game, kind, slug = (part.strip().lower() for part in match.groups())
    if game in {"www", "api", "static"} or not slug:
        return None
    return game, kind, slug


def fetch_project(api_key: str, url: str) -> dict[str, Any]:
    ref = project_ref(url)
    if not ref:
        raise CurseForgeError("Ese enlace no es de un proyecto de CurseForge.")
    game_slug, _kind, slug = ref
    game_slug = _ALIASES.get(game_slug, game_slug)
    found = _get(
        "/mods/search",
        api_key,
        {"gameId": game_id(api_key, game_slug), "slug": slug, "pageSize": 1},
    )
    rows = found.get("data") if isinstance(found, dict) else None
    if not isinstance(rows, list) or not rows:
        raise CurseForgeError("CurseForge no encontró ese proyecto.")
    mod_id = rows[0].get("id")
    full = _get(f"/mods/{mod_id}", api_key)
    mod = full.get("data") if isinstance(full, dict) else None
    if not isinstance(mod, dict):
        mod = rows[0]
    shaped = _shape(mod, url)
    shaped["gameDomain"] = game_slug
    shaped["gameName"] = game_slug
    return shaped


def search_mods(api_key: str, game_domain: str, terms: str, limit: int = 8) -> list[dict[str, Any]]:
    text = " ".join(str(terms or "").split())[:80]
    domain = _ALIASES.get(str(game_domain or "").strip().lower(), str(game_domain or "").strip().lower())
    if len(text) < 2 or len(domain) < 2:
        return []
    payload = _get(
        "/mods/search",
        api_key,
        {
            "gameId": game_id(api_key, domain),
            "searchFilter": text,
            "pageSize": max(1, min(int(limit), 12)),
            "sortField": 6,
            "sortOrder": "desc",
        },
    )
    rows = payload.get("data") if isinstance(payload, dict) else []
    hits = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        shaped = _shape(row, "")
        hits.append(
            {
                "platform": "CurseForge",
                "name": shaped["name"],
                "author": shaped["author"],
                "summary": shaped["summary"],
                "downloads": shaped["downloads"],
                "pictureUrl": shaped["pictureUrl"],
                "url": shaped["nexusUrl"],
                "gameDomain": domain,
            }
        )
    return hits


def validate_key(api_key: str) -> None:
    _get("/games", api_key, {"pageSize": 1, "index": 0})


def game_id(api_key: str, slug: str) -> int:
    slug = _ALIASES.get(slug, slug)
    if slug in _games:
        return _games[slug]
    index = 0
    while index < 400:
        payload = _get("/games", api_key, {"index": index, "pageSize": 50})
        rows = payload.get("data") if isinstance(payload, dict) else []
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = str(row.get("slug") or "").strip().lower()
            if name and row.get("id") is not None:
                _games[name] = int(row["id"])
        if len(rows) < 50:
            break
        index += 50
    if slug not in _games:
        raise CurseForgeError("CurseForge no tiene ese juego.")
    return _games[slug]


def _shape(mod: dict[str, Any], fallback_url: str) -> dict[str, Any]:
    files = [item for item in (mod.get("latestFiles") or []) if isinstance(item, dict)]
    files.sort(key=lambda item: str(item.get("fileDate") or ""), reverse=True)
    latest = files[0] if files else {}
    authors = [item for item in (mod.get("authors") or []) if isinstance(item, dict)]
    categories = [item for item in (mod.get("categories") or []) if isinstance(item, dict)]
    logo = mod.get("logo") if isinstance(mod.get("logo"), dict) else {}
    links = mod.get("links") if isinstance(mod.get("links"), dict) else {}
    page = str(links.get("websiteUrl") or fallback_url or "")
    return {
        "platform": "CurseForge",
        "nexusUrl": page,
        "name": str(mod.get("name") or ""),
        "summary": str(mod.get("summary") or ""),
        "author": str(authors[0].get("name") or "") if authors else "",
        "category": str(categories[0].get("name") or "General") if categories else "General",
        "categorySource": "curseforge",
        "version": str(latest.get("displayName") or latest.get("fileName") or ""),
        "updatedAt": str(latest.get("fileDate") or mod.get("dateModified") or "") or None,
        "createdAt": str(mod.get("dateCreated") or "") or None,
        "downloads": int(mod.get("downloadCount") or 0),
        "endorsements": int(mod.get("thumbsUpCount") or 0),
        "uniqueDownloads": 0,
        "pictureUrl": str(logo.get("thumbnailUrl") or logo.get("url") or ""),
        "filesUrl": str(latest.get("downloadUrl") or ""),
        "primaryFileName": str(latest.get("fileName") or ""),
        "primaryFileId": latest.get("id"),
        "modId": mod.get("id"),
        "gameDomain": "",
        "fetchedAt": None,
    }


def _get(path: str, api_key: str, params: dict[str, Any] | None = None) -> Any:
    key = str(api_key or "").strip()
    if not key:
        raise CurseForgeError("Agrega tu clave API de CurseForge en Ajustes para detectar el mod.", 401)
    query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = f"{API}{path}" + (f"?{query}" if query else "")
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "x-api-key": key,
            "User-Agent": f"wi-mod/{__version__} (local library)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise CurseForgeError("La clave de CurseForge no sirve.", exc.code) from exc
        raise CurseForgeError("CurseForge no respondió.", exc.code) from exc
    except Exception as exc:
        raise CurseForgeError("CurseForge no respondió.") from exc
