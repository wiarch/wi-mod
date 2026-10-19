"""Arranca Minecraft con Java a partir del perfil de la instancia."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import threading
import zipfile
from pathlib import Path


class LauncherError(Exception):
    """Fallo al preparar o arrancar el juego."""


def launch_game(
    instance_path: Path,
    java_binary: str,
    username: str,
    uuid: str,
    token: str,
) -> subprocess.Popen:
    instance = Path(instance_path)
    java = str(java_binary or "").strip()
    player = str(username or "").strip()
    player_id = str(uuid or "").strip()
    access = str(token or "").strip()
    if not java or not player or not player_id or not access:
        raise LauncherError("Faltan Java, el usuario o la sesión.")
    config = _read_instance(instance)
    mc_version = str(config.get("mc_version") or "").strip()
    loader_type = str(config.get("loader_type") or "").strip()
    loader_version = str(config.get("loader_version") or "").strip()
    if not mc_version or not loader_type or not loader_version:
        raise LauncherError("instance.json no tiene versión o loader.")
    minecraft = (instance / ".minecraft").resolve()
    if not minecraft.is_dir():
        raise LauncherError("La instancia no tiene .minecraft.")
    profile = _load_profile(minecraft, mc_version, loader_type, loader_version)
    version_id = str(profile.get("id") or f"{loader_type}-loader-{loader_version}-{mc_version}")
    main_class = _main_class(profile)
    natives = minecraft / "versions" / version_id / "natives"
    libraries = _library_jars(minecraft, profile.get("libraries") or [], natives)
    client = _client_jar(minecraft, str(profile.get("inheritsFrom") or mc_version))
    classpath = os.pathsep.join(str(path) for path in [*libraries, client])
    command = [
        java,
        f"-Djava.library.path={natives}",
        "-cp",
        classpath,
        main_class,
        "--gameDir",
        str(minecraft),
        "--username",
        player,
        "--uuid",
        player_id,
        "--accessToken",
        access,
        "--version",
        version_id,
    ]
    log_path = minecraft / "logs" / "launcher.log"
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("ab") as handle:
            handle.write(b"\n--- launch ---\n")
        process = subprocess.Popen(
            command,
            cwd=str(minecraft),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except OSError as exc:
        raise LauncherError("No pude arrancar Java.") from exc
    _follow(process.stdout, log_path)
    _follow(process.stderr, log_path)
    return process


def _read_instance(instance: Path) -> dict:
    path = instance / "instance.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise LauncherError("No existe instance.json.") from exc
    except json.JSONDecodeError as exc:
        raise LauncherError("instance.json está dañado.") from exc
    except OSError as exc:
        raise LauncherError("No pude leer instance.json.") from exc
    if not isinstance(data, dict):
        raise LauncherError("instance.json está dañado.")
    return data


def _load_profile(minecraft: Path, mc_version: str, loader_type: str, loader_version: str) -> dict:
    version_id = f"{loader_type}-loader-{loader_version}-{mc_version}"
    path = minecraft / "versions" / version_id / f"{version_id}.json"
    if not path.is_file():
        path = _find_profile(minecraft, mc_version, loader_type, loader_version)
    try:
        profile = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LauncherError("No pude leer el perfil de la versión.") from exc
    if not isinstance(profile, dict):
        raise LauncherError("El perfil de la versión está dañado.")
    parent_name = str(profile.get("inheritsFrom") or "").strip()
    if not parent_name:
        return profile
    parent_path = minecraft / "versions" / parent_name / f"{parent_name}.json"
    if not parent_path.is_file():
        return profile
    try:
        parent = json.loads(parent_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LauncherError("No pude leer la versión base de Minecraft.") from exc
    if not isinstance(parent, dict):
        return profile
    libraries = [row for row in parent.get("libraries") or [] if isinstance(row, dict)]
    libraries.extend(row for row in profile.get("libraries") or [] if isinstance(row, dict))
    merged = dict(parent)
    merged.update(profile)
    merged["libraries"] = libraries
    return merged


def _find_profile(minecraft: Path, mc_version: str, loader_type: str, loader_version: str) -> Path:
    root = minecraft / "versions"
    try:
        candidates = sorted(root.glob("*/*.json"))
    except OSError as exc:
        raise LauncherError("No pude buscar el perfil de Fabric.") from exc
    for path in candidates:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        text = f"{path.parent.name} {data.get('id') or ''}".lower()
        if loader_type.lower() in text and mc_version in text and loader_version in text:
            return path
    raise LauncherError("No hay un perfil instalado para esa versión y ese loader.")


def _main_class(profile: dict) -> str:
    raw = profile.get("mainClass")
    if isinstance(raw, dict):
        raw = raw.get("client") or raw.get("server")
    name = str(raw or "").strip()
    if not name:
        raise LauncherError("El perfil no dice qué clase arrancar.")
    return name


def _client_jar(minecraft: Path, version: str) -> Path:
    path = minecraft / "versions" / version / f"{version}.jar"
    if not path.is_file():
        raise LauncherError(f"Falta el jar del cliente {version}.")
    return path.resolve()


def _library_jars(minecraft: Path, libraries: list, natives: Path) -> list[Path]:
    root = minecraft / "libraries"
    jars: list[Path] = []
    seen: set[Path] = set()
    try:
        natives.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise LauncherError("No pude crear la carpeta de nativos.") from exc
    for library in libraries:
        if not isinstance(library, dict) or not _allowed(library):
            continue
        path = _library_file(root, library)
        if path is None or not path.is_file() or path in seen:
            continue
        seen.add(path)
        jars.append(path.resolve())
        if _is_native(library):
            _extract_natives(path, natives)
    if not jars:
        raise LauncherError("No hay librerías en el classpath.")
    return jars


def _library_file(root: Path, library: dict) -> Path | None:
    downloads = library.get("downloads") if isinstance(library.get("downloads"), dict) else {}
    artifact = downloads.get("artifact") if isinstance(downloads.get("artifact"), dict) else {}
    relative = str(artifact.get("path") or "").strip()
    if not relative:
        name = str(library.get("name") or "").strip()
        if not name:
            return None
        relative = _maven_path(name)
    return root / Path(relative)


def _maven_path(name: str) -> str:
    parts = name.split(":")
    if len(parts) < 3:
        raise LauncherError(f"Coordenada Maven no válida: {name}")
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
    return "/".join((
        group.replace(".", "/"),
        artifact,
        version,
        f"{filename}.{extension or 'jar'}",
    ))


def _is_native(library: dict) -> bool:
    name = str(library.get("name") or "")
    if "natives" in name:
        return True
    return isinstance(library.get("natives"), dict)


def _extract_natives(jar_path: Path, natives: Path) -> None:
    try:
        with zipfile.ZipFile(jar_path) as bundle:
            for info in bundle.infolist():
                suffix = Path(info.filename).suffix.lower()
                if suffix not in {".dll", ".so", ".dylib", ".jnilib"}:
                    continue
                target = natives / Path(info.filename).name
                if target.exists():
                    continue
                target.write_bytes(bundle.read(info))
    except (OSError, zipfile.BadZipFile):
        return


def _allowed(library: dict) -> bool:
    rules = library.get("rules")
    if not rules:
        return True
    allowed = False
    current = _os_name()
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        wanted = (rule.get("os") or {}).get("name")
        if wanted and wanted != current:
            continue
        allowed = rule.get("action") == "allow"
    return allowed


def _os_name() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "osx"
    return system


def _follow(stream, log_path: Path) -> None:
    if stream is None:
        return

    def pump() -> None:
        try:
            with log_path.open("ab") as handle:
                while True:
                    line = stream.readline()
                    if not line:
                        break
                    handle.write(line)
                    handle.flush()
        except OSError:
            return

    threading.Thread(target=pump, daemon=True).start()
