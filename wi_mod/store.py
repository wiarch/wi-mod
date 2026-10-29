"""Biblioteca local de mods."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import shutil
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ADMIN_USER = "WYDEX"
REMEMBER_DAYS = 60
DISABLED_SUFFIX = ".disabled"


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _norm_url(url: str) -> str:
    text = (url or "").strip()
    if not text:
        return ""
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(text)
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


class Library:
    def __init__(self, root: Path, program_root: Path | None = None):
        self.root = root
        self.program_root = (program_root or root.parent).resolve()
        self.path = root / "library.json"
        self.settings_path = root / "settings.json"
        self.db_path = root / "wi-mod.sqlite"
        self._lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.program_root / "mods").mkdir(parents=True, exist_ok=True)
        self._init_db()

    def list_mods(self) -> list[dict[str, Any]]:
        with self._lock:
            data = self._read()
            if self._migrate(data):
                self._write(data)
            return list(data["mods"])

    def list_modpacks(self) -> list[dict[str, Any]]:
        with self._lock:
            data = self._read()
            if self._migrate(data):
                self._write(data)
            return list(data.get("modpacks") or [])

    def get(self, mod_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._find(self._read()["mods"], mod_id)

    def get_modpack(self, pack_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._find_pack(self._read().get("modpacks") or [], pack_id)

    def find_nexus(self, game: str, nexus_id: int) -> dict[str, Any] | None:
        with self._lock:
            for mod in self._read()["mods"]:
                if mod.get("gameDomain") == game and mod.get("modId") == nexus_id:
                    return mod
        return None

    def find_page(self, url: str) -> dict[str, Any] | None:
        target = _norm_url(url)
        if not target:
            return None
        with self._lock:
            for mod in self._read()["mods"]:
                if _norm_url(str(mod.get("nexusUrl") or "")) == target:
                    return mod
        return None

    def add(self, fields: dict[str, Any], *, mode: str = "replace") -> dict[str, Any]:
        with self._lock:
            data = self._read()
            game = fields.get("gameDomain") or ""
            nexus_id = fields.get("modId")
            existing = None
            page = _norm_url(str(fields.get("nexusUrl") or ""))
            platform = str(fields.get("platform") or "")
            # filedetails/?id= se queda sin query en _norm_url; no deduplicar Workshop por esa URL.
            if mode != "duplicate" and platform == "Steam Workshop" and isinstance(nexus_id, int) and nexus_id > 0:
                for mod in data["mods"]:
                    if str(mod.get("platform") or "") != "Steam Workshop":
                        continue
                    try:
                        same = int(mod.get("modId") or 0) == nexus_id
                    except (TypeError, ValueError):
                        same = False
                    if same:
                        existing = mod
                        break
            elif mode != "duplicate" and platform in {
                "Independiente", "Modrinth", "CurseForge", "ModDB",
            } and page:
                for mod in data["mods"]:
                    if _norm_url(str(mod.get("nexusUrl") or "")) == page:
                        existing = mod
                        break
            elif mode != "duplicate" and game and isinstance(nexus_id, int):
                for mod in data["mods"]:
                    if mod.get("gameDomain") == game and mod.get("modId") == nexus_id:
                        existing = mod
                        break
            if existing:
                self._apply_meta(existing, fields, overwrite_user=False)
                if "modpackId" in fields or "modpackCategoryId" in fields or "modpack" in fields:
                    self._assign_pack(existing, fields, data.get("modpacks") or [])
                existing["fetchedAt"] = fields.get("fetchedAt")
                self._write(data)
                return existing
            mod = self._blank()
            self._apply_meta(mod, fields, overwrite_user=True)
            mod["notes"] = str(fields.get("notes") or "")
            mod["techNotes"] = str(fields.get("techNotes") or "")[:4000]
            mod["compatNotes"] = str(fields.get("compatNotes") or "")[:4000]
            mod["emoji"] = str(fields.get("emoji") or "").strip()[:12]
            mod["skill"] = str(fields.get("skill") or "").strip()[:80]
            mod["rule"] = str(fields.get("rule") or "").strip()[:80]
            self._assign_pack(mod, fields, data.get("modpacks") or [])
            self._stamp_pack_order(mod, data["mods"])
            self._stamp_priority(mod, data["mods"])
            if "modpackNotes" in fields:
                mod["modpackNotes"] = str(fields.get("modpackNotes") or "")[:4000]
            mod["addedAt"] = now()
            mod["fetchedAt"] = fields.get("fetchedAt")
            data["mods"].insert(0, mod)
            self._write(data)
            return mod

    def update(self, mod_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            self._migrate(data)
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            packs = data.get("modpacks") or []
            before_key = self._mod_location_key(mod, packs)
            before_in = "in" in str(mod.get("status") or "").split("+")
            self._apply_user(mod, fields, packs)
            self._stamp_pack_order(mod, data["mods"])
            if "priority" in fields:
                self._place_priority(mod, data["mods"], fields.get("priority"))
            after_in = "in" in str(mod.get("status") or "").split("+")
            after_key = self._mod_location_key(mod, packs)
            if before_key != after_key:
                self._relocate_mod_files(mod, packs)
            elif "status" in fields and before_in != after_in:
                self._sync_mod_files_enabled(mod, after_in)
            self._write(data)
            return mod

    def update_many(self, ids: list[Any], fields: dict[str, Any]) -> list[dict[str, Any]]:
        clean: list[str] = []
        seen: set[str] = set()
        for raw in ids or []:
            mod_id = str(raw or "").strip()
            if not mod_id or mod_id in seen:
                continue
            seen.add(mod_id)
            clean.append(mod_id)
        if not clean:
            raise ValueError("Marca al menos un mod.")
        if len(clean) > 200:
            raise ValueError("Demasiados mods a la vez.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            packs = data.get("modpacks") or []
            updated: list[dict[str, Any]] = []
            for mod_id in clean:
                mod = self._find(data["mods"], mod_id)
                if not mod:
                    raise ValueError("Hay un mod marcado que ya no existe.")
                before_key = self._mod_location_key(mod, packs)
                before_in = "in" in str(mod.get("status") or "").split("+")
                self._apply_user(mod, fields, packs)
                self._stamp_pack_order(mod, data["mods"])
                after_in = "in" in str(mod.get("status") or "").split("+")
                after_key = self._mod_location_key(mod, packs)
                if before_key != after_key:
                    self._relocate_mod_files(mod, packs)
                elif "status" in fields and before_in != after_in:
                    self._sync_mod_files_enabled(mod, after_in)
                updated.append(mod)
            self._write(data)
            return updated

    def _mod_downloaded(self, mod: dict[str, Any]) -> bool:
        files = mod.get("files") or []
        return any(isinstance(item, dict) and str(item.get("storedAs") or "").strip() for item in files)

    def set_mods_active(self, ids: list[Any], active: bool) -> list[dict[str, Any]]:
        clean: list[str] = []
        seen: set[str] = set()
        for raw in ids or []:
            mod_id = str(raw or "").strip()
            if not mod_id or mod_id in seen:
                continue
            seen.add(mod_id)
            clean.append(mod_id)
        if not clean:
            raise ValueError("Marca al menos un mod.")
        if len(clean) > 500:
            raise ValueError("Demasiados mods a la vez.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            updated: list[dict[str, Any]] = []
            skipped = 0
            for mod_id in clean:
                mod = self._find(data["mods"], mod_id)
                if not mod:
                    raise ValueError("Hay un mod marcado que ya no existe.")
                if not self._mod_downloaded(mod):
                    skipped += 1
                    continue
                flags = {
                    part
                    for part in str(mod.get("status") or "").split("+")
                    if part in {"got", "in"}
                }
                if active:
                    flags.add("in")
                else:
                    flags.discard("in")
                mod["status"] = "+".join(flag for flag in ("got", "in") if flag in flags)
                self._sync_mod_files_enabled(mod, active)
                updated.append(mod)
            if not updated:
                raise ValueError("Solo se pueden activar o desactivar mods descargados.")
            self._write(data)
            return updated

    def set_modpack_active(self, pack_id: str, active: bool) -> list[dict[str, Any]]:
        pack_id = str(pack_id or "").strip()
        if not pack_id:
            raise ValueError("Elige una instancia.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            if not self._find_pack(data.get("modpacks") or [], pack_id):
                raise ValueError("Instancia no encontrada.")
            ids = [
                str(mod.get("id") or "")
                for mod in data.get("mods") or []
                if str(mod.get("modpackId") or "") == pack_id
            ]
        return self.set_mods_active(ids, active)

    def _stored_relative(self, path: Path) -> str:
        resolved = path.resolve()
        try:
            return resolved.relative_to(self.program_root.resolve()).as_posix()
        except ValueError:
            return resolved.relative_to(self.root.resolve()).as_posix()

    def _set_path_enabled(self, path: Path, enabled: bool) -> Path:
        name = path.name
        if enabled:
            if not name.endswith(DISABLED_SUFFIX):
                return path
            target = path.with_name(name[: -len(DISABLED_SUFFIX)])
        else:
            if name.endswith(DISABLED_SUFFIX):
                return path
            target = path.with_name(name + DISABLED_SUFFIX)
        if target.exists() and target != path:
            raise ValueError(f"Ya existe {target.name}.")
        path.rename(target)
        return target

    def _sync_mod_files_enabled(self, mod: dict[str, Any], enabled: bool) -> None:
        for item in mod.get("files") or []:
            if not isinstance(item, dict):
                continue
            relative = str(item.get("storedAs") or "").strip()
            if not relative:
                continue
            try:
                path = self.absolute(relative)
            except ValueError:
                continue
            if not path.exists():
                if path.name.endswith(DISABLED_SUFFIX):
                    other = path.with_name(path.name[: -len(DISABLED_SUFFIX)])
                else:
                    other = path.with_name(path.name + DISABLED_SUFFIX)
                if other.exists():
                    path = other
                else:
                    continue
            try:
                new_path = self._set_path_enabled(path, enabled)
            except OSError as exc:
                raise ValueError(f"No se pudo {'activar' if enabled else 'desactivar'} {path.name}: {exc}") from exc
            item["storedAs"] = self._stored_relative(new_path)
            display = new_path.name
            if display.endswith(DISABLED_SUFFIX):
                display = display[: -len(DISABLED_SUFFIX)]
            item["name"] = display
            try:
                item["size"] = new_path.stat().st_size
            except OSError:
                pass

    def clone_many(self, ids: list[Any]) -> list[dict[str, Any]]:
        clean: list[str] = []
        seen: set[str] = set()
        for raw in ids or []:
            mod_id = str(raw or "").strip()
            if not mod_id or mod_id in seen:
                continue
            seen.add(mod_id)
            clean.append(mod_id)
        if not clean:
            raise ValueError("Nada que pegar.")
        if len(clean) > 200:
            raise ValueError("Demasiados mods a la vez.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            clones: list[dict[str, Any]] = []
            for mod_id in clean:
                src = self._find(data["mods"], mod_id)
                if not src:
                    raise ValueError("Hay un mod copiado que ya no existe.")
                clone = json.loads(json.dumps(src))
                clone["id"] = uuid.uuid4().hex
                base = str(src.get("name") or "Mod").strip() or "Mod"
                clone["name"] = base if base.endswith(" copia") else f"{base} copia"
                clone["files"] = []
                clone["addedAt"] = now()
                clone["priority"] = 0
                clone["pictureFile"] = self._copy_picture(src.get("pictureFile"))
                self._stamp_priority(clone, data["mods"])
                data["mods"].insert(0, clone)
                clones.append(clone)
            self._write(data)
            return clones

    def _copy_picture(self, relative: str | None) -> str | None:
        if not relative:
            return None
        try:
            src = self.absolute(str(relative))
        except ValueError:
            return None
        if not src.is_file():
            return None
        dest_rel = f"images/{uuid.uuid4().hex}{src.suffix.lower()}"
        dest = self.absolute(dest_rel)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        return dest_rel

    def _apply_user(self, mod: dict[str, Any], fields: dict[str, Any], packs: list[dict[str, Any]]) -> None:
        if "category" in fields:
            new_cat = str(fields["category"] or "General").strip() or "General"
            if new_cat != mod.get("category"):
                mod["categoryEs"] = ""
            mod["category"] = new_cat
            mod["categorySource"] = "user"
        if "categoryEs" in fields:
            mod["categoryEs"] = str(fields["categoryEs"] or "")
        if "notes" in fields:
            mod["notes"] = str(fields["notes"] or "")
        if "techNotes" in fields:
            mod["techNotes"] = str(fields.get("techNotes") or "")[:4000]
        if "compatNotes" in fields:
            mod["compatNotes"] = str(fields.get("compatNotes") or "")[:4000]
        if "emoji" in fields:
            mod["emoji"] = str(fields.get("emoji") or "").strip()[:12]
        if "skill" in fields:
            mod["skill"] = str(fields.get("skill") or "").strip()[:80]
        if "rule" in fields:
            mod["rule"] = str(fields.get("rule") or "").strip()[:80]
        if "name" in fields and str(fields["name"]).strip():
            mod["name"] = str(fields["name"]).strip()
        if "summaryEs" in fields:
            mod["summaryEs"] = str(fields["summaryEs"] or "")
        if "updateAvailable" in fields:
            mod["updateAvailable"] = bool(fields["updateAvailable"])
        if "remoteVersion" in fields:
            mod["remoteVersion"] = str(fields["remoteVersion"] or "")
        if "status" in fields:
            status = str(fields.get("status") or "").strip().lower()
            if status == "want":
                status = ""
            parts = [part for part in status.replace(",", "+").split("+") if part]
            if any(part not in {"got", "in"} for part in parts):
                raise ValueError("Estado no válido.")
            if "in" in parts and not self._mod_downloaded(mod):
                raise ValueError("Solo se pueden activar o desactivar mods descargados.")
            mod["status"] = "+".join(flag for flag in ("got", "in") if flag in parts)
        if "packOrder" in fields:
            try:
                mod["packOrder"] = max(0, int(fields.get("packOrder") or 0))
            except (TypeError, ValueError):
                mod["packOrder"] = 0
        if "platform" in fields and str(fields["platform"] or "").strip():
            mod["platform"] = str(fields["platform"]).strip()
        if "modpackId" in fields or "modpackCategoryId" in fields or "modpack" in fields:
            self._assign_pack(mod, fields, packs)
        if "modpackNotes" in fields:
            mod["modpackNotes"] = str(fields.get("modpackNotes") or "")[:4000]

    def add_modpack(self, fields: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            self._migrate(data)
            pack = self._blank_pack()
            self._apply_pack(pack, fields, create=True)
            data.setdefault("modpacks", []).insert(0, pack)
            self._write(data)
            return pack

    def update_modpack(self, pack_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            self._migrate(data)
            pack = self._find_pack(data.get("modpacks") or [], pack_id)
            if not pack:
                return None
            old_cats = {str(cat.get("id")) for cat in (pack.get("categories") or [])}
            self._apply_pack(pack, fields, create=False)
            new_cats = {str(cat.get("id")) for cat in (pack.get("categories") or [])}
            removed = old_cats - new_cats
            if removed:
                for mod in data["mods"]:
                    if mod.get("modpackId") == pack_id and str(mod.get("modpackCategoryId") or "") in removed:
                        mod["modpackCategoryId"] = ""
            pack["updatedAt"] = now()
            self._write(data)
            return pack

    def delete_modpack(self, pack_id: str) -> bool:
        with self._lock:
            data = self._read()
            packs = data.get("modpacks") or []
            pack = self._find_pack(packs, pack_id)
            if not pack:
                return False
            data["modpacks"] = [item for item in packs if item.get("id") != pack_id]
            for mod in data["mods"]:
                if mod.get("modpackId") == pack_id:
                    mod["modpackId"] = ""
                    mod["modpackCategoryId"] = ""
                    mod["modpack"] = ""
            self._write(data)
            return True

    def upsert_modpack(self, fields: dict[str, Any]) -> dict[str, Any]:
        """Importa o fusiona un modpack por id o por nombre+juego."""
        with self._lock:
            data = self._read()
            self._migrate(data)
            packs = data.setdefault("modpacks", [])
            pack_id = str(fields.get("id") or "").strip()
            existing = self._find_pack(packs, pack_id) if pack_id else None
            if not existing:
                name = str(fields.get("name") or "").strip()
                game = str(fields.get("gameDomain") or "").strip().lower()
                for item in packs:
                    if str(item.get("name") or "").strip().lower() == name.lower() and str(
                        item.get("gameDomain") or ""
                    ).lower() == game:
                        existing = item
                        break
            if existing:
                self._apply_pack(existing, fields, create=False)
                existing["updatedAt"] = now()
                self._write(data)
                return existing
            pack = self._blank_pack()
            if pack_id and re.fullmatch(r"[0-9a-f]{32}", pack_id):
                pack["id"] = pack_id
            self._apply_pack(pack, fields, create=True)
            packs.insert(0, pack)
            self._write(data)
            return pack

    def apply_remote(self, mod_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            self._apply_meta(mod, fields, overwrite_user=False)
            mod["fetchedAt"] = fields.get("fetchedAt")
            self._write(data)
            return mod

    def delete(self, mod_id: str) -> bool:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return False
            data["mods"] = [item for item in data["mods"] if item["id"] != mod_id]
            self._write(data)
        self._purge_mod_files(mod)
        return True

    def _mod_files_dir(self, mod: dict[str, Any], packs: list[dict[str, Any]]) -> Path:
        """mods/{juego}[/{modpack}] junto al programa. Sin Documentos."""
        game = folder_name(mod.get("gameName") or mod.get("gameDomain") or "sin-juego")
        base = self.program_root / "mods" / game
        pack_id = str(mod.get("modpackId") or "").strip()
        if pack_id:
            pack = self._find_pack(packs, pack_id)
            base = base / folder_name((pack or {}).get("name") or "modpack")
        return base

    def _mod_location_key(self, mod: dict[str, Any], packs: list[dict[str, Any]]) -> str:
        return self._mod_files_dir(mod, packs).as_posix().lower()

    def _relocate_mod_files(self, mod: dict[str, Any], packs: list[dict[str, Any]]) -> None:
        """Mueve descargas a la carpeta que toca según juego / categoría / modpack."""
        files = [item for item in (mod.get("files") or []) if isinstance(item, dict)]
        if not files:
            return
        target = self._mod_files_dir(mod, packs)
        target.mkdir(parents=True, exist_ok=True)
        active = "in" in {part for part in str(mod.get("status") or "").split("+") if part}
        for item in files:
            relative = str(item.get("storedAs") or "").strip()
            if not relative:
                continue
            try:
                path = self.absolute(relative)
            except ValueError:
                continue
            if not path.exists():
                if path.name.endswith(DISABLED_SUFFIX):
                    alt = path.with_name(path.name[: -len(DISABLED_SUFFIX)])
                else:
                    alt = path.with_name(path.name + DISABLED_SUFFIX)
                if alt.exists():
                    path = alt
                else:
                    continue
            display = str(item.get("name") or path.name)
            if display.endswith(DISABLED_SUFFIX):
                display = display[: -len(DISABLED_SUFFIX)]
            dest_name = display if active else f"{display}{DISABLED_SUFFIX}"
            dest = target / dest_name
            if dest.resolve() == path.resolve():
                item["storedAs"] = self._stored_relative(dest)
                item["name"] = display
                continue
            if dest.exists():
                dest = target / f"{str(item.get('id') or uuid.uuid4().hex)[:8]}-{dest_name}"
            old_parent = path.parent
            try:
                shutil.move(str(path), dest)
            except OSError:
                continue
            item["storedAs"] = self._stored_relative(dest)
            item["name"] = display
            try:
                item["size"] = dest.stat().st_size
            except OSError:
                pass
            self._prune_empty_mods_dirs(old_parent)

    def add_file(self, mod_id: str, name: str, source: Path) -> dict[str, Any] | None:
        safe = safe_name(name)
        file_id = uuid.uuid4().hex
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            folder = self._mod_files_dir(mod, data.get("modpacks") or [])
            folder.mkdir(parents=True, exist_ok=True)
            flags = {part for part in str(mod.get("status") or "").split("+") if part in {"got", "in"}}
            first_file = not (mod.get("files") or [])
            flags.add("got")
            if first_file:
                flags.add("in")
            active = "in" in flags
            dest_name = safe if active else f"{safe}{DISABLED_SUFFIX}"
            dest = folder / dest_name
            if dest.exists():
                dest = folder / f"{file_id[:8]}-{dest_name}"
            shutil.move(str(source), dest)
            relative = dest.relative_to(self.program_root).as_posix()
            record = {
                "id": file_id,
                "name": safe,
                "storedAs": relative,
                "size": dest.stat().st_size,
                "addedAt": now(),
            }
            mod.setdefault("files", []).append(record)
            mod["status"] = "+".join(part for part in ("got", "in") if part in flags)
            self._write(data)
            return record

    def remove_file(self, mod_id: str, file_id: str) -> bool:
        relative = None
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return False
            kept = []
            found = False
            for item in mod.get("files") or []:
                if item.get("id") == file_id:
                    relative = item.get("storedAs")
                    found = True
                else:
                    kept.append(item)
            if not found:
                return False
            mod["files"] = kept
            self._write(data)
        if relative:
            try:
                path = self.absolute(str(relative))
                path.unlink(missing_ok=True)
                self._prune_empty_mods_dirs(path.parent)
            except ValueError:
                pass
        return True

    def set_picture(self, mod_id: str, relative: str) -> None:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return
            old = mod.get("pictureFile")
            mod["pictureFile"] = relative.replace("\\", "/")
            self._write(data)
        if old and old != relative:
            self.absolute(old).unlink(missing_ok=True)

    def settings(self) -> dict[str, Any]:
        with self._lock:
            return self._read_settings()

    def set_api_key(self, api_key: str, profile: dict[str, Any] | None) -> None:
        with self._lock:
            current = self._read_settings()
            current["apiKey"] = api_key
            current["profile"] = profile or {}
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def set_language(self, language: str) -> None:
        lang = "en" if str(language or "").lower().startswith("en") else "es"
        with self._lock:
            current = self._read_settings()
            current["language"] = lang
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def set_quit_mode(self, mode: str) -> str:
        picked = mode if mode in {"quit", "tray"} else ""
        with self._lock:
            current = self._read_settings()
            if picked:
                current["quitMode"] = picked
            else:
                current.pop("quitMode", None)
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))
        return picked

    def set_download_target(self, mode: str) -> str:
        picked = str(mode or "").strip().lower()
        if picked not in {"wimod", "mo2"}:
            picked = "ask"
        with self._lock:
            current = self._read_settings()
            current["downloadTarget"] = picked
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))
        return picked

    def set_theme(self, theme: str) -> None:
        allowed = {"wimod", "nexus", "modrinth", "curseforge", "moddb", "rawg"}
        picked = str(theme or "").strip().lower()
        if picked == "steam":
            picked = "wimod"
        if picked not in allowed:
            picked = "wimod"
        with self._lock:
            if picked != "wimod" and not self._read_settings().get("wiPro"):
                picked = "wimod"
            current = self._read_settings()
            current["theme"] = picked
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def ensure_platforms(self) -> None:
        names = ("Nexus", "Modrinth", "CurseForge", "Steam Workshop", "ModDB", "Independiente")
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            items = catalog.setdefault("platforms", [])
            dirty = False
            for name in names:
                if not any(str(item).lower() == name.lower() for item in items):
                    items.append(name)
                    dirty = True
            if dirty:
                self._write(data)

    def ensure_default_games(self) -> None:
        defaults = (
            {"gameDomain": "stardewvalley", "gameName": "Stardew Valley", "rawgId": 654, "imageUrl": "/brand/stardewvalley.jpg", "rating": 4.39},
            {"gameDomain": "minecraft", "gameName": "Minecraft", "rawgId": 22509, "imageUrl": "/brand/minecraft.jpg", "rating": 4.44},
            {"gameDomain": "gtasa", "gameName": "GTA San Andreas", "rawgId": 416, "rating": 4.5},
            {"gameDomain": "skyrimspecialedition", "gameName": "The Elder Scrolls V: Skyrim Special Edition", "rawgId": 12447, "rating": 4.45},
            {"gameDomain": "projectzomboid", "gameName": "Project Zomboid", "rawgId": 10900, "steamAppId": 108600, "imageUrl": "https://media.rawg.io/media/screenshots/243/2436b84b99f1121c302367f0c5901b84.jpg", "rating": 3.88},
        )
        retired = {"gta5", "fallout4", "newvegas", "stalkershadowofchernobyl", "darksoulsremastered", "worldofwarcraftclassic"}
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            items = catalog.setdefault("games", [])
            dirty = False
            kept = []
            for item in items:
                domain = str(item.get("gameDomain") or "").lower() if isinstance(item, dict) else ""
                if domain in retired:
                    dirty = True
                    continue
                kept.append(item)
            if len(kept) != len(items):
                items[:] = kept
            for key in ("mods", "modpacks"):
                rows = data.get(key) or []
                fresh = [
                    row for row in rows
                    if str((row or {}).get("gameDomain") or "").lower() not in retired
                ]
                if len(fresh) != len(rows):
                    data[key] = fresh
                    dirty = True
            for entry in defaults:
                domain = entry["gameDomain"]
                exists = next(
                    (
                        item
                        for item in items
                        if isinstance(item, dict)
                        and str(item.get("gameDomain") or "").lower() == domain
                    ),
                    None,
                )
                if exists is None:
                    items.append(dict(entry))
                    dirty = True
                    continue
                if domain == "gtasa" and exists.get("gameName") == "Grand Theft Auto: San Andreas":
                    exists["gameName"] = entry["gameName"]
                    dirty = True
                cover = str(entry.get("imageUrl") or "")
                current = str(exists.get("imageUrl") or "")
                if cover and (not current or "media.rawg.io" in current or "/screenshots/" in current):
                    exists["imageUrl"] = cover
                    dirty = True
                if exists.get("rating") in (None, "") and entry.get("rating") not in (None, ""):
                    exists["rating"] = entry["rating"]
                    dirty = True
            if dirty:
                self._write(data)

    def set_curseforge_api_key(self, api_key: str) -> None:
        with self._lock:
            current = self._read_settings()
            current["curseforgeApiKey"] = str(api_key or "").strip()
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def set_rawg_api_key(self, api_key: str) -> None:
        with self._lock:
            current = self._read_settings()
            current["rawgApiKey"] = str(api_key or "").strip()
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def set_steam_api_key(self, api_key: str) -> None:
        with self._lock:
            current = self._read_settings()
            current["steamApiKey"] = str(api_key or "").strip()
            self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def ensure_rawg_key(self, default_key: str) -> None:
        self.ensure_default_keys({"rawgApiKey": default_key})

    def ensure_default_keys(self, defaults: dict[str, str] | None = None) -> None:
        """Rellena claves vacías (no pisa las que ya guardó el usuario)."""
        defaults = defaults or {}
        fields = ("apiKey", "rawgApiKey", "curseforgeApiKey", "steamApiKey")
        with self._lock:
            current = self._read_settings()
            dirty = False
            for field in fields:
                incoming = str(defaults.get(field) or "").strip()
                if not incoming:
                    continue
                if str(current.get(field) or "").strip():
                    continue
                current[field] = incoming
                dirty = True
            if dirty:
                self._kv_set("settings", json.dumps(current, ensure_ascii=False))

    def absolute(self, relative: str | None) -> Path:
        if not relative:
            raise ValueError("ruta vacía")
        rel = str(relative).replace("\\", "/").lstrip("/")
        if ".." in Path(rel).parts:
            raise ValueError("ruta fuera de la biblioteca")
        if rel.startswith("mods/"):
            root = self.program_root.resolve()
            dest = (root / rel).resolve()
            if dest != root and root not in dest.parents:
                raise ValueError("ruta fuera de mods")
            return dest
        root = self.root.resolve()
        dest = (root / rel).resolve()
        if dest != root and root not in dest.parents:
            raise ValueError("ruta fuera de la biblioteca")
        return dest

    def _blank(self) -> dict[str, Any]:
        return {
            "id": uuid.uuid4().hex,
            "nexusUrl": "",
            "platform": "Nexus",
            "gameDomain": "",
            "gameName": "",
            "modId": None,
            "name": "",
            "summary": "",
            "summaryEs": "",
            "author": "",
            "category": "General",
            "categoryEs": "",
            "categorySource": "nexus",
            "version": "",
            "updatedAt": None,
            "createdAt": None,
            "endorsements": 0,
            "downloads": 0,
            "uniqueDownloads": 0,
            "pictureFile": None,
            "pictureUrl": None,
            "filesUrl": "",
            "primaryFileId": None,
            "primaryFileName": None,
            "modpackId": "",
            "modpackCategoryId": "",
            "modpack": "",
            "modpackNotes": "",
            "notes": "",
            "techNotes": "",
            "compatNotes": "",
            "emoji": "",
            "skill": "",
            "rule": "",
            "files": [],
            "addedAt": now(),
            "fetchedAt": None,
            "checkedAt": None,
            "updateAvailable": False,
            "remoteVersion": "",
            "status": "",
            "packOrder": 0,
            "priority": 0,
        }

    def _blank_pack(self) -> dict[str, Any]:
        stamp = now()
        return {
            "id": uuid.uuid4().hex,
            "name": "",
            "gameDomain": "",
            "gameName": "",
            "notes": "",
            "categories": [],
            "createdAt": stamp,
            "updatedAt": stamp,
        }

    def add_pack_category(self, pack_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        cat = self._blank_pack_category(fields)
        with self._lock:
            data = self._read()
            self._migrate(data)
            pack = self._find_pack(data.get("modpacks") or [], pack_id)
            if not pack:
                return None
            cats = list(pack.get("categories") or [])
            if any(str(item.get("name") or "").strip().lower() == cat["name"].lower() for item in cats):
                raise ValueError("Esa categoría ya existe en la instancia.")
            cats.append(cat)
            pack["categories"] = cats
            pack["updatedAt"] = now()
            self._write(data)
            return pack

    def update_pack_category(self, pack_id: str, cat_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            self._migrate(data)
            pack = self._find_pack(data.get("modpacks") or [], pack_id)
            if not pack:
                return None
            cats = list(pack.get("categories") or [])
            target = next((item for item in cats if str(item.get("id")) == cat_id), None)
            if not target:
                return None
            updated = self._blank_pack_category({**target, **fields})
            updated["id"] = cat_id
            new_name = updated["name"].lower()
            if any(
                str(item.get("id")) != cat_id and str(item.get("name") or "").strip().lower() == new_name
                for item in cats
            ):
                raise ValueError("Esa categoría ya existe en la instancia.")
            pack["categories"] = [updated if str(item.get("id")) == cat_id else item for item in cats]
            pack["updatedAt"] = now()
            self._write(data)
            return pack

    def delete_pack_category(self, pack_id: str, cat_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            self._migrate(data)
            pack = self._find_pack(data.get("modpacks") or [], pack_id)
            if not pack:
                return None
            before = len(pack.get("categories") or [])
            pack["categories"] = [item for item in (pack.get("categories") or []) if str(item.get("id")) != cat_id]
            if len(pack["categories"]) == before:
                return None
            for mod in data["mods"]:
                if mod.get("modpackId") == pack_id and str(mod.get("modpackCategoryId") or "") == cat_id:
                    mod["modpackCategoryId"] = ""
            pack["updatedAt"] = now()
            self._write(data)
            return pack

    def _blank_pack_category(self, fields: dict[str, Any] | None = None) -> dict[str, Any]:
        raw = fields or {}
        label = str(raw.get("name") or "").strip()
        if not label:
            raise ValueError("Pon un nombre a la categoría.")
        image = str(raw.get("imageUrl") or "").strip()
        if image and not (image.startswith("http://") or image.startswith("https://") or image.startswith("/")):
            image = ""
        emoji = str(raw.get("emoji") or "").strip()[:12]
        return {
            "id": str(raw.get("id") or uuid.uuid4().hex),
            "name": label[:80],
            "emoji": emoji,
            "imageUrl": image or None,
            "notes": str(raw.get("notes") or "")[:2000],
        }

    def _empty_catalog(self) -> dict[str, Any]:
        return {"platforms": [], "games": [], "categories": [], "skills": [], "rules": []}

    def catalog(self) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            if self._migrate(data):
                self._write(data)
            catalog = dict(data.get("catalog") or self._empty_catalog())
            for key in ("platforms", "games", "categories", "skills", "rules"):
                catalog.setdefault(key, [])
            catalog.setdefault("marks", {})
            if not isinstance(catalog.get("marks"), dict):
                catalog["marks"] = {}
            return catalog

    def add_catalog_item(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            for key in ("platforms", "games", "categories", "skills", "rules"):
                catalog.setdefault(key, [])
            if kind == "platform":
                name = str(payload.get("name") or "").strip()
                if not name:
                    raise ValueError("Nombre de plataforma vacío.")
                items = catalog["platforms"]
                if not any(str(item).lower() == name.lower() for item in items):
                    items.append(name)
            elif kind == "game":
                domain = str(payload.get("gameDomain") or payload.get("domain") or "").strip().lower()
                name = str(payload.get("gameName") or payload.get("name") or domain).strip()
                if not domain:
                    raise ValueError("Elige un juego.")
                entry = {
                    "gameDomain": domain,
                    "gameName": name or domain,
                }
                rawg_id = payload.get("rawgId")
                if rawg_id not in (None, ""):
                    entry["rawgId"] = int(rawg_id)
                if "steamAppId" in payload:
                    entry["steamAppId"] = int(payload.get("steamAppId") or 0)
                for key in ("rawgSlug", "imageUrl", "logoUrl", "released", "rawgUrl", "website", "description", "descriptionEs"):
                    val = str(payload.get(key) or "").strip()
                    if val:
                        entry[key] = val[:4000] if key in {"description", "descriptionEs"} else val
                for key in ("rating", "metacritic", "playtime"):
                    if payload.get(key) not in (None, ""):
                        entry[key] = payload.get(key)
                platforms = payload.get("platforms")
                if isinstance(platforms, list) and platforms:
                    entry["platforms"] = [str(p).strip() for p in platforms if str(p).strip()][:8]
                genres = payload.get("genres")
                if isinstance(genres, list) and genres:
                    entry["genres"] = [str(g).strip() for g in genres if str(g).strip()][:8]
                items = catalog["games"]
                existing = next(
                    (
                        item
                        for item in items
                        if isinstance(item, dict)
                        and str(item.get("gameDomain") or "").lower() == domain
                    ),
                    None,
                )
                if existing is None and rawg_id not in (None, ""):
                    existing = next(
                        (
                            item
                            for item in items
                            if isinstance(item, dict) and item.get("rawgId") == entry.get("rawgId")
                        ),
                        None,
                    )
                if existing is None:
                    items.append(entry)
                else:
                    existing.update(entry)
            elif kind in {"category", "skill", "rule"}:
                name = str(payload.get("name") or "").strip()
                if not name:
                    raise ValueError("Nombre vacío.")
                key = {"category": "categories", "skill": "skills", "rule": "rules"}[kind]
                items = catalog[key]
                if not any(str(item).lower() == name.lower() for item in items):
                    items.append(name)
            else:
                raise ValueError("Tipo de catálogo no válido.")
            self._write(data)
            return dict(catalog)

    def set_mark(self, kind: str, item_id: str, emoji: str, image_url: str) -> dict[str, Any]:
        allowed = {"platform", "category", "modpack", "packcat"}
        kind = str(kind or "").strip().lower()
        item_id = str(item_id or "").strip()
        if kind not in allowed or not item_id:
            raise ValueError("Elemento no válido.")
        glyph = str(emoji or "").strip()[:8]
        image = str(image_url or "").strip()
        if image and not (image.startswith("http://") or image.startswith("https://") or image.startswith("/")):
            image = ""
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            marks = catalog.setdefault("marks", {})
            if not isinstance(marks, dict):
                marks = {}
                catalog["marks"] = marks
            key = f"{kind}:{item_id}"
            if not glyph and not image:
                marks.pop(key, None)
            else:
                marks[key] = {"emoji": glyph, "imageUrl": image}
            self._write(data)
            return self.catalog()

    def rename_category(self, old: str, new: str) -> dict[str, Any]:
        previous = str(old or "").strip()
        name = str(new or "").strip()
        if not previous or not name:
            raise ValueError("Nombre vacío.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            items = catalog.setdefault("categories", [])
            if previous.lower() != name.lower() and any(str(item).lower() == name.lower() for item in items):
                raise ValueError("Esa categoría ya existe.")
            replaced = False
            for index, item in enumerate(list(items)):
                if str(item).lower() == previous.lower():
                    items[index] = name
                    replaced = True
            if not replaced:
                items.append(name)
            marks = catalog.setdefault("marks", {})
            if isinstance(marks, dict) and previous != name:
                key = f"category:{previous}"
                if key in marks:
                    marks[f"category:{name}"] = marks.pop(key)
            for mod in data.get("mods") or []:
                if str(mod.get("category") or "") == previous:
                    mod["category"] = name
            self._write(data)
            return self.catalog()

    def set_game_launch(self, domain: str, launch_path: str) -> dict[str, Any]:
        domain = str(domain or "").strip().lower()
        if not domain:
            raise ValueError("Elige un juego.")
        path = str(launch_path or "").strip()
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            games = [item for item in (catalog.get("games") or []) if isinstance(item, dict)]
            game = next(
                (item for item in games if str(item.get("gameDomain") or "").lower() == domain),
                None,
            )
            if game is None:
                raise ValueError("Ese juego no está en la lista.")
            if path:
                game["launchPath"] = path[:1000]
            else:
                game.pop("launchPath", None)
            self._write(data)
            return self.catalog()

    def set_game_install(self, domain: str, install_path: str) -> dict[str, Any]:
        domain = str(domain or "").strip().lower()
        if not domain:
            raise ValueError("Elige un juego.")
        path = str(install_path or "").strip()
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            games = [item for item in (catalog.get("games") or []) if isinstance(item, dict)]
            game = next(
                (item for item in games if str(item.get("gameDomain") or "").lower() == domain),
                None,
            )
            if game is None:
                raise ValueError("Ese juego no está en la lista.")
            if path:
                folder = Path(path)
                if folder.is_file():
                    folder = folder.parent
                if not folder.is_dir():
                    raise ValueError("Esa carpeta no existe.")
                game["installPath"] = str(folder)[:1000]
            else:
                game.pop("installPath", None)
            self._write(data)
            return self.catalog()

    def set_game_flags(self, domain: str, *, pin: bool | None = None, favorite: bool | None = None) -> dict[str, Any]:
        domain = str(domain or "").strip().lower()
        if not domain:
            raise ValueError("Elige un juego.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            catalog = data.setdefault("catalog", self._empty_catalog())
            games = [item for item in (catalog.get("games") or []) if isinstance(item, dict)]
            game = next(
                (item for item in games if str(item.get("gameDomain") or "").lower() == domain),
                None,
            )
            if game is None:
                raise ValueError("Ese juego no está en la lista.")
            if pin is True and not game.get("pinned"):
                others = [
                    item for item in games
                    if item.get("pinned") and str(item.get("gameDomain") or "").lower() != domain
                ]
                while len(others) >= 3:
                    oldest = min(others, key=lambda item: int(item.get("pinOrder") or 0))
                    oldest["pinned"] = False
                    oldest.pop("pinOrder", None)
                    others.remove(oldest)
                orders = [int(item.get("pinOrder") or 0) for item in others]
                game["pinned"] = True
                game["pinOrder"] = (max(orders) if orders else 0) + 1
            elif pin is False:
                game["pinned"] = False
                game.pop("pinOrder", None)
            if favorite is True:
                for item in games:
                    item["favorite"] = str(item.get("gameDomain") or "").lower() == domain
            elif favorite is False:
                game["favorite"] = False
            self._write(data)
            return self.catalog()

    def _apply_pack(self, pack: dict[str, Any], fields: dict[str, Any], *, create: bool) -> None:
        name = str(fields.get("name") or pack.get("name") or "").strip()
        if not name:
            raise ValueError("La instancia necesita un nombre.")
        game = str(fields.get("gameDomain") or pack.get("gameDomain") or "").strip().lower()
        if not game:
            raise ValueError("Elige el juego de la instancia.")
        pack["name"] = name
        pack["gameDomain"] = game
        pack["gameName"] = str(fields.get("gameName") or pack.get("gameName") or "").strip() or game
        if "notes" in fields or create:
            pack["notes"] = str(fields.get("notes") or "")
        for key in ("mcVersion", "loaderType", "loaderVersion"):
            if key in fields:
                pack[key] = str(fields.get(key) or "").strip()
        if "categories" in fields and isinstance(fields["categories"], list):
            cats: list[dict[str, Any]] = []
            seen: set[str] = set()
            for raw in fields["categories"]:
                if isinstance(raw, str):
                    payload: dict[str, Any] = {"name": raw}
                elif isinstance(raw, dict):
                    payload = raw
                else:
                    continue
                try:
                    cat = self._blank_pack_category(payload)
                except ValueError:
                    continue
                key = cat["name"].lower()
                if key in seen:
                    continue
                seen.add(key)
                if not re.fullmatch(r"[0-9a-f]{32}", str(cat.get("id") or "")):
                    cat["id"] = uuid.uuid4().hex
                cats.append(cat)
            pack["categories"] = cats
        elif create:
            pack["categories"] = []

    def _assign_pack(self, mod: dict[str, Any], fields: dict[str, Any], packs: list[dict[str, Any]]) -> None:
        pack_id = str(fields.get("modpackId") if "modpackId" in fields else mod.get("modpackId") or "").strip()
        cat_id = str(
            fields.get("modpackCategoryId") if "modpackCategoryId" in fields else mod.get("modpackCategoryId") or ""
        ).strip()
        legacy = str(fields.get("modpack") or "").strip()
        if "modpackId" not in fields and "modpackCategoryId" not in fields and legacy and not pack_id:
            for pack in packs:
                if str(pack.get("name") or "").strip().lower() == legacy.lower():
                    pack_id = pack["id"]
                    break
        if not pack_id:
            mod["modpackId"] = ""
            mod["modpackCategoryId"] = ""
            mod["modpack"] = ""
            mod["packOrder"] = 0
            if "modpackNotes" in fields:
                mod["modpackNotes"] = str(fields.get("modpackNotes") or "")[:4000]
            return
        previous = str(mod.get("modpackId") or "")
        pack = self._find_pack(packs, pack_id)
        if not pack:
            raise ValueError("Esa instancia no existe.")
        mod_game = str(mod.get("gameDomain") or "").strip().lower()
        pack_game = str(pack.get("gameDomain") or "").strip().lower()
        if mod_game and pack_game and mod_game != pack_game:
            raise ValueError("El mod y la instancia son de juegos distintos.")
        cats = pack.get("categories") or []
        if cat_id and not any(str(cat.get("id")) == cat_id for cat in cats):
            raise ValueError("Esa categoría no pertenece a la instancia.")
        if not cat_id and cats:
            cat_id = str(cats[0].get("id") or "")
        mod["modpackId"] = pack_id
        mod["modpackCategoryId"] = cat_id
        mod["modpack"] = str(pack.get("name") or "")
        if previous != pack_id:
            mod["packOrder"] = 0
        if "modpackNotes" in fields:
            mod["modpackNotes"] = str(fields.get("modpackNotes") or "")[:4000]

    def _game_peers(self, mod: dict[str, Any], mods: list[dict[str, Any]]) -> list[dict[str, Any]]:
        game = str(mod.get("gameDomain") or "").strip().lower()
        return [
            item for item in mods
            if item is not mod and str(item.get("gameDomain") or "").strip().lower() == game
        ]

    def _stamp_priority(self, mod: dict[str, Any], mods: list[dict[str, Any]]) -> None:
        if int(mod.get("priority") or 0) > 0:
            return
        orders = [int(item.get("priority") or 0) for item in self._game_peers(mod, mods)]
        mod["priority"] = (max(orders) if orders else 0) + 1

    def _place_priority(self, mod: dict[str, Any], mods: list[dict[str, Any]], wanted: Any) -> None:
        """Coloca el mod en esa prioridad del juego y renumera 1..N. Mayor = carga después."""
        peers = self._game_peers(mod, mods)
        peers.sort(key=lambda item: (int(item.get("priority") or 0), str(item.get("name") or "").lower()))
        try:
            slot = int(wanted or 1)
        except (TypeError, ValueError):
            slot = 1
        slot = max(1, min(slot, len(peers) + 1))
        peers.insert(slot - 1, mod)
        for index, item in enumerate(peers, start=1):
            item["priority"] = index

    def _stamp_pack_order(self, mod: dict[str, Any], mods: list[dict[str, Any]]) -> None:
        if not mod.get("modpackId"):
            mod["packOrder"] = 0
            return
        if int(mod.get("packOrder") or 0) > 0:
            return
        orders = [
            int(item.get("packOrder") or 0)
            for item in mods
            if item.get("modpackId") == mod.get("modpackId")
        ]
        mod["packOrder"] = (max(orders) if orders else 0) + 1

    def order_mods(self, ids: list[Any]) -> list[dict[str, Any]]:
        clean: list[str] = []
        seen: set[str] = set()
        for raw in ids or []:
            mod_id = str(raw or "").strip()
            if not mod_id or mod_id in seen:
                continue
            seen.add(mod_id)
            clean.append(mod_id)
        if len(clean) < 2:
            raise ValueError("Nada que ordenar.")
        with self._lock:
            data = self._read()
            self._migrate(data)
            mods = [self._find(data["mods"], mod_id) for mod_id in clean]
            if any(mod is None for mod in mods):
                raise ValueError("Hay un mod que ya no existe.")
            pack_id = str(mods[0].get("modpackId") or "")
            if not pack_id or any(str(mod.get("modpackId") or "") != pack_id for mod in mods):
                raise ValueError("Solo se ordenan mods de la misma instancia.")
            for index, mod in enumerate(mods, start=1):
                mod["packOrder"] = index
            self._write(data)
            return mods

    def _migrate(self, data: dict[str, Any]) -> bool:
        dirty = False
        for mod in data.get("mods") or []:
            if str(mod.get("status") or "") == "want":
                mod["status"] = ""
                dirty = True
        grouped: dict[str, list[dict[str, Any]]] = {}
        for mod in data.get("mods") or []:
            if not isinstance(mod, dict):
                continue
            grouped.setdefault(str(mod.get("gameDomain") or "").strip().lower(), []).append(mod)
        for group in grouped.values():
            missing = [item for item in group if int(item.get("priority") or 0) <= 0]
            if not missing:
                continue
            known = [int(item.get("priority") or 0) for item in group if int(item.get("priority") or 0) > 0]
            nxt = (max(known) if known else 0) + 1
            missing.sort(key=lambda item: str(item.get("addedAt") or ""))
            for item in missing:
                item["priority"] = nxt
                nxt += 1
                dirty = True
        data.setdefault("modpacks", [])
        packs: list[dict[str, Any]] = data["modpacks"]
        by_name_game: dict[tuple[str, str], dict[str, Any]] = {}
        for pack in packs:
            key = (str(pack.get("name") or "").strip().lower(), str(pack.get("gameDomain") or "").strip().lower())
            if key[0]:
                by_name_game[key] = pack
            if not isinstance(pack.get("categories"), list):
                pack["categories"] = []
                dirty = True
            fixed_cats = []
            for raw in pack.get("categories") or []:
                if not isinstance(raw, dict) or not raw.get("name"):
                    dirty = True
                    continue
                try:
                    fixed = self._blank_pack_category(raw)
                except ValueError:
                    dirty = True
                    continue
                if fixed.get("id") != raw.get("id") or fixed.get("emoji") != raw.get("emoji") or "notes" not in raw:
                    dirty = True
                fixed_cats.append(fixed)
            if fixed_cats != pack.get("categories"):
                pack["categories"] = fixed_cats
                dirty = True
        data.setdefault("catalog", self._empty_catalog())
        catalog = data["catalog"]
        for key in ("platforms", "games", "categories", "skills", "rules"):
            catalog.setdefault(key, [])
        domain_fixes = {
            "darksouls8482remastered": "darksoulsremastered",
            "darksoulstmremastered": "darksoulsremastered",
        }
        games = catalog.get("games") or []
        fixed_games: list[Any] = []
        seen_domains: set[str] = set()
        for item in games:
            if not isinstance(item, dict):
                fixed_games.append(item)
                continue
            domain = str(item.get("gameDomain") or "").strip().lower()
            fixed = domain_fixes.get(domain, domain)
            if fixed != domain:
                item = dict(item)
                item["gameDomain"] = fixed
                if "remaster" in fixed and not str(item.get("gameName") or "").lower().endswith("remastered"):
                    item["gameName"] = "Dark Souls: Remastered"
                dirty = True
            if fixed in seen_domains:
                dirty = True
                continue
            if fixed:
                seen_domains.add(fixed)
            fixed_games.append(item)
        if fixed_games != games:
            catalog["games"] = fixed_games
            dirty = True
        for pack in packs:
            domain = str(pack.get("gameDomain") or "").strip().lower()
            fixed = domain_fixes.get(domain)
            if fixed and fixed != domain:
                pack["gameDomain"] = fixed
                dirty = True
        for mod in data.get("mods") or []:
            domain = str(mod.get("gameDomain") or "").strip().lower()
            fixed = domain_fixes.get(domain)
            if fixed and fixed != domain:
                mod["gameDomain"] = fixed
                dirty = True
        for mod in data.get("mods") or []:
            if "modpackId" not in mod:
                mod["modpackId"] = ""
                dirty = True
            if "modpackCategoryId" not in mod:
                mod["modpackCategoryId"] = ""
                dirty = True
            if "modpackNotes" not in mod:
                mod["modpackNotes"] = ""
                dirty = True
            for key in ("techNotes", "compatNotes", "emoji", "skill", "rule"):
                if key not in mod:
                    mod[key] = ""
                    dirty = True
            legacy = str(mod.get("modpack") or "").strip()
            if mod.get("modpackId") or not legacy:
                if mod.get("modpackId"):
                    pack = self._find_pack(packs, str(mod["modpackId"]))
                    if pack and mod.get("modpack") != pack.get("name"):
                        mod["modpack"] = pack.get("name") or ""
                        dirty = True
                continue
            game = str(mod.get("gameDomain") or "").strip().lower()
            key = (legacy.lower(), game)
            pack = by_name_game.get(key)
            if not pack and game:
                for candidate in packs:
                    if str(candidate.get("name") or "").strip().lower() == legacy.lower():
                        pack = candidate
                        break
            if not pack:
                pack = self._blank_pack()
                pack["name"] = legacy
                pack["gameDomain"] = game
                pack["gameName"] = str(mod.get("gameName") or game)
                packs.append(pack)
                by_name_game[key] = pack
                dirty = True
            mod["modpackId"] = pack["id"]
            if not mod.get("modpackCategoryId") and pack.get("categories"):
                mod["modpackCategoryId"] = pack["categories"][0]["id"]
            mod["modpack"] = pack["name"]
            dirty = True
        return dirty

    def set_checked(self, mod_id: str, checked_at: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            mod["checkedAt"] = checked_at
            self._write(data)
            return mod

    def sync_stats(self, mod_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Actualiza cifras de Nexus sin tocar versión/resumen."""
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            for key in (
                "endorsements",
                "downloads",
                "uniqueDownloads",
                "createdAt",
                "author",
                "platform",
                "pictureUrl",
                "primaryFileId",
                "primaryFileName",
                "filesUrl",
            ):
                if key in fields and fields[key] is not None and fields[key] != "":
                    mod[key] = fields[key]
            if fields.get("category") and mod.get("categorySource") != "user":
                new_cat = fields["category"]
                if new_cat != mod.get("category"):
                    mod["categoryEs"] = ""
                mod["category"] = new_cat
                mod["categorySource"] = fields.get("categorySource") or "nexus"
            self._write(data)
            return mod

    def _apply_meta(self, mod: dict[str, Any], fields: dict[str, Any], overwrite_user: bool) -> None:
        numeric = {"endorsements", "downloads", "uniqueDownloads", "modId", "primaryFileId", "categoryId", "steamAppId"}
        for key in (
            "nexusUrl",
            "filesUrl",
            "platform",
            "gameDomain",
            "gameName",
            "modId",
            "steamAppId",
            "localPath",
            "name",
            "summary",
            "summaryEs",
            "categoryEs",
            "author",
            "version",
            "updatedAt",
            "createdAt",
            "endorsements",
            "downloads",
            "uniqueDownloads",
            "pictureUrl",
            "primaryFileId",
            "primaryFileName",
            "categoryId",
            "modpackId",
            "modpackCategoryId",
            "techNotes",
            "compatNotes",
            "emoji",
            "skill",
            "rule",
            "checkedAt",
        ):
            if key not in fields or fields[key] is None:
                continue
            if key not in numeric and fields[key] == "":
                continue
            if key == "summary" and fields[key] != mod.get("summary"):
                mod["summaryEs"] = ""
            mod[key] = fields[key]
        if fields.get("category") and (overwrite_user or mod.get("categorySource") != "user"):
            new_cat = fields["category"]
            if new_cat != mod.get("category"):
                mod["categoryEs"] = ""
            mod["category"] = new_cat
            if overwrite_user or mod.get("categorySource") != "user":
                mod["categorySource"] = fields.get("categorySource") or "nexus"
        if fields.get("categoryEs"):
            mod["categoryEs"] = fields["categoryEs"]
        if fields.get("notes") and overwrite_user:
            mod["notes"] = fields["notes"]

    def _prune_empty_mods_dirs(self, folder: Path) -> None:
        mods_root = (self.program_root / "mods").resolve()
        try:
            cur = folder.resolve()
        except OSError:
            return
        while cur != mods_root and mods_root in cur.parents:
            try:
                cur.rmdir()
            except OSError:
                break
            cur = cur.parent

    def _purge_mod_files(self, mod: dict[str, Any]) -> None:
        if mod.get("pictureFile"):
            try:
                self.absolute(mod["pictureFile"]).unlink(missing_ok=True)
            except ValueError:
                pass
        for item in mod.get("files") or []:
            relative = item.get("storedAs") if isinstance(item, dict) else None
            if not relative:
                continue
            try:
                path = self.absolute(str(relative))
                path.unlink(missing_ok=True)
                self._prune_empty_mods_dirs(path.parent)
            except ValueError:
                continue
        blob = self.root / "blobs" / mod["id"]
        if blob.exists():
            shutil.rmtree(blob, ignore_errors=True)

    def _find(self, mods: list[dict[str, Any]], mod_id: str) -> dict[str, Any] | None:
        for mod in mods:
            if mod.get("id") == mod_id:
                return mod
        return None

    def _find_pack(self, packs: list[dict[str, Any]], pack_id: str) -> dict[str, Any] | None:
        for pack in packs:
            if pack.get("id") == pack_id:
                return pack
        return None

    @contextmanager
    def _cx(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._cx() as conn:
            self._init_schema(conn)
        self._import_legacy()
        self._ensure_admin()

    def _init_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS kv (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
              username TEXT PRIMARY KEY,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "password_len" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN password_len INTEGER")
        session_cols = {row[1] for row in conn.execute("PRAGMA table_info(sessions)")}
        if "expires_at" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")

    def _import_legacy(self) -> None:
        if self._kv_get("library") is None and self.path.exists():
            try:
                self._kv_set("library", self.path.read_text(encoding="utf-8"))
            except OSError:
                pass
        if self._kv_get("settings") is None and self.settings_path.exists():
            try:
                self._kv_set("settings", self.settings_path.read_text(encoding="utf-8"))
            except OSError:
                pass

    def _ensure_admin(self) -> None:
        """WYDEX siempre existe y siempre es admin."""
        with self._cx() as conn:
            row = conn.execute(
                "SELECT username, role FROM users WHERE upper(username) = upper(?)",
                (ADMIN_USER,),
            ).fetchone()
            if row:
                if str(row["role"] or "") != "admin":
                    conn.execute(
                        "UPDATE users SET role = ? WHERE upper(username) = upper(?)",
                        ("admin", ADMIN_USER),
                    )
                return
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (ADMIN_USER, "", "admin", now()),
            )

    def session_state(self) -> dict[str, Any]:
        with self._lock:
            return self._session_state()

    def _session_state(self) -> dict[str, Any]:
        with self._cx() as conn:
            row = conn.execute(
                "SELECT username, password_hash, role FROM users WHERE username = ?",
                (ADMIN_USER,),
            ).fetchone()
        if not row:
            self._ensure_admin()
            return {"username": ADMIN_USER, "role": "admin", "needsPassword": True}
        return {
            "username": row["username"],
            "role": row["role"],
            "needsPassword": not str(row["password_hash"] or ""),
        }

    def lookup_user(self, username: str) -> dict[str, Any]:
        with self._lock:
            row = self._user_row(username)
        if not row:
            return {"exists": False, "needsPassword": False, "username": ""}
        stored = str(row["password_hash"] or "")
        length = row["password_len"]
        return {
            "exists": True,
            "needsPassword": not stored,
            "passwordLength": int(length) if stored and length else None,
            "username": row["username"],
        }

    def create_user(self, username: str, password: str, remember: bool = False) -> str:
        with self._lock:
            name = self._clean_name(username)
            row = self._user_row(name)
            if row and str(row["password_hash"] or ""):
                raise ValueError("Ese usuario ya existe.")
            if row:
                self._write_password(row["username"], password)
                canonical = row["username"]
            else:
                role = "admin" if name.upper() == ADMIN_USER else "user"
                self._insert_user(name, password, role)
                canonical = name
            return self._open_session(canonical, remember)

    def reset_password(self, username: str, password: str, remember: bool = False) -> str:
        with self._lock:
            row = self._user_row(username)
            if not row:
                raise ValueError("Ese usuario no está creado.")
            self._write_password(row["username"], password)
            with self._cx() as conn:
                conn.execute("DELETE FROM sessions WHERE username = ?", (row["username"],))
            return self._open_session(row["username"], remember)

    def login(self, username: str, password: str, remember: bool = False) -> str:
        with self._lock:
            return self._login(username, password, remember)

    def _login(self, username: str, password: str, remember: bool = False) -> str:
        row = self._user_row(username)
        if not row:
            raise ValueError("Ese usuario no está creado.")
        stored = str(row["password_hash"] or "")
        secret = str(password or "")
        if not stored:
            self._write_password(row["username"], secret)
        elif not _check_password(secret, stored):
            raise ValueError("Clave incorrecta.")
        return self._open_session(row["username"], remember)

    def _user_row(self, username: str):
        name = str(username or "").strip()
        if not name:
            return None
        with self._cx() as conn:
            return conn.execute(
                """
                SELECT username, password_hash, password_len, role
                FROM users WHERE username = ? COLLATE NOCASE
                """,
                (name,),
            ).fetchone()

    def _clean_name(self, username: str) -> str:
        name = str(username or "").strip()
        if len(name) < 2 or len(name) > 32:
            raise ValueError("El usuario necesita entre 2 y 32 caracteres.")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            raise ValueError("El usuario solo admite letras, números, punto, guion y _.")
        return name

    def _write_password(self, username: str, password: str) -> None:
        secret = str(password or "")
        if len(secret) < 4:
            raise ValueError("La clave necesita al menos 4 caracteres.")
        with self._cx() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ?, password_len = ? WHERE username = ?",
                (_hash_password(secret), len(secret), username),
            )

    def _insert_user(self, username: str, password: str, role: str) -> None:
        secret = str(password or "")
        if len(secret) < 4:
            raise ValueError("La clave necesita al menos 4 caracteres.")
        with self._cx() as conn:
            conn.execute(
                """
                INSERT INTO users (username, password_hash, role, created_at, password_len)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, _hash_password(secret), role, now(), len(secret)),
            )

    def _open_session(self, username: str, remember: bool = False) -> str:
        token = secrets.token_urlsafe(32)
        expires = ""
        if remember:
            expires = (datetime.now(timezone.utc) + timedelta(days=REMEMBER_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._cx() as conn:
            conn.execute(
                "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, username, now(), expires),
            )
        return token

    def logout(self, token: str) -> None:
        with self._lock:
            if not token:
                return
            with self._cx() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def user_for_token(self, token: str) -> dict[str, Any] | None:
        with self._lock:
            return self._user_for_token(token)

    def _user_for_token(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        with self._cx() as conn:
            row = conn.execute(
                """
                SELECT users.username, users.role, sessions.expires_at
                FROM sessions JOIN users ON users.username = sessions.username
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
            if not row:
                return None
            expires = str(row["expires_at"] or "")
            if expires and expires <= now():
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                return None
        return {"username": row["username"], "role": row["role"]}

    def _kv_get(self, key: str) -> str | None:
        with self._cx() as conn:
            row = conn.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
        return None if row is None else str(row["value"])

    def _kv_set(self, key: str, value: str) -> None:
        with self._cx() as conn:
            conn.execute(
                "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )

    def _read(self) -> dict[str, Any]:
        empty = {
            "version": 1,
            "mods": [],
            "modpacks": [],
            "catalog": self._empty_catalog(),
        }
        raw = self._kv_get("library")
        if not raw:
            return empty
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return empty
        data.setdefault("version", 1)
        data.setdefault("mods", [])
        data.setdefault("modpacks", [])
        data.setdefault("catalog", self._empty_catalog())
        return data

    def _write(self, data: dict[str, Any]) -> None:
        self._kv_set("library", json.dumps(data, ensure_ascii=False))

    def _read_settings(self) -> dict[str, Any]:
        raw = self._kv_get("settings")
        if not raw:
            return {"apiKey": "", "rawgApiKey": "", "curseforgeApiKey": "", "steamApiKey": "", "language": "es", "theme": "wimod", "profile": {}}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {"apiKey": "", "rawgApiKey": "", "curseforgeApiKey": "", "steamApiKey": "", "language": "es", "theme": "wimod", "profile": {}}
        data.setdefault("apiKey", "")
        data.setdefault("rawgApiKey", "")
        data.setdefault("curseforgeApiKey", "")
        data.setdefault("steamApiKey", "")
        data.setdefault("language", "es")
        data.setdefault("theme", "wimod")
        data.setdefault("profile", {})
        return data


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        kind, salt_hex, digest_hex = stored.split("$", 2)
    except ValueError:
        return False
    if kind != "pbkdf2":
        return False
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return secrets.compare_digest(digest.hex(), digest_hex)


def safe_name(name: str) -> str:
    base = Path(name or "archivo").name
    cleaned = re.sub(r"[^\w.\- ()\[\]]+", "_", base, flags=re.UNICODE).strip(" .")
    return cleaned[:180] or "archivo"


def folder_name(name: str) -> str:
    cleaned = re.sub(r"[^\w.\- ()\[\]]+", "_", str(name or "").strip(), flags=re.UNICODE).strip(" .")
    return cleaned[:120] or "sin-nombre"
