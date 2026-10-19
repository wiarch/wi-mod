"""Controlador de la ventana Create Profile.

La ventana llama `on_minecraft_version_changed`, `on_modloader_selected`
y `on_create`. El controlador no bloquea la interfaz: las consultas y
la instalación van en un hilo y vuelven al hilo visual con `schedule`.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable, Protocol

from wi_mod.loader_installer import LoaderInstallError, install_loader
from wi_mod.profile_creator import (
    ProfileError,
    ProfileExistsError,
    create_profile,
    fetch_available_loaders,
)

LOADERS = ("forge", "fabric", "quilt", "neoforge", "vanilla")


class ProfileView(Protocol):
    def minecraft_version(self) -> str: ...
    def profile_name(self) -> str: ...
    def selected_loader(self) -> str: ...
    def selected_loader_version(self) -> str: ...
    def set_loader_enabled(self, loader: str, enabled: bool) -> None: ...
    def set_loader_versions(self, versions: list[str], selected: str) -> None: ...
    def set_progress(self, percent: int, message: str) -> None: ...
    def set_busy(self, busy: bool, message: str = "") -> None: ...
    def show_error(self, message: str) -> None: ...
    def show_created(self, path: Path) -> None: ...


class ProfileUIController:
    def __init__(
        self,
        view: ProfileView,
        schedule: Callable[[Callable[[], None]], None] | None = None,
    ) -> None:
        self.view = view
        self._schedule = schedule or (lambda action: action())
        self._lock = threading.Lock()
        self._fetch_lock = threading.Lock()
        self._version_token = 0
        self._loader_token = 0
        self._busy = False
        self._cache: dict[str, dict[str, list[str]]] = {}

    def event_handlers(self) -> dict[str, Callable]:
        return {
            "minecraft_version": self.on_minecraft_version_changed,
            "modloader": self.on_modloader_selected,
            "create": self.on_create,
        }

    def on_minecraft_version_changed(self, mc_version: str) -> None:
        version = str(mc_version or "").strip()
        token = self._bump_version()
        if self._is_busy():
            return
        if not version:
            self._post(lambda: self._apply_availability({}, ""))
            return
        self._post(lambda: self.view.set_busy(True, "Buscando loaders"))
        threading.Thread(
            target=self._load_availability,
            args=(version, token),
            daemon=True,
        ).start()

    def on_modloader_selected(self, loader_type: str) -> None:
        loader = str(loader_type or "").strip().lower()
        version = self.view.minecraft_version().strip()
        token = self._bump_loader()
        if self._is_busy():
            return
        if loader not in LOADERS:
            self._post(lambda: self.view.show_error("Loader no válido."))
            return
        if loader == "vanilla" or not version:
            self._post(lambda: self.view.set_loader_versions([], ""))
            return
        self._post(lambda: self.view.set_busy(True, "Buscando versiones"))
        threading.Thread(
            target=self._load_loader_versions,
            args=(version, loader, token),
            daemon=True,
        ).start()

    def on_create(self) -> None:
        with self._lock:
            if self._busy:
                return
            self._busy = True
        name = self.view.profile_name().strip()
        game = self.view.minecraft_version().strip()
        loader = self.view.selected_loader().strip().lower()
        build = self.view.selected_loader_version().strip()
        if not name or not game or loader not in LOADERS:
            self._clear_busy()
            self.view.show_error("Faltan el nombre, la versión o el loader.")
            return
        if loader != "vanilla" and not build:
            self._clear_busy()
            self.view.show_error("Falta la versión del loader.")
            return
        known = self._cached(game)
        if loader != "vanilla" and known is not None and not known.get(loader):
            self._clear_busy()
            self.view.show_error(f"{loader} no está disponible para Minecraft {game}.")
            return
        self.view.set_busy(True, "Creando perfil")
        self.view.set_progress(5, "Creando perfil")
        threading.Thread(
            target=self._create,
            args=(name, game, loader, build),
            daemon=True,
        ).start()

    def _load_availability(self, mc_version: str, token: int) -> None:
        try:
            found = self._loaders(mc_version)
        except (ProfileError, OSError) as exc:
            if not self._current_version(token):
                return
            message = str(exc)
            self._post(lambda message=message: self.view.show_error(message))
            self._post(lambda: self._apply_availability({}, mc_version))
            self._post(lambda: self.view.set_busy(False, ""))
            return
        if not self._current_version(token):
            return
        self._post(lambda found=found: self._apply_availability(found, mc_version))
        self._post(lambda: self.view.set_busy(False, ""))

    def _load_loader_versions(self, mc_version: str, loader: str, token: int) -> None:
        try:
            found = self._loaders(mc_version)
        except (ProfileError, OSError) as exc:
            if not self._current_loader(token):
                return
            message = str(exc)
            self._post(lambda message=message: self.view.show_error(message))
            self._post(lambda: self.view.set_loader_versions([], ""))
            self._post(lambda: self.view.set_busy(False, ""))
            return
        if not self._current_loader(token):
            return
        versions = list(found.get(loader) or [])
        selected = versions[0] if versions else ""
        self._post(lambda versions=versions, selected=selected: self.view.set_loader_versions(versions, selected))
        self._post(lambda: self.view.set_busy(False, ""))

    def _create(self, name: str, game: str, loader: str, build: str) -> None:
        try:
            path = create_profile(name, game, loader, build)
            if loader == "vanilla":
                self._post(lambda: self.view.set_progress(100, "Perfil listo"))
                self._post(lambda path=path: self.view.show_created(path))
                return
            self._post(lambda: self.view.set_progress(40, "Descargando librerías"))
            self._post(lambda: self.view.set_busy(True, "Descargando librerías"))
            install_loader(path, loader, build, game)
            self._post(lambda: self.view.set_progress(100, "Perfil listo"))
            self._post(lambda path=path: self.view.show_created(path))
        except ProfileExistsError as exc:
            message = str(exc)
            self._post(lambda message=message: self.view.show_error(message))
        except (ProfileError, LoaderInstallError, OSError) as exc:
            message = str(exc)
            self._post(lambda message=message: self.view.show_error(message))
        finally:
            self._clear_busy()
            self._post(lambda: self.view.set_busy(False, ""))

    def _apply_availability(self, found: dict[str, list[str]], mc_version: str) -> None:
        selected = self.view.selected_loader().strip().lower()
        for loader in LOADERS:
            enabled = loader == "vanilla" or bool(found.get(loader))
            self.view.set_loader_enabled(loader, enabled)
        if selected and selected != "vanilla" and not found.get(selected):
            self.view.set_loader_versions([], "")
            return
        if selected and selected != "vanilla" and mc_version:
            versions = list(found.get(selected) or [])
            self.view.set_loader_versions(versions, versions[0] if versions else "")

    def _loaders(self, mc_version: str) -> dict[str, list[str]]:
        with self._fetch_lock:
            cached = self._cache.get(mc_version)
            if cached is not None:
                return cached
            found = fetch_available_loaders(mc_version)
            self._cache[mc_version] = found
            return found

    def _cached(self, mc_version: str) -> dict[str, list[str]] | None:
        with self._fetch_lock:
            return self._cache.get(mc_version)

    def _bump_version(self) -> int:
        with self._lock:
            self._version_token += 1
            self._loader_token += 1
            return self._version_token

    def _bump_loader(self) -> int:
        with self._lock:
            self._loader_token += 1
            return self._loader_token

    def _current_version(self, token: int) -> bool:
        with self._lock:
            return token == self._version_token

    def _current_loader(self, token: int) -> bool:
        with self._lock:
            return token == self._loader_token

    def _is_busy(self) -> bool:
        with self._lock:
            return self._busy

    def _clear_busy(self) -> None:
        with self._lock:
            self._busy = False

    def _post(self, action: Callable[[], None]) -> None:
        self._schedule(action)
