"""Busca mods en Modrinth y los instala en la carpeta mods de la instancia."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import quote

from wi_mod import __version__

API = "https://api.modrinth.com/v2"
LOADERS = ("fabric", "forge", "neoforge")


class ModManagerError(Exception):
    """Fallo al buscar o instalar un mod."""


class ModManager:
    def __init__(self, timeout: float = 30) -> None:
        self.timeout = timeout

    def search_mods(self, query: str, mc_version: str, loader: str) -> list:
        version = str(mc_version or "").strip()
        kind = str(loader or "").strip()
        if not version or not kind:
            raise ModManagerError("Faltan la versión de Minecraft o el loader.")
        facets = json.dumps([
            [f"versions:{version}"],
            [f"categories:{kind}"],
            ["project_type:mod"],
        ])
        payload = self._get_json("/search", {
            "query": " ".join(str(query or "").split()),
            "facets": facets,
            "limit": 20,
        })
        hits = payload.get("hits") if isinstance(payload, dict) else None
        if not isinstance(hits, list):
            raise ModManagerError("Modrinth no devolvió resultados.")
        return [row for row in hits if isinstance(row, dict)]

    def get_available_loaders_for_mod(self, project_id: str, mc_version: str) -> dict:
        version = str(mc_version or "").strip()
        if not version:
            raise ModManagerError("Falta la versión de Minecraft.")
        found = {name: False for name in LOADERS}
        for row in self._versions(project_id):
            if version not in (row.get("game_versions") or []) or not _primary_jar(row):
                continue
            available = {str(item).strip().lower() for item in (row.get("loaders") or [])}
            for name in LOADERS:
                if name in available:
                    found[name] = True
        return found

    def install_mod(
        self,
        project_id: str,
        mc_version: str,
        selected_loader: str,
        instance_path: Path,
    ) -> list[Path]:
        project = str(project_id or "").strip()
        version = str(mc_version or "").strip()
        loader = str(selected_loader or "").strip().lower()
        self._require_loader(project, version, loader, selected_loader)
        mods = Path(instance_path) / ".minecraft" / "mods"
        try:
            mods.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ModManagerError("No pude crear la carpeta mods.") from exc
        saved: list[Path] = []
        self._install(project, version, loader, mods, saved, set())
        return saved

    def _install(
        self,
        project_id: str,
        mc_version: str,
        loader: str,
        mods: Path,
        saved: list[Path],
        seen: set[str],
    ) -> None:
        if not project_id or not mc_version or not loader:
            raise ModManagerError("Faltan el proyecto, la versión o el loader.")
        if project_id in seen:
            return
        seen.add(project_id)
        self._require_loader(project_id, mc_version, loader, loader)
        version = self._matching_version(project_id, mc_version, loader)
        jar = _primary_jar(version)
        path = self._save_jar(jar, mods)
        if path is not None:
            saved.append(path)
        for dep in version.get("dependencies") or []:
            if not isinstance(dep, dict) or dep.get("dependency_type") != "required":
                continue
            dep_id = str(dep.get("project_id") or "").strip()
            if not dep_id:
                continue
            self._install(dep_id, mc_version, loader, mods, saved, seen)

    def _require_loader(
        self,
        project_id: str,
        mc_version: str,
        loader: str,
        label: str,
    ) -> None:
        if loader not in LOADERS or not self.get_available_loaders_for_mod(project_id, mc_version).get(loader):
            raise ValueError(f"El mod no está disponible para {label} en MC {mc_version}")

    def _versions(self, project_id: str) -> list[dict]:
        project = str(project_id or "").strip()
        if not project:
            raise ModManagerError("Falta el proyecto.")
        rows = self._get_json(f"/project/{quote(project, safe='')}/version")
        if not isinstance(rows, list):
            raise ModManagerError(f"Modrinth no devolvió versiones de {project}.")
        return [row for row in rows if isinstance(row, dict)]

    def _matching_version(self, project_id: str, mc_version: str, loader: str) -> dict:
        wanted_version = str(mc_version or "").strip()
        wanted_loader = str(loader or "").strip().lower()
        matches = []
        for row in self._versions(project_id):
            games = {str(item).strip() for item in (row.get("game_versions") or [])}
            loaders = {str(item).strip().lower() for item in (row.get("loaders") or [])}
            # Coincidencia exacta en AMBOS arrays; nada de rangos ni "1.20" genérico.
            if wanted_version in games and wanted_loader in loaders and _primary_jar(row):
                matches.append(row)
        if matches:
            # No confío en el orden de la API: la última es la más reciente publicada.
            return max(matches, key=lambda row: str(row.get("date_published") or ""))
        raise ModManagerError(
            f"{project_id} no tiene un .jar para {mc_version} con {loader}."
        )

    def _save_jar(self, jar: dict, mods: Path) -> Path | None:
        filename = Path(str(jar.get("filename") or "")).name
        url = str(jar.get("url") or "").strip()
        if not filename.lower().endswith(".jar") or not url:
            raise ModManagerError("La versión no trae un .jar descargable.")
        dest = mods / filename
        if dest.is_file() and dest.stat().st_size > 0:
            return None
        request = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response, dest.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 64)
                    if not chunk:
                        break
                    handle.write(chunk)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise ModManagerError(f"No encuentro el archivo {filename}.") from exc
            raise ModManagerError(f"Modrinth respondió {exc.code} al bajar {filename}.") from exc
        except urllib.error.URLError as exc:
            raise ModManagerError(f"No pude bajar {filename}.") from exc
        except OSError as exc:
            raise ModManagerError(f"No pude guardar {filename}.") from exc
        return dest

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": f"wi-mod/{__version__} (local library)",
        }

    def _get_json(self, path: str, params: dict | None = None) -> list | dict:
        url = f"{API}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as exc:
            status, payload = exc.code, exc.read()
        except urllib.error.URLError as exc:
            raise ModManagerError("No hay conexión con Modrinth.") from exc
        if status == 404:
            raise ModManagerError("Ese proyecto no existe en Modrinth.")
        if status >= 400:
            raise ModManagerError(f"Modrinth respondió {status}.")
        try:
            return json.loads(payload.decode("utf-8"))
        except ValueError as exc:
            raise ModManagerError("Modrinth devolvió una respuesta que no es JSON.") from exc


def _primary_jar(version: dict) -> dict | None:
    files = version.get("files") if isinstance(version.get("files"), list) else []
    jars = [
        item for item in files
        if isinstance(item, dict) and str(item.get("filename") or "").lower().endswith(".jar")
    ]
    for item in jars:
        if item.get("primary"):
            return item
    return jars[0] if jars else None
