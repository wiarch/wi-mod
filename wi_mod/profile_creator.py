"""Perfiles aislados al estilo CurseForge / Modrinth."""

from __future__ import annotations

import json
import re
import shutil
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from wi_mod import __version__

FABRIC_META = "https://meta.fabricmc.net/v2/versions/loader"
QUILT_META = "https://meta.quiltmc.org/v3/versions/loader"
GAME_MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
FORGE_META = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"
NEOFORGE_META = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"
LOADERS = ("forge", "fabric", "neoforge", "quilt", "vanilla")


class ProfileError(Exception):
    """Fallo al consultar loaders o crear el perfil."""


class ProfileExistsError(ProfileError):
    """La carpeta del perfil ya existe. No se tocó ningún archivo."""


_game_cache: tuple[float, list[str]] | None = None


def list_game_versions() -> list[str]:
    global _game_cache
    now = time.time()
    if _game_cache and now - _game_cache[0] < 3600:
        return list(_game_cache[1])
    response = _get(GAME_MANIFEST)
    if response.status_code >= 400:
        raise ProfileError(f"El listado de Minecraft respondió {response.status_code}.")
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProfileError("El listado de Minecraft no es JSON.") from exc
    versions = []
    for row in payload.get("versions") or []:
        if not isinstance(row, dict) or row.get("type") != "release":
            continue
        number = str(row.get("id") or "").strip()
        if number and number not in versions:
            versions.append(number)
    if not versions:
        raise ProfileError("Minecraft no devolvió versiones.")
    _game_cache = (now, versions)
    return list(versions)


def fetch_available_loaders(mc_version: str) -> dict:
    version = str(mc_version or "").strip()
    if not version:
        raise ProfileError("Falta la versión de Minecraft.")
    return {
        "forge": _forge_versions(version),
        "fabric": _loader_versions(f"{FABRIC_META}/{quote(version, safe='')}"),
        "neoforge": _neoforge_versions(version),
        "quilt": _loader_versions(f"{QUILT_META}/{quote(version, safe='')}"),
    }


def create_profile(
    profile_name: str,
    mc_version: str,
    loader_type: str,
    loader_version: str,
) -> Path:
    name = _safe_name(profile_name)
    version = str(mc_version or "").strip()
    loader = str(loader_type or "").strip()
    loader_ver = str(loader_version or "").strip()
    if loader not in LOADERS:
        raise ProfileError("loader_type debe ser forge, fabric, neoforge, quilt o vanilla.")
    if not version or (loader != "vanilla" and not loader_ver):
        raise ProfileError("Faltan la versión de Minecraft o del loader.")
    instance = Path(__file__).resolve().parent.parent / "instances" / name
    if instance.exists():
        raise ProfileExistsError(f"El perfil {name} ya existe. No se ha modificado nada.")
    minecraft = instance / ".minecraft"
    config = {
        "name": name,
        "mc_version": version,
        "loader_type": loader,
        "loader_version": loader_ver,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    created = False
    try:
        instance.mkdir(parents=True)
        created = True
        for folder in ("mods", "config", "resourcepacks", "saves"):
            (minecraft / folder).mkdir(parents=True)
        (instance / "profile.json").write_text(
            json.dumps(config, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except ProfileExistsError:
        raise
    except FileExistsError as exc:
        raise ProfileExistsError(f"El perfil {name} ya existe. No se ha modificado nada.") from exc
    except OSError as exc:
        if created:
            shutil.rmtree(instance, ignore_errors=True)
        raise ProfileError(f"No pude crear el perfil {name}.") from exc
    return instance


def _safe_name(name: str) -> str:
    text = str(name or "").strip()
    if not text or text in {".", ".."} or re.search(r"[\\/]|[\x00-\x1f]", text):
        raise ProfileError("Nombre de perfil no válido.")
    return text


class _Body:
    def __init__(self, status: int, payload: bytes) -> None:
        self.status_code = status
        self.content = payload

    def json(self) -> list | dict:
        return json.loads(self.content.decode("utf-8"))


def _get(url: str) -> _Body:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__}", "Accept": "application/json, application/xml, text/xml"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return _Body(response.status, response.read())
    except urllib.error.HTTPError as exc:
        return _Body(exc.code, exc.read())
    except urllib.error.URLError as exc:
        raise ProfileError("No hay conexión con el metadato del loader.") from exc


def _loader_versions(url: str) -> list[str]:
    response = _get(url)
    if response.status_code in {400, 404}:
        return []
    if response.status_code >= 400:
        raise ProfileError(f"El metadato del loader respondió {response.status_code}.")
    try:
        rows = response.json()
    except ValueError as exc:
        raise ProfileError("El metadato del loader no es JSON.") from exc
    if not isinstance(rows, list):
        return []
    versions = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        number = str((row.get("loader") or {}).get("version") or "").strip()
        if number and number not in versions:
            versions.append(number)
    return versions


def _maven_versions(url: str) -> list[str]:
    response = _get(url)
    if response.status_code >= 400:
        raise ProfileError(f"El metadato del loader respondió {response.status_code}.")
    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as exc:
        raise ProfileError("El metadato Maven está dañado.") from exc
    versions = []
    for node in root.findall("./versioning/versions/version"):
        text = str(node.text or "").strip()
        if text:
            versions.append(text)
    return versions


def _forge_versions(mc_version: str) -> list[str]:
    prefix = f"{mc_version}-"
    found = []
    for version in _maven_versions(FORGE_META):
        if not version.startswith(prefix):
            continue
        build = version[len(prefix):].strip()
        if build and build not in found:
            found.append(build)
    found.reverse()
    return found


def _neoforge_versions(mc_version: str) -> list[str]:
    prefixes = _neoforge_prefixes(mc_version)
    found = []
    for version in _maven_versions(NEOFORGE_META):
        if not any(version.startswith(prefix) for prefix in prefixes):
            continue
        if version not in found:
            found.append(version)
    found.reverse()
    return found


def _neoforge_prefixes(mc_version: str) -> list[str]:
    parts = mc_version.split(".")
    prefixes = [f"{mc_version}-", f"{mc_version}."]
    if len(parts) >= 2 and parts[0] == "1":
        patch = parts[2] if len(parts) > 2 else "0"
        prefixes.insert(0, f"{parts[1]}.{patch}.")
    return prefixes
