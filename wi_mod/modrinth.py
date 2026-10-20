"""Búsqueda y ficha pública de Modrinth. Docs: https://docs.modrinth.com/api/"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any

from wi_mod import __version__

API = "https://api.modrinth.com/v2"
_KINDS = {
    "mod": "mod",
    "modpack": "modpack",
    "resourcepack": "resourcepack",
    "datapack": "datapack",
    "shader": "shader",
    "plugin": "plugin",
}


class ModrinthError(Exception):
    pass


def project_slug(url: str) -> str | None:
    match = re.search(
        r"modrinth\.com/(?:mod|modpack|resourcepack|datapack|shader|plugin|project)/([^/?#]+)",
        str(url or ""),
        re.IGNORECASE,
    )
    if not match:
        return None
    slug = match.group(1).strip()
    return slug or None


def fetch_project(slug: str) -> dict[str, Any]:
    project = _get(f"/project/{urllib.parse.quote(slug)}")
    if not isinstance(project, dict):
        raise ModrinthError("Modrinth no devolvió el proyecto.")
    real_slug = str(project.get("slug") or slug).strip()
    kind = _KINDS.get(str(project.get("project_type") or ""), "mod")
    versions = _get(f"/project/{urllib.parse.quote(real_slug)}/version")
    latest = versions[0] if isinstance(versions, list) and versions else {}
    if not isinstance(latest, dict):
        latest = {}
    files = latest.get("files") if isinstance(latest.get("files"), list) else []
    primary = next((item for item in files if isinstance(item, dict) and item.get("primary")), None)
    if primary is None and files and isinstance(files[0], dict):
        primary = files[0]
    categories = [str(name) for name in (project.get("categories") or []) if str(name).strip()]
    games = [str(name) for name in (project.get("games") or []) if str(name).strip()]
    return {
        "platform": "Modrinth",
        "nexusUrl": f"https://modrinth.com/{kind}/{real_slug}",
        "name": str(project.get("title") or real_slug),
        "summary": str(project.get("description") or ""),
        "author": _owner(real_slug),
        "category": categories[0] if categories else "General",
        "categorySource": "modrinth",
        "version": str(latest.get("version_number") or ""),
        "updatedAt": str(latest.get("date_published") or project.get("updated") or "") or None,
        "createdAt": str(project.get("published") or "") or None,
        "downloads": int(project.get("downloads") or 0),
        "endorsements": int(project.get("followers") or 0),
        "uniqueDownloads": 0,
        "pictureUrl": str(project.get("icon_url") or ""),
        "filesUrl": str((primary or {}).get("url") or ""),
        "primaryFileName": str((primary or {}).get("filename") or ""),
        "primaryFileId": str(latest.get("id") or "") or None,
        "gameDomain": games[0] if games else "",
        "modId": None,
        "fetchedAt": None,
    }


def _owner(slug: str) -> str:
    try:
        rows = _get(f"/project/{urllib.parse.quote(slug)}/members")
    except ModrinthError:
        return ""
    if not isinstance(rows, list):
        return ""
    for role in ("Project Lead", "Owner"):
        for row in rows:
            if not isinstance(row, dict) or str(row.get("role") or "") != role:
                continue
            user = row.get("user") if isinstance(row.get("user"), dict) else {}
            name = str(user.get("username") or "")
            if name:
                return name
    if rows and isinstance(rows[0], dict):
        user = rows[0].get("user") if isinstance(rows[0].get("user"), dict) else {}
        return str(user.get("username") or "")
    return ""


def _get(path: str) -> Any:
    request = urllib.request.Request(
        f"{API}{path}",
        headers={
            "Accept": "application/json",
            "User-Agent": f"wi-mod/{__version__} (local library)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise ModrinthError("Modrinth no respondió.") from exc


def search_projects(terms: str, limit: int = 8, game_version: str = "", loader: str = "") -> list[dict[str, Any]]:
    query = " ".join(str(terms or "").split())
    if len(query) < 2:
        return []
    params: dict[str, Any] = {"query": query, "limit": max(1, min(int(limit), 12))}
    facets = _compat_facets(game_version, loader)
    if facets:
        params["facets"] = json.dumps(facets)
    encoded = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{API}/search?{encoded}",
        headers={
            "Accept": "application/json",
            "User-Agent": f"wi-mod/{__version__} (local library)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise ModrinthError("Modrinth no respondió.") from exc
    hits = []
    for row in payload.get("hits") or []:
        if not isinstance(row, dict):
            continue
        slug = str(row.get("slug") or "").strip()
        if not slug:
            continue
        kind = _KINDS.get(str(row.get("project_type") or ""), "mod")
        hits.append(
            {
                "platform": "Modrinth",
                "name": str(row.get("title") or slug),
                "author": str(row.get("author") or ""),
                "summary": str(row.get("description") or ""),
                "downloads": int(row.get("downloads") or 0),
                "pictureUrl": str(row.get("icon_url") or ""),
                "url": f"https://modrinth.com/{kind}/{slug}",
            }
        )
    return hits


def _compat_facets(game_version: str, loader: str) -> list[list[str]]:
    version = str(game_version or "").strip()
    kind = str(loader or "").strip().lower()
    if kind not in {"forge", "fabric", "quilt", "neoforge"}:
        kind = ""
    if not version and not kind:
        return []
    facets = [["project_type:mod"]]
    if version:
        facets.append([f"versions:{version}"])
    if kind:
        facets.append([f"categories:{kind}"])
    return facets
