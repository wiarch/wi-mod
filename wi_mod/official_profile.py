"""Registra una instancia en el Launcher oficial de Minecraft.

Escribe en %APPDATA%/.minecraft/launcher_profiles.json un perfil custom
cuyo gameDir es la .minecraft aislada de la instancia.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


class OfficialProfileError(Exception):
    """No se pudo leer o guardar el perfil del launcher oficial."""


def launcher_profiles_path() -> Path:
    appdata = os.environ.get("APPDATA", "").strip()
    if not appdata:
        raise OfficialProfileError("No encuentro %APPDATA%.")
    return Path(appdata) / ".minecraft" / "launcher_profiles.json"


def register_instance(instance: Path) -> dict:
    instance = Path(instance)
    config_path = instance / "profile.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise OfficialProfileError("La instancia no tiene profile.json.") from exc
    if not isinstance(config, dict):
        raise OfficialProfileError("profile.json está dañado.")
    name = str(config.get("name") or instance.name).strip() or instance.name
    minecraft = (instance / ".minecraft").resolve()
    if not minecraft.is_dir():
        raise OfficialProfileError("La instancia no tiene .minecraft.")
    version_id = installed_version_id(minecraft, config)
    path = launcher_profiles_path()
    data = _read(path)
    profiles = data.get("profiles")
    if not isinstance(profiles, dict):
        profiles = {}
        data["profiles"] = profiles
    current = profiles.get(name) if isinstance(profiles.get(name), dict) else {}
    created = str(current.get("created") or "").strip() or _now()
    profiles[name] = {
        "created": created,
        "gameDir": str(minecraft),
        "icon": "Grass",
        "lastVersionId": version_id,
        "name": name,
        "type": "custom",
    }
    _write(path, data)
    return profiles[name]


def sync_instances(root: Path) -> None:
    root = Path(root)
    if not root.is_dir():
        return
    for config in root.glob("*/profile.json"):
        try:
            register_instance(config.parent)
        except OfficialProfileError:
            continue


def installed_version_id(minecraft: Path, config: dict) -> str:
    mc = str(config.get("mc_version") or "").strip()
    loader = str(config.get("loader_type") or "").strip().lower()
    build = str(config.get("loader_version") or "").strip()
    short = build[len(mc) + 1:] if mc and build.startswith(f"{mc}-") else build
    root = minecraft / "versions"
    names: list[str] = []
    if loader and loader != "vanilla" and build:
        names = [
            f"{loader}-{build}",
            f"{loader}-{short}",
            f"{mc}-{loader}-{short}",
            f"{mc}-{loader}-{build}",
        ]
    for name in names:
        if name and (root / name / f"{name}.json").is_file():
            return name
    if loader and loader != "vanilla" and root.is_dir():
        for path in sorted(root.glob("*/*.json")):
            folder = path.parent.name
            if path.name != f"{folder}.json":
                continue
            low = folder.lower()
            if loader in low and (not build or build in folder or short in folder):
                return folder
    if mc and (root / mc / f"{mc}.json").is_file():
        return mc
    return mc or build or "latest-release"


def _read(path: Path) -> dict:
    if not path.is_file():
        return {"profiles": {}, "settings": {}, "version": 5}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise OfficialProfileError("launcher_profiles.json está dañado.") from exc
    except OSError as exc:
        raise OfficialProfileError("No pude leer launcher_profiles.json.") from exc
    if not isinstance(data, dict):
        raise OfficialProfileError("launcher_profiles.json está dañado.")
    return data


def _write(path: Path, data: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        temp = path.with_suffix(".json.tmp")
        temp.write_text(text, encoding="utf-8")
        temp.replace(path)
    except OSError as exc:
        raise OfficialProfileError("No pude guardar launcher_profiles.json.") from exc


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
