"""Lectura de fichas en la API pública de Nexus Mods."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from wi_mod import __version__

API = "https://api.nexusmods.com/v1"
APP_NAME = "wi-mod"
_URL = re.compile(
    r"^https?://(?:www\.)?nexusmods\.com/([A-Za-z0-9_-]+)/mods/(\d+)",
    re.IGNORECASE,
)


class NexusError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def parse_mod_url(url: str) -> tuple[str, int] | None:
    text = (url or "").strip()
    match = _URL.match(text)
    if not match:
        return None
    return match.group(1).lower(), int(match.group(2))


def canonical_url(game: str, mod_id: int) -> str:
    return f"https://www.nexusmods.com/{game}/mods/{mod_id}"


def request_json(path: str, api_key: str) -> tuple[Any, dict[str, str]]:
    req = urllib.request.Request(
        API + path,
        headers={
            "apikey": api_key,
            "Application-Name": APP_NAME,
            "Application-Version": __version__,
            "User-Agent": f"{APP_NAME}/{__version__}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            payload = json.loads(res.read().decode("utf-8"))
            headers = {k.lower(): v for k, v in res.headers.items()}
            return payload, headers
    except urllib.error.HTTPError as exc:
        detail = _error_message(exc)
        if exc.code == 401:
            detail = "Clave API de Nexus rechazada."
        elif exc.code == 404:
            detail = "Ese mod no existe en Nexus."
        elif exc.code == 429:
            detail = "Nexus limitó las consultas. Espera un momento y reintenta."
        raise NexusError(detail, exc.code) from exc
    except urllib.error.URLError as exc:
        raise NexusError("Sin conexión con Nexus Mods.") from exc
    except json.JSONDecodeError as exc:
        raise NexusError("Nexus respondió con datos ilegibles.") from exc


def validate_key(api_key: str) -> dict[str, Any]:
    data, headers = request_json("/users/validate.json", api_key)
    return {
        "name": data.get("name") or "",
        "isPremium": bool(data.get("is_premium")),
        "hourlyRemaining": headers.get("x-rl-hourly-remaining"),
        "dailyRemaining": headers.get("x-rl-daily-remaining"),
    }


def fetch_mod(api_key: str, game: str, mod_id: int, cache: "Cache") -> dict[str, Any]:
    mod, _headers = request_json(f"/games/{game}/mods/{mod_id}.json", api_key)
    chosen = None
    try:
        files_payload, _ = request_json(
            f"/games/{game}/mods/{mod_id}/files.json", api_key
        )
        files = files_payload.get("files") if isinstance(files_payload, dict) else None
        if not isinstance(files, list):
            files = files_payload if isinstance(files_payload, list) else []
        chosen = pick_file(files)
    except NexusError:
        chosen = None

    game_name = cache.game_name(api_key, game)
    category = cache.category_name(api_key, game, mod.get("category_id"))
    version = ""
    primary_file_id = None
    primary_file_name = None
    if chosen:
        version = str(chosen.get("version") or chosen.get("mod_version") or "")
        if chosen.get("file_id") is not None:
            primary_file_id = int(chosen["file_id"])
        primary_file_name = str(chosen.get("file_name") or chosen.get("name") or "") or None
    if not version:
        version = str(mod.get("version") or "")

    updated = _latest_iso(
        mod.get("updated_timestamp"),
        mod.get("updated_time"),
        (chosen or {}).get("uploaded_timestamp"),
        (chosen or {}).get("uploaded_time"),
    )
    summary = _plain(str(mod.get("summary") or ""))
    description = str(mod.get("description") or "")
    if not summary:
        summary = _plain(description)[:500]
    created = _latest_iso(mod.get("created_timestamp"), mod.get("created_time"))

    return {
        "nexusUrl": canonical_url(game, mod_id),
        "filesUrl": f"{canonical_url(game, mod_id)}?tab=files",
        "platform": "Nexus",
        "gameDomain": game,
        "gameName": game_name or _title_domain(game),
        "modId": mod_id,
        "name": str(mod.get("name") or "").strip(),
        "summary": summary[:2000],
        "author": str(mod.get("author") or (mod.get("user") or {}).get("name") or ""),
        "category": category or "General",
        "categoryId": mod.get("category_id"),
        "version": version,
        "updatedAt": updated,
        "createdAt": created,
        "endorsements": int(mod.get("endorsement_count") or 0),
        "downloads": int(mod.get("mod_downloads") or 0),
        "uniqueDownloads": int(mod.get("mod_unique_downloads") or 0),
        "pictureUrl": _https_url(mod.get("picture_url")),
        "primaryFileId": primary_file_id,
        "primaryFileName": primary_file_name,
    }


def download_links(api_key: str, game: str, mod_id: int, file_id: int) -> list[dict[str, Any]]:
    payload, _ = request_json(
        f"/games/{game}/mods/{mod_id}/files/{file_id}/download_link.json",
        api_key,
    )
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("download_links", "links"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def pick_file(files: list[dict[str, Any]]) -> dict[str, Any] | None:
    usable = [f for f in files if isinstance(f, dict)]
    if not usable:
        return None
    primary = [f for f in usable if f.get("is_primary")]
    if primary:
        return primary[0]
    mains = [f for f in usable if str(f.get("category_name") or "").upper() == "MAIN"]
    pool = mains or usable
    return max(pool, key=lambda f: int(f.get("uploaded_timestamp") or 0))


class Cache:
    def __init__(self, path_games, path_categories):
        self.path_games = path_games
        self.path_categories = path_categories

    def game_name(self, api_key: str, domain: str) -> str:
        games = self._load(self.path_games)
        if not games or _stale(self.path_games):
            try:
                payload, _ = request_json("/games.json", api_key)
                games = _as_list(payload, "games")
                self._save(self.path_games, games)
            except NexusError:
                games = games or []
        for game in games:
            if str(game.get("domain_name") or "").lower() == domain:
                return str(game.get("name") or "")
        return ""

    def category_name(self, api_key: str, domain: str, category_id: Any) -> str:
        if category_id in (None, "", 0):
            return ""
        wanted = str(category_id)
        from_games = self._category_from_games(api_key, domain, wanted)
        if from_games:
            return from_games
        all_cats = self._load(self.path_categories)
        if not isinstance(all_cats, dict):
            all_cats = {}
        entry = all_cats.get(domain)
        stale = not entry or _stale_stamp(entry.get("savedAt"))
        cats = entry.get("items") if isinstance(entry, dict) else None
        if stale or not isinstance(cats, list):
            try:
                payload, _ = request_json(f"/games/{domain}/mods/categories.json", api_key)
                cats = _as_list(payload, "categories")
                all_cats[domain] = {
                    "savedAt": _now(),
                    "items": cats,
                }
                self._save(self.path_categories, all_cats)
            except NexusError:
                cats = cats if isinstance(cats, list) else []
        for cat in cats or []:
            if str(cat.get("category_id") or cat.get("id")) == wanted:
                return str(cat.get("name") or "")
        return ""

    def _category_from_games(self, api_key: str, domain: str, wanted: str) -> str:
        self.game_name(api_key, domain)
        games = self._load(self.path_games) or []
        for game in games:
            if str(game.get("domain_name") or "").lower() != domain:
                continue
            for cat in game.get("categories") or []:
                if str(cat.get("category_id") or cat.get("id")) == wanted:
                    return str(cat.get("name") or "")
        return ""

    def _load(self, path):
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def _save(self, path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _as_list(payload: Any, key: str) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _stale(path, hours: int = 24) -> bool:
    if not path.exists():
        return True
    age = datetime.now(timezone.utc).timestamp() - path.stat().st_mtime
    return age > hours * 3600


def _stale_stamp(stamp: Any, hours: int = 24) -> bool:
    if not isinstance(stamp, str):
        return True
    try:
        saved = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    return (datetime.now(timezone.utc) - saved).total_seconds() > hours * 3600


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _latest_iso(*pairs: Any) -> str | None:
    stamps: list[tuple[int, str | None]] = []
    values = list(pairs)
    for index in range(0, len(values), 2):
        raw_ts = values[index] if index < len(values) else None
        raw_text = values[index + 1] if index + 1 < len(values) else None
        ts = int(raw_ts) if isinstance(raw_ts, (int, float)) else 0
        stamps.append((ts, raw_text if isinstance(raw_text, str) else None))
    best_ts = max((ts for ts, _text in stamps), default=0)
    if best_ts > 0:
        return datetime.fromtimestamp(best_ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for _ts, text in stamps:
        iso = _parse_time(text)
        if iso:
            return iso
    return None


def _parse_time(value: str | None) -> str | None:
    if not value:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ):
        try:
            parsed = datetime.strptime(value.strip(), fmt)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return None


def _plain(text: str) -> str:
    import html as html_lib

    cleaned = re.sub(r"(?i)<br\s*/?>", "\n", text)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\[/?[^\]]+\]", " ", cleaned)
    cleaned = html_lib.unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _https_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    url = value.strip()
    if url.startswith("//"):
        url = "https:" + url
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return url


def _title_domain(domain: str) -> str:
    return re.sub(r"[_-]+", " ", domain).strip().title()


_GRAPHQL = "https://api.nexusmods.com/v2/graphql"
_SEARCH = """
query ($filter: ModsFilter, $count: Int, $sort: [ModsSort!]) {
  mods(filter: $filter, count: $count, sort: $sort) {
    nodes {
      modId
      name
      summary
      author
      version
      downloads
      endorsements
      thumbnailUrl
      status
      game { domainName name }
    }
  }
}
"""


def search_mods(game_domain: str, terms: str, limit: int = 8) -> list[dict[str, Any]]:
    domain = (game_domain or "").strip().lower()
    text = " ".join((terms or "").split())[:80]
    if len(domain) < 2 or len(text) < 2:
        return []
    body = json.dumps({
        "query": _SEARCH,
        "variables": {
            "count": 24,
            "sort": [{"downloads": {"direction": "DESC"}}],
            "filter": {
                "op": "AND",
                "name": [{"op": "WILDCARD", "value": text}],
                "gameDomainName": [{"op": "EQUALS", "value": domain}],
            },
        },
    }).encode("utf-8")
    req = urllib.request.Request(
        _GRAPHQL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"{APP_NAME}/{__version__}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise NexusError(_error_message(exc), exc.code) from exc
    except urllib.error.URLError as exc:
        raise NexusError("Sin conexión con Nexus Mods.") from exc
    except json.JSONDecodeError as exc:
        raise NexusError("Nexus respondió con datos ilegibles.") from exc
    if not isinstance(payload, dict):
        raise NexusError("Nexus respondió con datos ilegibles.")
    if payload.get("errors") and not (payload.get("data") or {}).get("mods"):
        raise NexusError("Nexus no pudo buscar esos mods.")
    nodes = ((payload.get("data") or {}).get("mods") or {}).get("nodes") or []
    hits: list[dict[str, Any]] = []
    needle = text.lower()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        status = str(node.get("status") or "").lower()
        if status in {"hidden", "removed", "wastebinned", "unpublished", "not_published"}:
            continue
        game = node.get("game") if isinstance(node.get("game"), dict) else {}
        mod_id = int(node.get("modId") or 0)
        game_domain = str(game.get("domainName") or domain).strip().lower()
        if mod_id <= 0 or not game_domain:
            continue
        name = str(node.get("name") or "").strip()
        hits.append({
            "modId": mod_id,
            "name": name,
            "summary": _plain(str(node.get("summary") or ""))[:240],
            "author": str(node.get("author") or ""),
            "version": str(node.get("version") or ""),
            "downloads": int(node.get("downloads") or 0),
            "endorsements": int(node.get("endorsements") or 0),
            "pictureUrl": _https_url(node.get("thumbnailUrl")) or "",
            "url": canonical_url(game_domain, mod_id),
            "gameDomain": game_domain,
            "gameName": str(game.get("name") or _title_domain(game_domain)),
            "_rank": 0 if name.lower() == needle else 1 if name.lower().startswith(needle) else 2 if needle in name.lower() else 3,
        })
    hits.sort(key=lambda item: (item["_rank"], -item["downloads"], item["name"].lower()))
    for item in hits:
        item.pop("_rank", None)
    return hits[:limit]


def _error_message(exc: urllib.error.HTTPError) -> str:
    try:
        body = json.loads(exc.read().decode("utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return f"Nexus respondió {exc.code}."
    if isinstance(body, dict) and body.get("message"):
        return str(body["message"])
    return f"Nexus respondió {exc.code}."
