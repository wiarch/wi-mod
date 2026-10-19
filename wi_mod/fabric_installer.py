"""Descarga el perfil de Fabric y lo deja en la instancia."""

from __future__ import annotations

import json
import platform
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

META = "https://meta.fabricmc.net/v2/versions/loader"
DEFAULT_MAVEN = "https://maven.fabricmc.net/"


class FabricError(Exception):
    """Fallo al instalar Fabric."""


class FabricIncompatibleError(FabricError):
    """La versión de Minecraft no tiene loader estable."""


class FabricConnectionError(FabricError):
    """La API o un jar no respondieron."""


def _maven_path(name: str) -> str:
    parts = str(name or "").split(":")
    if len(parts) < 3:
        raise FabricError(f"Coordenada Maven no válida: {name}")
    group, artifact, version = parts[0], parts[1], parts[2]
    extra = parts[3] if len(parts) > 3 else ""
    classifier = ""
    extension = "jar"
    if "@" in version:
        version, extension = version.split("@", 1)
    if extra:
        if "@" in extra:
            classifier, extension = extra.split("@", 1)
        else:
            classifier = extra
    filename = f"{artifact}-{version}"
    if classifier:
        filename = f"{filename}-{classifier}"
    filename = f"{filename}.{extension or 'jar'}"
    return "/".join((group.replace(".", "/"), artifact, version, filename))


def _os_name() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "osx"
    return system


def _library_allowed(library: dict) -> bool:
    rules = library.get("rules")
    if not rules:
        return True
    allowed = False
    current = _os_name()
    for rule in rules:
        wanted = (rule.get("os") or {}).get("name")
        if wanted and wanted != current:
            continue
        allowed = rule.get("action") == "allow"
    return allowed


class FabricInstaller:
    def __init__(self, timeout: float = 30) -> None:
        self.timeout = timeout

    def stable_loaders(self, mc_version: str) -> list[dict]:
        version = str(mc_version or "").strip()
        if not version:
            raise FabricIncompatibleError("Falta la versión de Minecraft.")
        url = f"{META}/{quote(version, safe='')}"
        rows = self._get_json(url)
        if not isinstance(rows, list) or not rows:
            raise FabricIncompatibleError(
                f"Minecraft {version} no es compatible con Fabric."
            )
        stable = [
            row for row in rows
            if isinstance(row, dict) and (row.get("loader") or {}).get("stable") is True
        ]
        if not stable:
            raise FabricIncompatibleError(
                f"Minecraft {version} no tiene un loader estable de Fabric."
            )
        return stable

    def install(
        self,
        instance_path: Path,
        mc_version: str,
        loader_version: str | None = None,
    ) -> Path:
        minecraft = Path(instance_path) / ".minecraft"
        if not minecraft.is_dir():
            raise FabricError("La instancia no tiene .minecraft.")
        version = str(mc_version or "").strip()
        loaders = self.stable_loaders(version)
        chosen = self._pick(loaders, loader_version)
        loader = str((chosen.get("loader") or {}).get("version") or "").strip()
        profile_url = f"{META}/{quote(version, safe='')}/{quote(loader, safe='')}/profile/json"
        profile = self._get_json(profile_url)
        if not isinstance(profile, dict) or not profile.get("id"):
            raise FabricError("Fabric no devolvió un perfil válido.")
        version_id = str(profile["id"])
        libraries = [row for row in profile.get("libraries") or [] if isinstance(row, dict)]
        profile["libraries"] = libraries
        version_dir = minecraft / "versions" / version_id
        profile_path = version_dir / f"{version_id}.json"
        try:
            version_dir.mkdir(parents=True, exist_ok=True)
            profile_path.write_text(
                json.dumps(profile, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (version_dir / "libraries.json").write_text(
                json.dumps(libraries, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            raise FabricError(f"No pude escribir el perfil {version_id}.") from exc
        self._download_libraries(minecraft / "libraries", libraries)
        return profile_path

    def _pick(self, loaders: list[dict], loader_version: str | None) -> dict:
        wanted = str(loader_version or "").strip()
        if not wanted:
            return loaders[0]
        for row in loaders:
            if str((row.get("loader") or {}).get("version") or "") == wanted:
                return row
        raise FabricIncompatibleError(f"El loader {wanted} no está entre los estables.")

    def _get_json(self, url: str) -> list | dict:
        status, payload = self._read(url)
        if status in {400, 404}:
            raise FabricIncompatibleError("Esa versión de Minecraft no es compatible con Fabric.")
        if status >= 400:
            raise FabricConnectionError(f"Fabric respondió {status}.")
        try:
            return json.loads(payload.decode("utf-8"))
        except ValueError as exc:
            raise FabricError("Fabric devolvió una respuesta que no es JSON.") from exc

    def _read(self, url: str) -> tuple[int, bytes]:
        request = urllib.request.Request(url, headers={"User-Agent": "wi-mod"})
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()
        except urllib.error.URLError as exc:
            raise FabricConnectionError("No hay conexión con Fabric.") from exc

    def _download_libraries(self, libraries_dir: Path, libraries: list[dict]) -> None:
        try:
            libraries_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise FabricError("No pude crear la carpeta de librerías.") from exc
        for library in libraries:
            if not _library_allowed(library):
                continue
            name = library.get("name")
            if not name:
                continue
            relative = _maven_path(str(name))
            dest = libraries_dir / Path(relative)
            if dest.is_file() and dest.stat().st_size > 0:
                continue
            base = str(library.get("url") or DEFAULT_MAVEN)
            if not base.endswith("/"):
                base = f"{base}/"
            url = f"{base}{relative}"
            request = urllib.request.Request(url, headers={"User-Agent": "wi-mod"})
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with urllib.request.urlopen(request, timeout=self.timeout) as response, dest.open("wb") as handle:
                    while True:
                        chunk = response.read(1024 * 64)
                        if not chunk:
                            break
                        handle.write(chunk)
            except urllib.error.HTTPError as exc:
                raise FabricConnectionError(f"No pude bajar {name}.") from exc
            except urllib.error.URLError as exc:
                raise FabricConnectionError(f"No pude bajar {name}.") from exc
            except OSError as exc:
                raise FabricError(f"No pude guardar {name}.") from exc
