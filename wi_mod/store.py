"""Biblioteca local de mods."""

from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Library:
    def __init__(self, root: Path):
        self.root = root
        self.path = root / "library.json"
        self.settings_path = root / "settings.json"
        self._lock = threading.Lock()
        self.root.mkdir(parents=True, exist_ok=True)

    def list_mods(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._read()["mods"])

    def get(self, mod_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._find(self._read()["mods"], mod_id)

    def find_nexus(self, game: str, nexus_id: int) -> dict[str, Any] | None:
        with self._lock:
            for mod in self._read()["mods"]:
                if mod.get("gameDomain") == game and mod.get("modId") == nexus_id:
                    return mod
        return None

    def add(self, fields: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read()
            game = fields.get("gameDomain") or ""
            nexus_id = fields.get("modId")
            existing = None
            if game and isinstance(nexus_id, int):
                for mod in data["mods"]:
                    if mod.get("gameDomain") == game and mod.get("modId") == nexus_id:
                        existing = mod
                        break
            if existing:
                self._apply_meta(existing, fields, overwrite_user=False)
                existing["fetchedAt"] = fields.get("fetchedAt")
                self._write(data)
                return existing
            mod = self._blank()
            self._apply_meta(mod, fields, overwrite_user=True)
            mod["notes"] = str(fields.get("notes") or "")
            mod["addedAt"] = now()
            mod["fetchedAt"] = fields.get("fetchedAt")
            data["mods"].insert(0, mod)
            self._write(data)
            return mod

    def update(self, mod_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            if "category" in fields:
                mod["category"] = str(fields["category"] or "General").strip() or "General"
                mod["categorySource"] = "user"
            if "notes" in fields:
                mod["notes"] = str(fields["notes"] or "")
            if "name" in fields and str(fields["name"]).strip():
                mod["name"] = str(fields["name"]).strip()
            if "summaryEs" in fields:
                mod["summaryEs"] = str(fields["summaryEs"] or "")
            if "platform" in fields and str(fields["platform"] or "").strip():
                mod["platform"] = str(fields["platform"]).strip()
            if "depsRequired" in fields and isinstance(fields["depsRequired"], list):
                mod["depsRequired"] = fields["depsRequired"]
            if "depsOptional" in fields and isinstance(fields["depsOptional"], list):
                mod["depsOptional"] = fields["depsOptional"]
            self._write(data)
            return mod

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

    def add_file(self, mod_id: str, name: str, source: Path) -> dict[str, Any] | None:
        safe = safe_name(name)
        file_id = uuid.uuid4().hex
        relative = f"blobs/{mod_id}/{file_id}-{safe}"
        dest = self.root / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), dest)
        record = {
            "id": file_id,
            "name": safe,
            "storedAs": relative.replace("\\", "/"),
            "size": dest.stat().st_size,
            "addedAt": now(),
        }
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                dest.unlink(missing_ok=True)
                return None
            mod.setdefault("files", []).append(record)
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
            self.absolute(relative).unlink(missing_ok=True)
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
            self.settings_path.write_text(
                json.dumps(current, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def absolute(self, relative: str | None) -> Path:
        if not relative:
            raise ValueError("ruta vacía")
        root = self.root.resolve()
        dest = (root / relative).resolve()
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
            "depsRequired": [],
            "depsOptional": [],
            "notes": "",
            "files": [],
            "addedAt": now(),
            "fetchedAt": None,
            "checkedAt": None,
        }

    def set_checked(self, mod_id: str, checked_at: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._read()
            mod = self._find(data["mods"], mod_id)
            if not mod:
                return None
            mod["checkedAt"] = checked_at
            self._write(data)
            return mod

    def _apply_meta(self, mod: dict[str, Any], fields: dict[str, Any], overwrite_user: bool) -> None:
        for key in (
            "nexusUrl",
            "filesUrl",
            "platform",
            "gameDomain",
            "gameName",
            "modId",
            "name",
            "summary",
            "summaryEs",
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
            "checkedAt",
        ):
            if key in fields and fields[key] not in (None, ""):
                if key == "summary" and fields[key] != mod.get("summary"):
                    mod["summaryEs"] = ""
                mod[key] = fields[key]
        if fields.get("category") and (overwrite_user or mod.get("categorySource") != "user"):
            mod["category"] = fields["category"]
            if overwrite_user or mod.get("categorySource") != "user":
                mod["categorySource"] = fields.get("categorySource") or "nexus"
        if fields.get("notes") and overwrite_user:
            mod["notes"] = fields["notes"]
        self._merge_deps(mod, fields, overwrite_user)

    def _merge_deps(self, mod: dict[str, Any], fields: dict[str, Any], overwrite_user: bool) -> None:
        for key in ("depsRequired", "depsOptional"):
            incoming = fields.get(key)
            if not isinstance(incoming, list):
                continue
            if overwrite_user:
                mod[key] = [item for item in incoming if isinstance(item, dict)]
                continue
            current = [item for item in (mod.get(key) or []) if isinstance(item, dict)]
            kept_user = [item for item in current if item.get("source") == "user"]
            remote = [item for item in incoming if isinstance(item, dict)]
            owned = {
                (str(item.get("gameDomain") or ""), item.get("modId"), str(item.get("name") or "").lower())
                for item in kept_user
            }
            merged = list(kept_user)
            for item in remote:
                stamp = (
                    str(item.get("gameDomain") or ""),
                    item.get("modId"),
                    str(item.get("name") or "").lower(),
                )
                if stamp in owned:
                    continue
                merged.append(item)
                owned.add(stamp)
            mod[key] = merged

    def _purge_mod_files(self, mod: dict[str, Any]) -> None:
        if mod.get("pictureFile"):
            try:
                self.absolute(mod["pictureFile"]).unlink(missing_ok=True)
            except ValueError:
                pass
        blob = self.root / "blobs" / mod["id"]
        if blob.exists():
            shutil.rmtree(blob, ignore_errors=True)

    def _find(self, mods: list[dict[str, Any]], mod_id: str) -> dict[str, Any] | None:
        for mod in mods:
            if mod.get("id") == mod_id:
                return mod
        return None

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "mods": []}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"version": 1, "mods": []}
        data.setdefault("version", 1)
        data.setdefault("mods", [])
        return data

    def _write(self, data: dict[str, Any]) -> None:
        temp = self.path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(self.path)

    def _read_settings(self) -> dict[str, Any]:
        if not self.settings_path.exists():
            return {"apiKey": "", "profile": {}}
        try:
            data = json.loads(self.settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"apiKey": "", "profile": {}}
        data.setdefault("apiKey", "")
        data.setdefault("profile", {})
        return data


def safe_name(name: str) -> str:
    base = Path(name or "archivo").name
    cleaned = re.sub(r"[^\w.\- ()\[\]]+", "_", base, flags=re.UNICODE).strip(" .")
    return cleaned[:180] or "archivo"
