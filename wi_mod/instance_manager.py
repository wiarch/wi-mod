"""Instancias aisladas de Minecraft. Cada una tiene su .minecraft."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

LOADERS = ("fabric", "forge", "neoforge", "vanilla")
_SUFFIX = {
    "fabric": "Fabric",
    "forge": "Forge",
    "neoforge": "NeoForge",
    "vanilla": "Vanilla",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _loader(loader_type: str) -> str:
    loader = str(loader_type or "").strip()
    if loader not in LOADERS:
        raise ValueError("loader_type debe ser fabric, forge, neoforge o vanilla.")
    return loader


def _safe_name(name: str) -> str:
    text = str(name or "").strip()
    if not text or text in {".", ".."} or re.search(r"[\\/]|[\x00-\x1f]", text):
        raise ValueError("Nombre de instancia no válido.")
    return text


class InstanceManager:
    def __init__(self, base: Path | None = None) -> None:
        root = Path(base) if base is not None else Path(__file__).resolve().parent.parent
        self.base = root
        self.root = root / "instances"

    def create_instance(
        self,
        name: str,
        mc_version: str,
        loader_type: str,
        loader_version: str,
    ) -> Path:
        folder = _safe_name(name)
        version = str(mc_version or "").strip()
        loader = _loader(loader_type)
        loader_ver = str(loader_version or "").strip()
        if not version or not loader_ver:
            raise ValueError("Faltan la versión de Minecraft o del loader.")
        instance = self.root / folder
        minecraft = instance / ".minecraft"
        config = {
            "name": folder,
            "createdAt": _now(),
            "mc_version": version,
            "loader_type": loader,
            "loader_version": loader_ver,
        }
        try:
            if (instance / "instance.json").is_file():
                raise ValueError("Esa instancia ya existe.")
            for path in (
                minecraft / "mods",
                minecraft / "config",
                minecraft / "resourcepacks",
            ):
                path.mkdir(parents=True, exist_ok=True)
            (instance / "instance.json").write_text(
                json.dumps(config, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except ValueError:
            raise
        except OSError as exc:
            raise OSError(f"No pude crear la instancia {folder}.") from exc
        return instance

    def switch_or_clone_instance_for_loader(
        self,
        original_instance_name: str,
        new_loader_type: str,
        new_loader_version: str,
    ) -> Path:
        folder = _safe_name(original_instance_name)
        loader = _loader(new_loader_type)
        loader_ver = str(new_loader_version or "").strip()
        if not loader_ver:
            raise ValueError("Falta la versión del loader.")
        config = self.get_instance_config(folder)
        mc_version = str(config.get("mc_version") or "").strip()
        if not mc_version:
            raise ValueError("La instancia original no tiene versión de Minecraft.")
        new_name = _safe_name(f"{folder}_{_SUFFIX[loader]}")
        source = self.root / folder
        dest = self.root / new_name
        if dest.exists():
            raise ValueError("Esa instancia ya existe.")
        minecraft = dest / ".minecraft"
        cloned = {
            "name": new_name,
            "createdAt": _now(),
            "mc_version": mc_version,
            "loader_type": loader,
            "loader_version": loader_ver,
        }
        try:
            for path in (
                minecraft / "mods",
                minecraft / "config",
                minecraft / "resourcepacks",
                minecraft / "saves",
            ):
                path.mkdir(parents=True, exist_ok=True)
            _copy_tree(source / ".minecraft" / "config", minecraft / "config")
            _copy_tree(source / ".minecraft" / "saves", minecraft / "saves")
            _copy_tree(source / ".minecraft" / "resourcepacks", minecraft / "resourcepacks")
            (dest / "instance.json").write_text(
                json.dumps(cloned, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            shutil.rmtree(dest, ignore_errors=True)
            raise OSError(f"No pude clonar la instancia {folder}.") from exc
        return dest

    def list_instances(self) -> list[dict]:
        try:
            if not self.root.is_dir():
                return []
            rows = []
            for path in sorted(self.root.iterdir(), key=lambda item: item.name.lower()):
                if not path.is_dir():
                    continue
                try:
                    rows.append(self.get_instance_config(path.name))
                except (OSError, ValueError):
                    continue
            return rows
        except OSError as exc:
            raise OSError("No pude listar las instancias.") from exc

    def get_instance_config(self, name: str) -> dict:
        folder = _safe_name(name)
        path = self.root / folder / "instance.json"
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except FileNotFoundError as exc:
            raise ValueError("No existe esa instancia.") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("instance.json está dañado.") from exc
        except OSError as exc:
            raise OSError(f"No pude leer la instancia {folder}.") from exc
        if not isinstance(data, dict):
            raise ValueError("instance.json está dañado.")
        return data


def _copy_tree(source: Path, dest: Path) -> None:
    if not source.is_dir():
        return
    shutil.copytree(source, dest, dirs_exist_ok=True)
