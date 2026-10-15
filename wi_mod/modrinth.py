"""Búsqueda pública de Modrinth. Docs: https://docs.modrinth.com/api/"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from wi_mod import __version__

API = "https://api.modrinth.com/v2/search"
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


def search_projects(terms: str, limit: int = 8) -> list[dict[str, Any]]:
    query = " ".join(str(terms or "").split())
    if len(query) < 2:
        return []
    params = urllib.parse.urlencode({"query": query, "limit": max(1, min(int(limit), 12))})
    request = urllib.request.Request(
        f"{API}?{params}",
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
