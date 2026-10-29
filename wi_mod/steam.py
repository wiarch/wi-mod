"""Clave de Steam Web API. Docs: https://steamcommunity.com/dev/apikey"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from wi_mod import __version__

API = "https://api.steampowered.com"
_STEAM_GAME_CACHE: dict[int, dict[str, Any]] = {}


class SteamError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def fetch_steam_game(app_id: int, lang: str = "spanish") -> dict[str, Any] | None:
    try:
        app_id = int(app_id)
    except (TypeError, ValueError):
        return None
    if app_id <= 0:
        return None
    if app_id in _STEAM_GAME_CACHE:
        return dict(_STEAM_GAME_CACHE[app_id])
    url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l={lang}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return None
    info = payload.get(str(app_id)) if isinstance(payload, dict) else None
    if not isinstance(info, dict) or not info.get("success"):
        return None
    data = info.get("data")
    if not isinstance(data, dict):
        return None

    name = str(data.get("name") or "").strip()
    header_img = str(data.get("header_image") or "").strip()
    desc_raw = str(data.get("short_description") or data.get("detailed_description") or "")
    description = strip_html(desc_raw)[:4000]

    metacritic = data.get("metacritic") if isinstance(data.get("metacritic"), dict) else None
    meta_score = int(metacritic.get("score") or 0) if metacritic else 0
    rating = round(meta_score / 20.0, 1) if meta_score > 0 else None

    genres = []
    for g in data.get("genres") or []:
        if isinstance(g, dict) and g.get("description"):
            genres.append(str(g["description"]).strip())

    platforms = []
    plats = data.get("platforms")
    if isinstance(plats, dict):
        if plats.get("windows"):
            platforms.append("PC")
        if plats.get("mac"):
            platforms.append("macOS")
        if plats.get("linux"):
            platforms.append("Linux")

    release = data.get("release_date") if isinstance(data.get("release_date"), dict) else None
    released = str(release.get("date") or "").strip() if release else ""
    website = str(data.get("website") or "").strip()

    record: dict[str, Any] = {
        "gameName": name,
        "steamAppId": app_id,
        "imageUrl": header_img,
        "description": description,
        "descriptionEs": description if lang in {"spanish", "es"} else "",
        "rating": rating,
        "metacritic": meta_score or None,
        "genres": genres[:8],
        "platforms": platforms[:8],
        "released": released[:20],
        "website": website,
    }
    _STEAM_GAME_CACHE[app_id] = record
    return dict(record)


def search_steam_store(term: str, lang: str = "spanish") -> int:
    query = (term or "").strip()
    if len(query) < 2:
        return 0
    url = f"https://store.steampowered.com/api/storesearch/?term={urllib.parse.quote(query)}&l={lang}&cc=US"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return 0
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list) or not items:
        return 0

    clean_term = re.sub(r"[^a-z0-9]", "", query.lower())
    for it in items:
        if not isinstance(it, dict):
            continue
        clean_name = re.sub(r"[^a-z0-9]", "", str(it.get("name") or "").lower())
        if clean_name == clean_term:
            try:
                return int(it.get("id") or 0)
            except (TypeError, ValueError):
                pass

    for it in items:
        if not isinstance(it, dict):
            continue
        clean_name = re.sub(r"[^a-z0-9]", "", str(it.get("name") or "").lower())
        if clean_name.startswith(clean_term) or clean_term in clean_name:
            try:
                return int(it.get("id") or 0)
            except (TypeError, ValueError):
                pass

    first = items[0]
    if isinstance(first, dict):
        clean_first = re.sub(r"[^a-z0-9]", "", str(first.get("name") or "").lower())
        if clean_term in clean_first or clean_first in clean_term:
            try:
                return int(first.get("id") or 0)
            except (TypeError, ValueError):
                pass
    return 0


def validate_key(api_key: str) -> bool:
    key = str(api_key or "").strip()
    if not key:
        raise SteamError("Falta la clave de Steam.")
    url = f"{API}/ISteamWebAPIUtil/GetSupportedAPIList/v1/?{urllib.parse.urlencode({'key': key})}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__} (local library)", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise SteamError("La clave de Steam no sirve.", exc.code) from exc
        raise SteamError(f"Steam respondió {exc.code}.", exc.code) from exc
    except urllib.error.URLError as exc:
        raise SteamError("No se pudo hablar con Steam.") from exc
    except json.JSONDecodeError as exc:
        raise SteamError("Steam devolvió un JSON raro.") from exc
    if not isinstance(payload, dict):
        raise SteamError("Steam devolvió un JSON raro.")
    return True
