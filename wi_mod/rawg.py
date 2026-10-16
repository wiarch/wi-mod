"""Cliente mínimo de la API RAWG (juegos). Docs: https://rawg.io/apidocs"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from wi_mod import __version__

API = "https://api.rawg.io/api"
APP_NAME = "wi-mod"

# Dominios Nexus conocidos a partir del slug RAWG.
NEXUS_BY_SLUG = {
    "the-elder-scrolls-v-skyrim-special-edition": "skyrimspecialedition",
    "the-elder-scrolls-v-skyrim": "skyrim",
    "dark-souls-remastered": "darksoulsremastered",
    "dark-souls-tm-remastered": "darksoulsremastered",
    "dark-souls-8482-remastered": "darksoulsremastered",
    "dark-souls-iii": "darksouls3",
    "dark-souls-3": "darksouls3",
    "dark-souls-ii": "darksouls2",
    "dark-souls": "darksouls",
    "elden-ring": "eldenring",
    "minecraft": "minecraft",
    "stardew-valley": "stardewvalley",
    "fallout-4": "fallout4",
    "fallout-new-vegas": "newvegas",
    "the-witcher-3-wild-hunt": "witcher3",
    "cyberpunk-2077": "cyberpunk2077",
    "baldurs-gate-3": "baldursgate3",
    "monster-hunter-world": "monsterhunterworld",
    "hollow-knight": "hollowknight",
    "grand-theft-auto-san-andreas": "gtasa",
    "grand-theft-auto-v": "gta5",
    "stalker-shadow-of-chernobyl": "stalkershadowofchernobyl",
    "stalker-clear-sky": "stalkerclearsky",
    "stalker-call-of-pripyat": "stalkercallofpripyat",
    "stalker-2": "stalker2",
    "world-of-warcraft": "worldofwarcraft",
    "world-of-warcraft-classic": "worldofwarcraftclassic",
}


class RawgError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def request_json(path: str, api_key: str, params: dict[str, Any] | None = None) -> Any:
    query = {"key": api_key}
    if params:
        query.update({k: v for k, v in params.items() if v is not None and v != ""})
    url = f"{API}{path}?{urllib.parse.urlencode(query)}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"{APP_NAME}/{__version__}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = "RAWG rechazó la consulta."
        if exc.code == 401:
            detail = "Clave API de RAWG rechazada."
        elif exc.code == 404:
            detail = "Juego no encontrado en RAWG."
        elif exc.code == 429:
            detail = "RAWG limitó las consultas. Espera y reintenta."
        raise RawgError(detail, exc.code) from exc
    except urllib.error.URLError as exc:
        raise RawgError("Sin conexión con RAWG.") from exc
    except json.JSONDecodeError as exc:
        raise RawgError("RAWG respondió con datos ilegibles.") from exc


def validate_key(api_key: str) -> dict[str, Any]:
    data = request_json("/games", api_key, {"page_size": 1})
    return {"ok": True, "count": data.get("count")}


def search_games(api_key: str, query: str, *, page_size: int = 12) -> list[dict[str, Any]]:
    q = (query or "").strip()
    if len(q) < 2:
        return []
    data = request_json(
        "/games",
        api_key,
        {"search": q, "page_size": max(1, min(int(page_size), 40)), "search_precise": "false"},
    )
    return [normalize_game(item) for item in (data.get("results") or []) if isinstance(item, dict)]


def get_game(api_key: str, rawg_id: int | str) -> dict[str, Any]:
    data = request_json(f"/games/{rawg_id}", api_key)
    if not isinstance(data, dict):
        raise RawgError("Respuesta RAWG inválida.")
    return normalize_game(data)


def normalize_game(item: dict[str, Any]) -> dict[str, Any]:
    slug = str(item.get("slug") or "").strip().lower()
    name = str(item.get("name") or slug or "Juego").strip()
    rawg_id = item.get("id")
    domain = nexus_domain_for(slug, name)
    platforms = []
    for row in item.get("platforms") or []:
        if not isinstance(row, dict):
            continue
        plat = row.get("platform") if isinstance(row.get("platform"), dict) else row
        label = str((plat or {}).get("name") or "").strip()
        if label:
            platforms.append(label)
    genres = []
    for row in item.get("genres") or []:
        if isinstance(row, dict):
            label = str(row.get("name") or "").strip()
            if label:
                genres.append(label)
    description = str(item.get("description_raw") or "").strip()
    if not description:
        description = _strip_html(str(item.get("description") or ""))
    steam_id = _steam_app_id(item)
    return {
        "rawgId": rawg_id,
        "rawgSlug": slug,
        "gameName": name,
        "gameDomain": domain,
        "steamAppId": int(steam_id or 0),
        "logoUrl": f"https://cdn.cloudflare.steamstatic.com/steam/apps/{steam_id}/logo.png" if steam_id else "",
        "imageUrl": str(item.get("background_image") or "").strip(),
        "released": str(item.get("released") or "").strip()[:10],
        "rating": item.get("rating"),
        "metacritic": item.get("metacritic"),
        "playtime": item.get("playtime"),
        "platforms": platforms[:8],
        "genres": genres[:8],
        "website": str(item.get("website") or "").strip(),
        "description": description[:4000],
        "rawgUrl": f"https://rawg.io/games/{slug}" if slug else "",
    }


def _steam_app_id(item: dict[str, Any]) -> str:
    for row in item.get("stores") or []:
        if not isinstance(row, dict):
            continue
        store = row.get("store") if isinstance(row.get("store"), dict) else {}
        slug = str(store.get("slug") or "").lower()
        url = str(row.get("url") or "")
        if slug != "steam" and "steampowered.com" not in url:
            continue
        match = re.search(r"/app/(\d+)", url)
        if match:
            return match.group(1)
    return ""


def _strip_html(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def nexus_domain_for(slug: str, name: str = "") -> str:
    slug = (slug or "").strip().lower()
    if slug in NEXUS_BY_SLUG:
        return NEXUS_BY_SLUG[slug]
    compact = re.sub(r"[^a-z0-9]", "", slug)
    if compact in {"darksouls8482remastered", "darksoulstmremastered"}:
        return "darksoulsremastered"
    if compact:
        return compact[:64]
    fallback = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    if fallback in {"darksouls8482remastered", "darksoulstmremastered"}:
        return "darksoulsremastered"
    return (fallback or "game")[:64]


def slug_for_domain(domain: str) -> str | None:
    domain = (domain or "").strip().lower()
    for slug, mapped in NEXUS_BY_SLUG.items():
        if mapped == domain:
            return slug
    return None


def resolve_game(api_key: str, *, domain: str = "", name: str = "") -> dict[str, Any] | None:
    domain = (domain or "").strip().lower()
    name = (name or "").strip()
    slug = slug_for_domain(domain)
    if slug:
        try:
            game = get_game(api_key, slug)
            if domain:
                game["gameDomain"] = domain
            return game
        except RawgError:
            pass
    query = name or domain
    if not query:
        return None
    results = search_games(api_key, query, page_size=8)
    if not results:
        return None
    if domain:
        for row in results:
            if str(row.get("gameDomain") or "").lower() == domain:
                try:
                    game = get_game(api_key, row["rawgId"])
                    game["gameDomain"] = domain
                    return game
                except RawgError:
                    row["gameDomain"] = domain
                    return row
    hit = results[0]
    try:
        game = get_game(api_key, hit["rawgId"])
        if domain:
            game["gameDomain"] = domain
        return game
    except RawgError:
        if domain:
            hit["gameDomain"] = domain
        return hit
