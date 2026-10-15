"""Servidor local de wi-mod. Solo escucha en 127.0.0.1."""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from wi_mod.archive import export_label, export_library, import_library
from wi_mod.images import download_picture
from wi_mod.multipart import parse_multipart
from wi_mod.nexus import (
    Cache,
    NexusError,
    canonical_url,
    download_links,
    fetch_mod,
    parse_mod_url,
    validate_key,
)
from wi_mod.rawg import (
    RawgError,
    get_game,
    resolve_game,
    search_games,
    validate_key as validate_rawg_key,
)
from wi_mod.store import Library, now, safe_name
from wi_mod.translate import TranslateError, translate_text


def _locations() -> tuple[Path, Path]:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS), Path(sys.executable).resolve().parent
    here = Path(__file__).resolve().parent.parent
    return here, here


BUNDLE, ROOT = _locations()
WEB = BUNDLE / "web"
_BRAND = {
    "nexus.ico": "image/x-icon",
    "modrinth.png": "image/png",
    "curseforge.ico": "image/x-icon",
    "steam.ico": "image/x-icon",
}
_ID = re.compile(r"^[0-9a-f]{32}$")


class DuplicateMod(Exception):
    def __init__(self, mod: dict):
        super().__init__("Ese mod ya está en la biblioteca.")
        self.mod = mod


class App:
    def __init__(self, root: Path):
        self.root = root
        self.library = Library(root)
        self.library.ensure_rawg_key(os.environ.get("WI_MOD_RAWG_KEY", ""))
        self.library.ensure_platforms()
        self.cache = Cache(root / "cache" / "games.json", root / "cache" / "categories.json")
        self.tmp = root / "tmp"
        self.tmp.mkdir(parents=True, exist_ok=True)


def make_server(app: App, port: int = 0) -> ThreadingHTTPServer:
    handler = make_handler(app)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    return server


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args) -> None:
            return

        def do_GET(self) -> None:
            try:
                self._get()
            except Exception as exc:  # noqa: BLE001
                self._fail(exc)

        def do_POST(self) -> None:
            try:
                self._post()
            except Exception as exc:  # noqa: BLE001
                self._fail(exc)

        def do_PUT(self) -> None:
            try:
                self._put()
            except Exception as exc:  # noqa: BLE001
                self._fail(exc)

        def do_PATCH(self) -> None:
            try:
                self._patch()
            except Exception as exc:  # noqa: BLE001
                self._fail(exc)

        def do_DELETE(self) -> None:
            try:
                self._delete()
            except Exception as exc:  # noqa: BLE001
                self._fail(exc)

        def _token(self) -> str:
            header = (self.headers.get("X-Session") or "").strip()
            if header:
                return header
            raw = self.headers.get("Cookie") or ""
            for bit in raw.split(";"):
                name, _, value = bit.strip().partition("=")
                if name == "wi_session":
                    return value
            return ""

        def _session_payload(self, token: str) -> dict:
            user = app.library.user_for_token(token) or {}
            return {
                "username": user.get("username") or "",
                "role": user.get("role") or "",
                "token": token,
            }

        def _open(self) -> bool:
            path = urlparse(self.path).path
            if path in {"/", "/index.html", "/app.js", "/styles.css", "/api/session", "/api/login", "/api/logout", "/api/users/lookup", "/api/users", "/api/password/reset"}:
                return True
            if path.startswith("/media/"):
                return True
            if path.startswith("/brand/") and Path(path).name in _BRAND:
                return True
            if app.library.user_for_token(self._token()):
                return True
            self._json(401, {"error": "Inicia sesión."})
            return False

        def _get(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/users/lookup":
                query = parse_qs(urlparse(self.path).query)
                name = (query.get("name") or [""])[0]
                self._json(200, app.library.lookup_user(name))
                return
            if path == "/api/session":
                state = app.library.session_state()
                user = app.library.user_for_token(self._token())
                self._json(200, {
                    "username": user["username"] if user else "",
                    "role": user["role"] if user else "",
                    "needsPassword": bool(state.get("needsPassword")),
                    "admin": "WYDEX",
                })
                return
            if not self._open():
                return
            if path in ("/", "/index.html"):
                self._file(WEB / "index.html", "text/html; charset=utf-8")
                return
            if path == "/app.js":
                self._file(WEB / "app.js", "text/javascript; charset=utf-8")
                return
            if path == "/styles.css":
                self._file(WEB / "styles.css", "text/css; charset=utf-8")
                return
            if path == "/api/library":
                mods = app.library.list_mods()
                packs = app.library.list_modpacks()
                self._json(
                    200,
                    {
                        "mods": [_public_mod(mod) for mod in mods],
                        "modpacks": [_public_pack(pack) for pack in packs],
                        "catalog": app.library.catalog(),
                        "language": _lang(app),
                        "theme": _theme(app),
                    },
                )
                return
            if path == "/api/modpacks":
                packs = app.library.list_modpacks()
                self._json(200, {"modpacks": [_public_pack(pack) for pack in packs]})
                return
            if path == "/api/settings":
                self._json(200, _public_settings(app.library.settings()))
                return
            if path == "/api/rawg/search":
                query = parse_qs(urlparse(self.path).query)
                q = (query.get("q") or [""])[0]
                self._json(200, {"results": _rawg_search(app, q)})
                return
            if path == "/api/rawg/resolve":
                query = parse_qs(urlparse(self.path).query)
                domain = (query.get("domain") or [""])[0]
                name = (query.get("name") or [""])[0]
                self._json(200, {"game": _rawg_resolve(app, domain, name)})
                return
            if path.startswith("/media/"):
                rel = unquote(path[len("/media/") :])
                self._media(rel)
                return
            if path.startswith("/brand/"):
                name = Path(path).name
                kind = _BRAND.get(name)
                if kind:
                    self._file(WEB / "brand" / name, kind)
                    return
            self._json(404, {"error": "No encontrado."})

        def _post(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/login":
                body = self._json_body()
                remember = bool(body.get("remember"))
                token = app.library.login(
                    str(body.get("username") or ""),
                    str(body.get("password") or ""),
                    remember,
                )
                self._json(200, self._session_payload(token), token=token, remember=remember)
                return
            if path == "/api/users":
                body = self._json_body()
                remember = bool(body.get("remember"))
                token = app.library.create_user(
                    str(body.get("username") or ""),
                    str(body.get("password") or ""),
                    remember,
                )
                self._json(200, self._session_payload(token), token=token, remember=remember)
                return
            if path == "/api/password/reset":
                body = self._json_body()
                remember = bool(body.get("remember"))
                token = app.library.reset_password(
                    str(body.get("username") or ""),
                    str(body.get("password") or ""),
                    remember,
                )
                self._json(200, self._session_payload(token), token=token, remember=remember)
                return
            if path == "/api/logout":
                app.library.logout(self._token())
                self._json(200, {"ok": True}, clear_cookie=True)
                return
            if not self._open():
                return
            if path == "/api/images":
                self._json(201, _save_image(app, self))
                return
            if path == "/api/preview":
                body = self._json_body()
                self._json(200, _preview(app, str(body.get("url") or "")))
                return
            if path == "/api/mods/assign":
                body = self._json_body()
                ids = body.get("ids")
                if not isinstance(ids, list) or not ids:
                    raise ValueError("Marca al menos un mod.")
                for item in ids:
                    if not isinstance(item, str) or not _ID.match(item):
                        raise ValueError("Hay un mod marcado que no existe.")
                fields = {}
                if "category" in body:
                    fields["category"] = body.get("category")
                if "modpackId" in body or "modpackCategoryId" in body:
                    fields["modpackId"] = body.get("modpackId") or ""
                    fields["modpackCategoryId"] = body.get("modpackCategoryId") or ""
                if not fields:
                    raise ValueError("Elige categoría o modpack.")
                updated = app.library.update_many(ids, fields)
                self._json(200, {"mods": [_public_mod(mod) for mod in updated], "count": len(updated)})
                return
            if path == "/api/mods":
                body = self._json_body()
                mod = _create(app, body)
                self._json(201, {"mod": _public_mod(mod)})
                return
            if path == "/api/modpacks":
                body = self._json_body()
                pack = app.library.add_modpack(body)
                self._json(201, {"modpack": _public_pack(pack)})
                return
            if path == "/api/catalog":
                body = self._json_body()
                kind = str(body.get("kind") or "").strip().lower()
                if kind == "game" and body.get("rawgId") and not body.get("gameDomain"):
                    body = _enrich_game_from_rawg(app, body)
                catalog = app.library.add_catalog_item(kind, body)
                self._json(200, {"catalog": catalog})
                return
            if path == "/api/rawg/add":
                body = self._json_body()
                game = _add_game_from_rawg(app, body)
                self._json(201, {"game": game, "catalog": app.library.catalog()})
                return
            cat_match = re.fullmatch(r"/api/modpacks/([0-9a-f]{32})/categories", path)
            if cat_match:
                body = self._json_body()
                pack = app.library.add_pack_category(cat_match.group(1), body)
                if not pack:
                    self._json(404, {"error": "Modpack no encontrado."})
                    return
                self._json(201, {"modpack": _public_pack(pack)})
                return
            if path == "/api/refresh":
                self._json(200, _refresh_all(app))
                return
            if path == "/api/export":
                body = self._json_body()
                self._export(_pack_filter(body))
                return
            if path == "/api/import":
                self._json(200, {"result": _import(app, self)})
                return
            if path == "/api/localize":
                self._json(200, _localize_missing(app))
                return
            if path == "/api/translate":
                body = self._json_body()
                text = str(body.get("text") or "")
                if len(text) > 8000:
                    raise ValueError("El texto es demasiado largo para traducir.")
                translated = translate_text(
                    text,
                    source=str(body.get("source") or "en"),
                    target=str(body.get("target") or "es"),
                )
                self._json(200, {"text": translated})
                return
            mod_id, action = _mod_action(path)
            if mod_id and action == "refresh":
                length = int(self.headers.get("Content-Length") or 0)
                body = self._json_body() if length else {}
                self._json(200, _refresh_one(app, mod_id, apply=bool(body.get("apply"))))
                return
            if mod_id and action in {"files", "download"}:
                self._json(400, {"error": "Solo informativo. No se guardan archivos del mod."})
                return
            if mod_id and action == "translate":
                self._json(200, _translate_mod(app, mod_id))
                return
            self._json(404, {"error": "No encontrado."})

        def _put(self) -> None:
            if not self._open():
                return
            path = urlparse(self.path).path
            if path != "/api/settings":
                self._json(404, {"error": "No encontrado."})
                return
            body = self._json_body()
            if "rawgApiKey" in body:
                rawg_key = str(body.get("rawgApiKey") or "").strip()
                if rawg_key:
                    validate_rawg_key(rawg_key)
                app.library.set_rawg_api_key(rawg_key)
            if "language" in body:
                app.library.set_language(str(body.get("language") or "es"))
                if _lang(app) == "es":
                    _localize_missing(app)
            if "theme" in body:
                app.library.set_theme(str(body.get("theme") or "nexus"))
            if "apiKey" in body:
                key = str(body.get("apiKey") or "").strip()
                if not key:
                    app.library.set_api_key("", {})
                else:
                    profile = validate_key(key)
                    app.library.set_api_key(key, profile)
            self._json(200, _public_settings(app.library.settings()))

        def _patch(self) -> None:
            if not self._open():
                return
            path = urlparse(self.path).path
            pack_cat_match = re.fullmatch(r"/api/modpacks/([0-9a-f]{32})/categories/([0-9a-f]{32})", path)
            if pack_cat_match:
                pack = app.library.update_pack_category(
                    pack_cat_match.group(1),
                    pack_cat_match.group(2),
                    self._json_body(),
                )
                if not pack:
                    self._json(404, {"error": "Categoría no encontrada."})
                    return
                self._json(200, {"modpack": _public_pack(pack)})
                return
            pack_match = re.fullmatch(r"/api/modpacks/([0-9a-f]{32})", path)
            if pack_match:
                pack = app.library.update_modpack(pack_match.group(1), self._json_body())
                if not pack:
                    self._json(404, {"error": "Modpack no encontrado."})
                    return
                self._json(200, {"modpack": _public_pack(pack)})
                return
            match = re.fullmatch(r"/api/mods/([0-9a-f]{32})", path)
            if not match:
                self._json(404, {"error": "No encontrado."})
                return
            mod = app.library.update(match.group(1), self._json_body())
            if not mod:
                self._json(404, {"error": "Mod no encontrado."})
                return
            self._json(200, {"mod": _public_mod(mod)})

        def _delete(self) -> None:
            if not self._open():
                return
            path = urlparse(self.path).path
            file_match = re.fullmatch(r"/api/mods/([0-9a-f]{32})/files/([0-9a-f]{32})", path)
            if file_match:
                ok = app.library.remove_file(file_match.group(1), file_match.group(2))
                if not ok:
                    self._json(404, {"error": "Archivo no encontrado."})
                    return
                mod = app.library.get(file_match.group(1))
                self._json(200, {"mod": _public_mod(mod)})
                return
            pack_cat_match = re.fullmatch(r"/api/modpacks/([0-9a-f]{32})/categories/([0-9a-f]{32})", path)
            if pack_cat_match:
                pack = app.library.delete_pack_category(pack_cat_match.group(1), pack_cat_match.group(2))
                if not pack:
                    self._json(404, {"error": "Categoría no encontrada."})
                    return
                self._json(200, {"modpack": _public_pack(pack)})
                return
            pack_match = re.fullmatch(r"/api/modpacks/([0-9a-f]{32})", path)
            if pack_match:
                if not app.library.delete_modpack(pack_match.group(1)):
                    self._json(404, {"error": "Modpack no encontrado."})
                    return
                self._json(200, {"ok": True})
                return
            match = re.fullmatch(r"/api/mods/([0-9a-f]{32})", path)
            if not match:
                self._json(404, {"error": "No encontrado."})
                return
            if not app.library.delete(match.group(1)):
                self._json(404, {"error": "Mod no encontrado."})
                return
            self._json(200, {"ok": True})

        def _export(self, filt: dict) -> None:
            ids = filt.get("ids")
            if ids is not None:
                for item in ids:
                    if not isinstance(item, str) or not _ID.match(item):
                        raise ValueError("Hay un mod seleccionado que no existe.")
            stamp = datetime.now().strftime("%Y%m%d-%H%M")
            pack_name = filt.get("modpack")
            if filt["scope"] == "modpack" and pack_name:
                pack = app.library.get_modpack(str(pack_name))
                if pack:
                    pack_name = pack.get("name") or pack_name
            label = export_label(
                scope=filt["scope"],
                platform=filt.get("platform"),
                game=filt.get("game"),
                modpack=str(pack_name) if pack_name else None,
            )
            dest = app.tmp / f"{label}-{stamp}-{uuid.uuid4().hex[:6]}.zip"
            try:
                export_library(
                    app.library,
                    dest,
                    ids,
                    scope=filt["scope"],
                    platform=filt.get("platform"),
                    game=filt.get("game"),
                    modpack=filt.get("modpack"),
                )
                self._file(dest, "application/zip", f"{label}-{stamp}.zip")
            finally:
                dest.unlink(missing_ok=True)

        def _media(self, relative: str) -> None:
            if not relative.startswith("images/") or ".." in relative:
                self._json(404, {"error": "No encontrado."})
                return
            try:
                path = app.library.absolute(relative)
            except ValueError:
                self._json(404, {"error": "No encontrado."})
                return
            types = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
            kind = types.get(path.suffix.lower())
            if not kind or not path.is_file():
                self._json(404, {"error": "No encontrado."})
                return
            self._file(path, kind)

        def _json_body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 2_000_000:
                raise ValueError("La petición es demasiado grande.")
            raw = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise ValueError("JSON inválido.") from exc
            if not isinstance(data, dict):
                raise ValueError("JSON inválido.")
            return data

        def _json(
            self,
            code: int,
            payload: dict,
            token: str | None = None,
            clear_cookie: bool = False,
            remember: bool = False,
        ) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if token:
                stay = "; Max-Age=5184000" if remember else ""
                self.send_header("Set-Cookie", f"wi_session={token}; HttpOnly; Path=/; SameSite=Lax{stay}")
            if clear_cookie:
                self.send_header("Set-Cookie", "wi_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax")
            self.end_headers()
            self.wfile.write(data)

        def _file(self, path: Path, content_type: str, download_name: str | None = None) -> None:
            if not path.is_file():
                self._json(404, {"error": "No encontrado."})
                return
            size = path.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "no-store")
            if download_name:
                self.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
            self.end_headers()
            with path.open("rb") as handle:
                shutil.copyfileobj(handle, self.wfile, length=1024 * 1024)

        def _fail(self, exc: Exception) -> None:
            if isinstance(exc, NexusError):
                self._json(exc.status or 400, {"error": str(exc)})
                return
            if isinstance(exc, RawgError):
                self._json(exc.status or 400, {"error": str(exc)})
                return
            if isinstance(exc, TranslateError):
                self._json(400, {"error": str(exc)})
                return
            if isinstance(exc, DuplicateMod):
                mod = exc.mod or {}
                self._json(409, {
                    "error": "Ese mod ya está en la biblioteca.",
                    "duplicate": True,
                    "existingId": mod.get("id") or "",
                    "existingName": mod.get("name") or "",
                })
                return
            if isinstance(exc, ValueError):
                self._json(400, {"error": str(exc)})
                return
            self._json(500, {"error": "Error interno de wi-mod."})

    return Handler


def _mod_action(path: str) -> tuple[str | None, str | None]:
    match = re.fullmatch(r"/api/mods/([0-9a-f]{32})/(refresh|files|download|translate)", path)
    if not match:
        return None, None
    return match.group(1), match.group(2)


def _translate_mod(app: App, mod_id: str) -> dict:
    mod = app.library.get(mod_id)
    if not mod:
        raise ValueError("Mod no encontrado.")
    source = str(mod.get("summary") or "").strip()
    if not source:
        raise ValueError("Este mod no tiene descripción para traducir.")
    translated = translate_text(source, source="en", target="es")
    updated = app.library.update(mod_id, {"summaryEs": translated})
    return {"mod": _public_mod(updated), "text": translated}


def _api_key(app: App) -> str:
    key = str(app.library.settings().get("apiKey") or "").strip()
    if not key:
        raise NexusError("Agrega tu clave API en Ajustes.", 401)
    return key


def _lang(app: App) -> str:
    raw = str(app.library.settings().get("language") or "es").lower()
    return "en" if raw.startswith("en") else "es"


def _theme(app: App) -> str:
    return _theme_name(app.library.settings().get("theme"))


def _theme_name(value: object) -> str:
    raw = str(value or "nexus").strip().lower()
    if raw in {"nexus", "modrinth", "curseforge", "steam"}:
        return raw
    return "nexus"


def _platform_for_url(url: str) -> str:
    parsed = urlparse(url or "")
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if "modrinth.com" in host:
        return "Modrinth"
    if "curseforge.com" in host:
        return "CurseForge"
    if "steamcommunity.com" in host and any(bit in path for bit in ("workshop", "sharedfiles", "filedetails")):
        return "Steam Workshop"
    return "Independiente"


def _to_es(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    try:
        return translate_text(raw[:1800], source="en", target="es")
    except TranslateError:
        return ""


def _localize_mod_fields(app: App, fields: dict) -> dict:
    if _lang(app) != "es":
        return fields
    summary = str(fields.get("summary") or "").strip()
    if summary and not str(fields.get("summaryEs") or "").strip():
        translated = _to_es(summary)
        if translated:
            fields["summaryEs"] = translated
    return fields


def _localize_game(app: App, game: dict) -> dict:
    if _lang(app) != "es" or not isinstance(game, dict):
        return game
    description = str(game.get("description") or "").strip()
    if description and not str(game.get("descriptionEs") or "").strip():
        translated = _to_es(description)
        if translated:
            game["descriptionEs"] = translated
    return game


def _localize_missing(app: App) -> dict:
    mods_done = 0
    games_done = 0
    if _lang(app) != "es":
        return {"mods": 0, "games": 0, "language": "en"}
    for mod in app.library.list_mods():
        summary = str(mod.get("summary") or "").strip()
        if not summary or str(mod.get("summaryEs") or "").strip():
            continue
        translated = _to_es(summary)
        if not translated:
            continue
        app.library.update(mod["id"], {"summaryEs": translated})
        mods_done += 1
        if mods_done >= 40:
            break
    catalog = app.library.catalog()
    for item in catalog.get("games") or []:
        if not isinstance(item, dict):
            continue
        description = str(item.get("description") or "").strip()
        if not description or str(item.get("descriptionEs") or "").strip():
            continue
        translated = _to_es(description)
        if not translated:
            continue
        payload = dict(item)
        payload["descriptionEs"] = translated
        app.library.add_catalog_item("game", payload)
        games_done += 1
        if games_done >= 20:
            break
    return {"mods": mods_done, "games": games_done, "language": "es", "catalog": app.library.catalog()}


def _preview(app: App, url: str) -> dict:
    parsed = parse_mod_url(url)
    if not parsed:
        return _preview_official(app, url)
    meta = fetch_mod(_api_key(app), parsed[0], parsed[1], app.cache)
    existing = app.library.find_nexus(parsed[0], parsed[1])
    meta["duplicate"] = existing is not None
    if existing:
        meta["existingId"] = existing.get("id") or ""
        meta["existingName"] = existing.get("name") or ""
    return _localize_mod_fields(app, meta)


def _preview_official(app: App, url: str) -> dict:
    page = _official_page(url)
    existing = app.library.find_page(page["url"])
    meta = {
        "nexusUrl": page["url"],
        "platform": _platform_for_url(page["url"]),
        "name": page["title"],
        "summary": page["summary"],
        "author": page["site"],
        "gameDomain": "",
        "gameName": "",
        "category": "General",
        "official": True,
        "duplicate": existing is not None,
    }
    if existing:
        meta["existingId"] = existing.get("id") or ""
        meta["existingName"] = existing.get("name") or ""
    return _localize_mod_fields(app, meta)


def _official_page(url: str) -> dict:
    text = (url or "").strip()
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Pega un enlace http(s) de la página oficial.")
    if parse_mod_url(text):
        raise ValueError("Ese enlace es de Nexus, no una página oficial.")
    title, summary = _peek_html(text)
    site = parsed.netloc.lower().removeprefix("www.")
    return {
        "url": text,
        "title": title or site,
        "summary": summary,
        "site": site,
    }


def _peek_html(url: str) -> tuple[str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "wi-mod/0.1.0"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=12) as res:
            raw = res.read(80_000)
            charset = "utf-8"
            content_type = res.headers.get("Content-Type") or ""
            if "charset=" in content_type.lower():
                charset = content_type.lower().split("charset=", 1)[1].split(";", 1)[0].strip() or "utf-8"
            html = raw.decode(charset, errors="replace")
    except (urllib.error.URLError, TimeoutError, ValueError):
        return "", ""
    title = ""
    summary = ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if title_match:
        title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", title_match.group(1))).strip()[:180]
    desc_match = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
        html,
        re.IGNORECASE | re.DOTALL,
    ) or re.search(
        r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']',
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if desc_match:
        summary = re.sub(r"\s+", " ", desc_match.group(1)).strip()[:1000]
    return title, summary


def _create(app: App, body: dict) -> dict:
    fields = _fields_from_body(app, body)
    mode = str(body.get("mode") or "").strip().lower()
    platform = str(fields.get("platform") or "")
    if platform in {"Independiente", "Modrinth", "CurseForge", "Steam Workshop"}:
        existing = app.library.find_page(str(fields.get("nexusUrl") or ""))
    else:
        game = str(fields.get("gameDomain") or "")
        nexus_id = fields.get("modId")
        existing = app.library.find_nexus(game, nexus_id) if game and isinstance(nexus_id, int) else None
    if existing and mode not in {"replace", "duplicate"}:
        raise DuplicateMod(existing)
    if platform in {"Independiente", "Modrinth", "CurseForge", "Steam Workshop"}:
        app.library.add_catalog_item("platform", {"name": platform})
    mod = app.library.add(fields, mode="duplicate" if mode == "duplicate" else "replace")
    return _with_picture(app, mod)


def _refresh_one(app: App, mod_id: str, apply: bool = False) -> dict:
    mod = app.library.get(mod_id)
    if not mod:
        raise ValueError("Mod no encontrado.")
    parsed = parse_mod_url(mod.get("nexusUrl") or "")
    if not parsed:
        raise ValueError("Este mod no tiene enlace de Nexus.")
    remote = fetch_mod(_api_key(app), parsed[0], parsed[1], app.cache)
    checked = now()
    app.library.set_checked(mod_id, checked)
    # Las cifras de Nexus siempre se refrescan; no afectan la versión instalada.
    app.library.sync_stats(mod_id, remote)
    changed = _has_update(mod, remote)
    preview = {
        "name": remote.get("name") or "",
        "version": remote.get("version") or "",
        "updatedAt": remote.get("updatedAt"),
        "category": remote.get("category") or "",
        "endorsements": remote.get("endorsements") or 0,
        "downloads": remote.get("downloads") or 0,
        "uniqueDownloads": remote.get("uniqueDownloads") or 0,
        "primaryFileId": remote.get("primaryFileId"),
        "primaryFileName": remote.get("primaryFileName"),
    }
    if not changed:
        fresh = app.library.get(mod_id)
        return {
            "changed": False,
            "applied": False,
            "checkedAt": checked,
            "remote": preview,
            "mod": _public_mod(fresh),
        }
    if not apply:
        fresh = app.library.get(mod_id)
        return {
            "changed": True,
            "applied": False,
            "checkedAt": checked,
            "remote": preview,
            "local": {
                "version": mod.get("version") or "",
                "updatedAt": mod.get("updatedAt"),
            },
            "mod": _public_mod(fresh),
        }
    remote["fetchedAt"] = checked
    remote["checkedAt"] = checked
    _localize_mod_fields(app, remote)
    updated = app.library.apply_remote(mod_id, remote)
    return {
        "changed": True,
        "applied": True,
        "checkedAt": checked,
        "remote": preview,
        "mod": _public_mod(_with_picture(app, updated or mod)),
    }


def _has_update(local: dict, remote: dict) -> bool:
    local_updated = str(local.get("updatedAt") or "")
    remote_updated = str(remote.get("updatedAt") or "")
    if remote_updated and local_updated and remote_updated > local_updated:
        return True
    local_version = str(local.get("version") or "").strip()
    remote_version = str(remote.get("version") or "").strip()
    if remote_version and local_version and remote_version != local_version:
        if remote_updated and local_updated:
            return remote_updated > local_updated
        return True
    local_file = local.get("primaryFileId")
    remote_file = remote.get("primaryFileId")
    if remote_file and local_file and remote_file != local_file:
        return True
    if remote_updated and not local_updated:
        return True
    return False


def _refresh_all(app: App) -> dict:
    checked = 0
    available = 0
    failed = []
    for mod in app.library.list_mods():
        if not parse_mod_url(mod.get("nexusUrl") or ""):
            continue
        try:
            result = _refresh_one(app, mod["id"], apply=False)
            checked += 1
            if result.get("changed"):
                available += 1
        except (NexusError, ValueError) as exc:
            failed.append({"id": mod["id"], "name": mod.get("name") or "", "error": str(exc)})
            if isinstance(exc, NexusError) and exc.status == 429:
                break
    return {"checked": checked, "available": available, "failed": failed}


def _fields_from_body(app: App, body: dict) -> dict:
    url = str(body.get("url") or "").strip()
    parsed = parse_mod_url(url) if url else None
    if url and not parsed:
        return _official_fields(app, body, url)
    category = str(body.get("category") or "").strip()
    notes = str(body.get("notes") or "")
    manual = body.get("manual") if isinstance(body.get("manual"), dict) else None
    key = str(app.library.settings().get("apiKey") or "").strip()
    fetched = None
    if parsed and key and manual is None:
        fetched = fetch_mod(key, parsed[0], parsed[1], app.cache)
    if fetched:
        fetched["fetchedAt"] = now()
        fetched["categorySource"] = "nexus"
        fetched["platform"] = str(body.get("platform") or fetched.get("platform") or "Nexus").strip() or "Nexus"
        fetched["modpackId"] = str(body.get("modpackId") or "").strip()
        fetched["modpackCategoryId"] = str(body.get("modpackCategoryId") or "").strip()
        fetched["modpackNotes"] = str(body.get("modpackNotes") or "")
        fetched["notes"] = notes
        fetched["techNotes"] = str(body.get("techNotes") or "")
        fetched["compatNotes"] = str(body.get("compatNotes") or "")
        fetched["emoji"] = str(body.get("emoji") or "").strip()[:12]
        fetched["skill"] = str(body.get("skill") or "").strip()[:80]
        fetched["rule"] = str(body.get("rule") or "").strip()[:80]
        if category and category != fetched.get("category"):
            fetched["category"] = category
            fetched["categorySource"] = "user"
        return _localize_mod_fields(app, fetched)
    source = manual or {}
    name = str(source.get("name") or "").strip()
    if not name:
        if not key:
            raise NexusError("Agrega tu clave API en Ajustes para detectar el mod.", 401)
        raise ValueError("No se pudo leer el mod. Completa el nombre a mano.")
    game = parsed[0] if parsed else str(source.get("gameDomain") or "")
    return {
        "nexusUrl": canonical_url(parsed[0], parsed[1]) if parsed else url,
        "platform": str(body.get("platform") or source.get("platform") or "Nexus").strip() or "Nexus",
        "modpackId": str(body.get("modpackId") or source.get("modpackId") or "").strip(),
        "modpackCategoryId": str(body.get("modpackCategoryId") or source.get("modpackCategoryId") or "").strip(),
        "modpackNotes": str(body.get("modpackNotes") or source.get("modpackNotes") or ""),
        "techNotes": str(body.get("techNotes") or source.get("techNotes") or ""),
        "compatNotes": str(body.get("compatNotes") or source.get("compatNotes") or ""),
        "emoji": str(body.get("emoji") or source.get("emoji") or "").strip()[:12],
        "skill": str(body.get("skill") or source.get("skill") or "").strip()[:80],
        "rule": str(body.get("rule") or source.get("rule") or "").strip()[:80],
        "gameDomain": game,
        "gameName": str(source.get("gameName") or "").strip(),
        "modId": parsed[1] if parsed else None,
        "name": name,
        "summary": str(source.get("summary") or "").strip(),
        "author": str(source.get("author") or "").strip(),
        "category": category or str(source.get("category") or "General"),
        "categorySource": "user",
        "version": str(source.get("version") or "").strip(),
        "updatedAt": source.get("updatedAt") or None,
        "pictureUrl": source.get("pictureUrl") or None,
        "notes": notes,
        "fetchedAt": None,
    }


def _official_fields(app: App, body: dict, url: str) -> dict:
    page = _official_page(url)
    manual = body.get("manual") if isinstance(body.get("manual"), dict) else {}
    name = str((manual or {}).get("name") or page["title"] or "").strip()
    if not name:
        raise ValueError("Pon el nombre del mod de la página oficial.")
    game = str(body.get("gameDomain") or (manual or {}).get("gameDomain") or "").strip().lower()
    game_name = str(body.get("gameName") or (manual or {}).get("gameName") or "").strip()
    summary = str((manual or {}).get("summary") or page["summary"] or "").strip()
    fields = {
        "nexusUrl": page["url"],
        "platform": _platform_for_url(page["url"]),
        "modpackId": str(body.get("modpackId") or "").strip(),
        "modpackCategoryId": str(body.get("modpackCategoryId") or "").strip(),
        "modpackNotes": str(body.get("modpackNotes") or ""),
        "techNotes": "",
        "compatNotes": "",
        "emoji": "",
        "skill": "",
        "rule": "",
        "gameDomain": game,
        "gameName": game_name,
        "modId": None,
        "name": name,
        "summary": summary,
        "author": str((manual or {}).get("author") or page["site"]).strip(),
        "category": str(body.get("category") or (manual or {}).get("category") or "General").strip() or "General",
        "categorySource": "user",
        "version": str((manual or {}).get("version") or "").strip(),
        "updatedAt": None,
        "pictureUrl": None,
        "notes": str(body.get("notes") or ""),
        "fetchedAt": now(),
        "official": True,
    }
    return _localize_mod_fields(app, fields)


def _with_picture(app: App, mod: dict | None) -> dict:
    if not mod:
        raise ValueError("Mod no encontrado.")
    url = mod.get("pictureUrl")
    if not url:
        return mod
    saved = download_picture(url, app.root / "images" / mod["id"])
    if not saved:
        return mod
    relative = saved.relative_to(app.root).as_posix()
    app.library.set_picture(mod["id"], relative)
    return app.library.get(mod["id"]) or mod


def _download_mod(app: App, mod_id: str) -> dict:
    mod = app.library.get(mod_id)
    if not mod:
        raise ValueError("Mod no encontrado.")
    parsed = parse_mod_url(mod.get("nexusUrl") or "")
    files_url = mod.get("filesUrl") or (
        f"{mod.get('nexusUrl')}?tab=files" if mod.get("nexusUrl") else ""
    )
    if not parsed:
        return {
            "ok": False,
            "reason": "manual",
            "filesUrl": files_url,
            "error": "Este mod no tiene enlace de Nexus.",
            "mod": _public_mod(mod),
        }
    game, nexus_id = parsed
    key = _api_key(app)
    file_id = mod.get("primaryFileId")
    file_name = mod.get("primaryFileName") or "mod.zip"
    if not file_id:
        remote = fetch_mod(key, game, nexus_id, app.cache)
        file_id = remote.get("primaryFileId")
        file_name = remote.get("primaryFileName") or file_name
        app.library.apply_remote(mod_id, remote)
        files_url = remote.get("filesUrl") or files_url
    if not file_id:
        return {
            "ok": False,
            "reason": "nofile",
            "filesUrl": files_url,
            "error": "Nexus no marcó un archivo principal.",
            "mod": _public_mod(app.library.get(mod_id)),
        }
    try:
        links = download_links(key, game, nexus_id, int(file_id))
    except NexusError as exc:
        return {
            "ok": False,
            "reason": "premium" if exc.status in (403, 400) else "error",
            "filesUrl": files_url,
            "error": (
                "Nexus solo deja descargar por API con cuenta Premium. Abre Files en el navegador."
                if exc.status in (403, 400)
                else str(exc)
            ),
            "mod": _public_mod(app.library.get(mod_id)),
        }
    uri = next(
        (
            str(item.get("URI") or item.get("uri") or "")
            for item in links
            if item.get("URI") or item.get("uri")
        ),
        "",
    )
    if not uri.startswith("https://"):
        return {
            "ok": False,
            "reason": "premium",
            "filesUrl": files_url,
            "error": "Nexus no dio enlace directo. Abre Files en el navegador.",
            "mod": _public_mod(app.library.get(mod_id)),
        }
    dest = app.tmp / f"dl-{uuid.uuid4().hex}-{safe_name(file_name)}"
    try:
        _fetch_binary(uri, dest)
        app.library.add_file(mod_id, file_name, dest)
    finally:
        dest.unlink(missing_ok=True)
    return {
        "ok": True,
        "reason": "saved",
        "filesUrl": files_url,
        "mod": _public_mod(app.library.get(mod_id)),
    }


def _fetch_binary(url: str, dest: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "wi-mod/0.1.0", "Accept": "*/*"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as res, dest.open("wb") as handle:
        while True:
            chunk = res.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def _save_image(app: App, handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length <= 0 or length > 8 * 1024 * 1024:
        raise ValueError("La imagen tiene que pesar menos de 8 MB.")
    work = app.tmp / uuid.uuid4().hex
    try:
        parts = parse_multipart(handler.rfile, length, handler.headers.get("Content-Type") or "", work)
        for part in parts:
            if not part.get("filename") or not part.get("path"):
                continue
            ext = Path(part["filename"]).suffix.lower()
            if ext == ".jpeg":
                ext = ".jpg"
            if ext not in {".jpg", ".png", ".webp", ".gif"}:
                raise ValueError("Usa jpg, png, webp o gif.")
            name = f"{uuid.uuid4().hex}{ext}"
            dest = app.root / "images" / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(part["path"], dest)
            return {"imageUrl": f"/media/images/{name}"}
        raise ValueError("Elige una imagen.")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _upload(app: App, handler: BaseHTTPRequestHandler, mod_id: str) -> dict:
    if not app.library.get(mod_id):
        raise ValueError("Mod no encontrado.")
    length = int(handler.headers.get("Content-Length") or 0)
    work = app.tmp / uuid.uuid4().hex
    try:
        parts = parse_multipart(handler.rfile, length, handler.headers.get("Content-Type") or "", work)
        stored = False
        for part in parts:
            if not part.get("filename") or not part.get("path"):
                continue
            app.library.add_file(mod_id, part["filename"], Path(part["path"]))
            stored = True
        if not stored:
            raise ValueError("No llegó ningún archivo.")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    mod = app.library.get(mod_id)
    if not mod:
        raise ValueError("Mod no encontrado.")
    return mod


def _pack_filter(body: dict) -> dict:
    scope = str(body.get("scope") or "all").strip().lower() or "all"
    if scope not in {"all", "platform", "game", "modpack", "selected"}:
        raise ValueError("Alcance no válido.")
    ids = body.get("ids")
    if ids is not None and not isinstance(ids, list):
        raise ValueError("La selección de mods no es válida.")
    return {
        "scope": scope,
        "platform": str(body.get("platform") or "").strip() or None,
        "game": str(body.get("game") or body.get("gameDomain") or "").strip() or None,
        "modpack": str(body.get("modpack") or "").strip() or None,
        "ids": ids,
    }


def _import(app: App, handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    work = app.tmp / uuid.uuid4().hex
    try:
        parts = parse_multipart(handler.rfile, length, handler.headers.get("Content-Type") or "", work)
        archive = next((Path(part["path"]) for part in parts if part.get("filename")), None)
        if archive is None:
            raise ValueError("Elige un paquete .zip de wi-mod.")
        fields = {
            str(part.get("name") or ""): str(part.get("text") or "").strip()
            for part in parts
            if part.get("filename") is None
        }
        filt = _pack_filter(fields)
        return import_library(
            app.library,
            archive,
            scope=filt["scope"],
            platform=filt.get("platform"),
            game=filt.get("game"),
            modpack=filt.get("modpack"),
        )
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _public_mod(mod: dict | None) -> dict:
    return dict(mod) if mod else {}


def _public_pack(pack: dict | None) -> dict:
    return dict(pack) if pack else {}


def _public_settings(settings: dict) -> dict:
    key = str(settings.get("apiKey") or "")
    rawg = str(settings.get("rawgApiKey") or "")
    profile = settings.get("profile") or {}
    hint = ""
    if len(key) > 8:
        hint = f"{key[:4]}…{key[-4:]}"
    elif key:
        hint = "••••"
    rawg_hint = ""
    if len(rawg) > 8:
        rawg_hint = f"{rawg[:4]}…{rawg[-4:]}"
    elif rawg:
        rawg_hint = "••••"
    return {
        "hasKey": bool(key),
        "hint": hint,
        "hasRawgKey": bool(rawg),
        "rawgHint": rawg_hint,
        "language": "en" if str(settings.get("language") or "es").lower().startswith("en") else "es",
        "theme": _theme_name(settings.get("theme")),
        "profile": {
            "name": profile.get("name") or "",
            "isPremium": bool(profile.get("isPremium")),
            "hourlyRemaining": profile.get("hourlyRemaining"),
            "dailyRemaining": profile.get("dailyRemaining"),
        },
    }


def _rawg_key(app: App) -> str:
    key = str(app.library.settings().get("rawgApiKey") or "").strip()
    if not key:
        raise ValueError("Falta la clave API de RAWG en Ajustes.")
    return key


def _rawg_search(app: App, query: str) -> list[dict]:
    try:
        return search_games(_rawg_key(app), query)
    except RawgError as exc:
        raise ValueError(str(exc)) from exc


def _enrich_game_from_rawg(app: App, body: dict) -> dict:
    rawg_id = body.get("rawgId")
    try:
        game = get_game(_rawg_key(app), rawg_id)
    except RawgError as exc:
        raise ValueError(str(exc)) from exc
    merged = dict(game)
    merged.update({k: v for k, v in body.items() if v not in (None, "")})
    return merged


def _add_game_from_rawg(app: App, body: dict) -> dict:
    rawg_id = body.get("rawgId") or body.get("id")
    if not rawg_id:
        raise ValueError("Falta el id de RAWG.")
    try:
        game = get_game(_rawg_key(app), rawg_id)
    except RawgError as exc:
        raise ValueError(str(exc)) from exc
    domain_override = str(body.get("gameDomain") or "").strip().lower()
    if domain_override:
        game["gameDomain"] = domain_override
    game = _localize_game(app, game)
    app.library.add_catalog_item("game", game)
    return game


def _rawg_resolve(app: App, domain: str, name: str) -> dict | None:
    domain = (domain or "").strip().lower()
    name = (name or "").strip()
    catalog = app.library.catalog()
    existing = next(
        (
            item
            for item in (catalog.get("games") or [])
            if isinstance(item, dict) and str(item.get("gameDomain") or "").lower() == domain
        ),
        None,
    )
    if existing and existing.get("description") and existing.get("imageUrl") and "steamAppId" in existing:
        game = dict(existing)
        if _lang(app) == "es" and not str(game.get("descriptionEs") or "").strip():
            game = _localize_game(app, game)
            if game.get("descriptionEs"):
                app.library.add_catalog_item("game", game)
        return game
    if existing and existing.get("rawgId"):
        try:
            game = get_game(_rawg_key(app), existing["rawgId"])
            if domain:
                game["gameDomain"] = domain
            game = _localize_game(app, game)
            app.library.add_catalog_item("game", game)
            return game
        except RawgError as exc:
            raise ValueError(str(exc)) from exc
    try:
        game = resolve_game(
            _rawg_key(app),
            domain=domain,
            name=name or str((existing or {}).get("gameName") or ""),
        )
    except RawgError as exc:
        raise ValueError(str(exc)) from exc
    if not game:
        return existing
    if domain:
        game["gameDomain"] = domain
    game = _localize_game(app, game)
    app.library.add_catalog_item("game", game)
    return game
