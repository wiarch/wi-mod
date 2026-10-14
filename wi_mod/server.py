"""Servidor local de wi-mod. Solo escucha en 127.0.0.1."""

from __future__ import annotations

import json
import re
import shutil
import sys
import uuid
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from wi_mod.archive import export_library, import_library
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
from wi_mod.store import Library, now, safe_name
from wi_mod.translate import TranslateError, translate_text

def _locations() -> tuple[Path, Path]:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS), Path(sys.executable).resolve().parent
    here = Path(__file__).resolve().parent.parent
    return here, here


BUNDLE, ROOT = _locations()
WEB = BUNDLE / "web"
_ID = re.compile(r"^[0-9a-f]{32}$")


class App:
    def __init__(self, root: Path):
        self.root = root
        self.library = Library(root)
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

        def _get(self) -> None:
            path = urlparse(self.path).path
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
                self._json(200, {"mods": [_public_mod(mod) for mod in mods]})
                return
            if path == "/api/settings":
                self._json(200, _public_settings(app.library.settings()))
                return
            if path.startswith("/media/"):
                rel = unquote(path[len("/media/") :])
                self._media(rel)
                return
            self._json(404, {"error": "No encontrado."})

        def _post(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/preview":
                body = self._json_body()
                self._json(200, _preview(app, str(body.get("url") or "")))
                return
            if path == "/api/mods":
                body = self._json_body()
                mod = _create(app, body)
                self._json(201, {"mod": _public_mod(mod)})
                return
            if path == "/api/refresh":
                self._json(200, _refresh_all(app))
                return
            if path == "/api/export":
                body = self._json_body()
                ids = body.get("ids")
                if ids is not None and not isinstance(ids, list):
                    raise ValueError("La selección de mods no es válida.")
                self._export(ids)
                return
            if path == "/api/import":
                self._json(200, {"result": _import(app, self)})
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
            if mod_id and action == "files":
                mod = _upload(app, self, mod_id)
                self._json(200, {"mod": _public_mod(mod)})
                return
            if mod_id and action == "download":
                self._json(200, _download_mod(app, mod_id))
                return
            if mod_id and action == "translate":
                self._json(200, _translate_mod(app, mod_id))
                return
            self._json(404, {"error": "No encontrado."})

        def _put(self) -> None:
            path = urlparse(self.path).path
            if path != "/api/settings":
                self._json(404, {"error": "No encontrado."})
                return
            body = self._json_body()
            key = str(body.get("apiKey") or "").strip()
            if not key:
                app.library.set_api_key("", {})
                self._json(200, _public_settings(app.library.settings()))
                return
            profile = validate_key(key)
            app.library.set_api_key(key, profile)
            self._json(200, _public_settings(app.library.settings()))

        def _patch(self) -> None:
            path = urlparse(self.path).path
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
            match = re.fullmatch(r"/api/mods/([0-9a-f]{32})", path)
            if not match:
                self._json(404, {"error": "No encontrado."})
                return
            if not app.library.delete(match.group(1)):
                self._json(404, {"error": "Mod no encontrado."})
                return
            self._json(200, {"ok": True})

        def _export(self, ids: list[str] | None) -> None:
            if ids is not None:
                for item in ids:
                    if not isinstance(item, str) or not _ID.match(item):
                        raise ValueError("Hay un mod seleccionado que no existe.")
            stamp = datetime.now().strftime("%Y%m%d-%H%M")
            dest = app.tmp / f"wi-mod-{stamp}-{uuid.uuid4().hex[:6]}.zip"
            try:
                export_library(app.library, dest, ids)
                self._file(dest, "application/zip", f"wi-mod-{stamp}.zip")
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

        def _json(self, code: int, payload: dict) -> None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
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
            if isinstance(exc, TranslateError):
                self._json(400, {"error": str(exc)})
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


def _preview(app: App, url: str) -> dict:
    parsed = parse_mod_url(url)
    if not parsed:
        raise ValueError("El enlace no es un mod de nexusmods.com.")
    meta = fetch_mod(_api_key(app), parsed[0], parsed[1], app.cache)
    meta["duplicate"] = app.library.find_nexus(parsed[0], parsed[1]) is not None
    return meta


def _create(app: App, body: dict) -> dict:
    fields = _fields_from_body(app, body)
    mod = app.library.add(fields)
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
    changed = _has_update(mod, remote)
    preview = {
        "name": remote.get("name") or "",
        "version": remote.get("version") or "",
        "updatedAt": remote.get("updatedAt"),
        "category": remote.get("category") or "",
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
        raise ValueError("El enlace no es un mod de nexusmods.com.")
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
        fetched["notes"] = notes
        if category and category != fetched.get("category"):
            fetched["category"] = category
            fetched["categorySource"] = "user"
        return fetched
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


def _import(app: App, handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    work = app.tmp / uuid.uuid4().hex
    try:
        parts = parse_multipart(handler.rfile, length, handler.headers.get("Content-Type") or "", work)
        archive = next((Path(part["path"]) for part in parts if part.get("filename")), None)
        if archive is None:
            raise ValueError("Elige un paquete .zip de wi-mod.")
        return import_library(app.library, archive)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _public_mod(mod: dict | None) -> dict:
    return dict(mod) if mod else {}


def _public_settings(settings: dict) -> dict:
    key = str(settings.get("apiKey") or "")
    profile = settings.get("profile") or {}
    hint = ""
    if len(key) > 8:
        hint = f"{key[:4]}…{key[-4:]}"
    elif key:
        hint = "••••"
    return {
        "hasKey": bool(key),
        "hint": hint,
        "profile": {
            "name": profile.get("name") or "",
            "isPremium": bool(profile.get("isPremium")),
            "hourlyRemaining": profile.get("hourlyRemaining"),
            "dailyRemaining": profile.get("dailyRemaining"),
        },
    }
