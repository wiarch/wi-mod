"""Arranca Minecraft con Java a partir del perfil de la instancia."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import uuid
import zipfile
from pathlib import Path

from wi_mod.loader_installer import find_javaw


class LauncherError(Exception):
    """Fallo al preparar o arrancar el juego."""


def launch_game(
    instance_path: Path,
    username: str = "",
    uuid_value: str = "",
    token: str = "",
) -> subprocess.Popen:
    instance = Path(instance_path)
    config = _read_instance(instance)
    mc_version = str(config.get("mc_version") or "").strip()
    loader_type = str(config.get("loader_type") or "vanilla").strip().lower()
    loader_version = str(config.get("loader_version") or mc_version).strip()
    if not mc_version:
        raise LauncherError("El perfil no tiene versión de Minecraft.")
    java = find_javaw(mc_version)
    if not java:
        raise LauncherError("No encuentro javaw. Instala Java 17 o 21 según la versión.")
    player = str(username or "Player").strip() or "Player"
    player_id = str(uuid_value or "").strip() or _offline_uuid(player)
    access = str(token or "0").strip() or "0"
    minecraft = (instance / ".minecraft").resolve()
    if not minecraft.is_dir():
        raise LauncherError("La instancia no tiene .minecraft.")
    profile = _load_profile(minecraft, mc_version, loader_type, loader_version)
    version_id = str(profile.get("id") or mc_version)
    main_class = _main_class(profile)
    natives = minecraft / "versions" / version_id / "natives"
    libraries = _library_jars(minecraft, profile.get("libraries") or [], natives)
    client = _client_jar(minecraft, str(profile.get("inheritsFrom") or mc_version))
    classpath_entries = list(libraries)
    if client is not None:
        classpath_entries.append(client)
    classpath = os.pathsep.join(str(path) for path in classpath_entries)
    assets = _assets_dir(minecraft)
    asset_index = _asset_index(profile)
    values = {
        "auth_player_name": player,
        "auth_uuid": player_id,
        "auth_access_token": access,
        "auth_xuid": "0",
        "clientid": "",
        "user_type": "legacy" if access == "0" else "msa",
        "version_name": version_id,
        "version_type": str(profile.get("type") or "release"),
        "game_directory": str(minecraft),
        "assets_root": str(assets),
        "assets_index_name": asset_index,
        "library_directory": str((minecraft / "libraries").resolve()),
        "classpath_separator": os.pathsep,
        "natives_directory": str(natives),
        "classpath": classpath,
        "launcher_name": "wi-mod",
        "launcher_version": "0",
    }
    jvm = _expand_args((profile.get("arguments") or {}).get("jvm") or [], values)
    game = _expand_args((profile.get("arguments") or {}).get("game") or [], values)
    if not any(arg.startswith("-Djava.library.path=") for arg in jvm):
        jvm.insert(0, f"-Djava.library.path={natives}")
    if "-cp" not in jvm and "-classpath" not in jvm:
        jvm.extend(["-cp", classpath])
    _ensure_game_arg(game, "--gameDir", str(minecraft))
    _ensure_game_arg(game, "--assetsDir", str(assets))
    _ensure_game_arg(game, "--assetIndex", asset_index)
    _ensure_game_arg(game, "--version", version_id)
    _ensure_game_arg(game, "--username", player)
    _ensure_game_arg(game, "--uuid", player_id)
    _ensure_game_arg(game, "--accessToken", access)
    command = [java, *jvm, main_class, *game]
    return _spawn(minecraft, version_id, command)


def _read_instance(instance: Path) -> dict:
    path = instance / "profile.json"
    if not path.is_file():
        path = instance / "instance.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise LauncherError("No existe profile.json.") from exc
    except json.JSONDecodeError as exc:
        raise LauncherError("profile.json está dañado.") from exc
    except OSError as exc:
        raise LauncherError("No pude leer profile.json.") from exc
    if not isinstance(data, dict):
        raise LauncherError("profile.json está dañado.")
    return data


def _load_profile(minecraft: Path, mc_version: str, loader_type: str, loader_version: str) -> dict:
    names = [mc_version] if loader_type == "vanilla" else [
        f"{loader_type}-loader-{loader_version}-{mc_version}",
        f"{mc_version}-{loader_type}-{loader_version}",
        f"{loader_type}-{loader_version}",
    ]
    path = None
    for name in names:
        candidate = minecraft / "versions" / name / f"{name}.json"
        if candidate.is_file():
            path = candidate
            break
    if path is None:
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
    merged["arguments"] = _merge_args(parent.get("arguments"), profile.get("arguments"))
    if not merged.get("mainClass"):
        merged["mainClass"] = parent.get("mainClass")
    if not merged.get("assetIndex"):
        merged["assetIndex"] = parent.get("assetIndex")
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
        blob = f"{path.parent.name} {data.get('id') or ''} {data.get('inheritsFrom') or ''}".lower()
        if loader_type.lower() in blob and loader_version in blob and mc_version in blob:
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


def _client_jar(minecraft: Path, version: str) -> Path | None:
    path = minecraft / "versions" / version / f"{version}.jar"
    if path.is_file():
        return path.resolve()
    return None


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
    return


def _merge_args(parent, child) -> dict:
    base = parent if isinstance(parent, dict) else {}
    extra = child if isinstance(child, dict) else {}
    merged: dict = {}
    for key in ("game", "jvm"):
        rows = [item for item in (base.get(key) or [])]
        rows.extend(item for item in (extra.get(key) or []))
        if rows:
            merged[key] = rows
    return merged


def _expand_args(entries, values: dict) -> list[str]:
    out: list[str] = []
    for entry in entries or []:
        for piece in _arg_pieces(entry):
            out.append(_subst(piece, values))
    return out


def _arg_pieces(entry) -> list[str]:
    if isinstance(entry, str):
        return [entry]
    if isinstance(entry, list):
        pieces: list[str] = []
        for item in entry:
            pieces.extend(_arg_pieces(item))
        return pieces
    if isinstance(entry, dict):
        if not _rules_pass(entry.get("rules") or []):
            return []
        return _arg_pieces(entry.get("value"))
    return []


def _rules_pass(rules) -> bool:
    if not rules:
        return True
    allowed = False
    current = _os_name()
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        if rule.get("features"):
            continue
        wanted = (rule.get("os") or {}).get("name")
        if wanted and wanted != current:
            continue
        allowed = rule.get("action") == "allow"
    return allowed


def _subst(text: str, values: dict) -> str:
    return re.sub(r"\$\{([A-Za-z0-9_]+)\}", lambda match: str(values.get(match.group(1), match.group(0))), text)


def _ensure_game_arg(game: list[str], flag: str, value: str) -> None:
    if not value or flag in game:
        return
    game.extend([flag, value])


def stage_mods(minecraft: Path, sources: list[Path]) -> int:
    mods_dir = Path(minecraft) / "mods"
    mods_dir.mkdir(parents=True, exist_ok=True)
    stamp = mods_dir / ".wi-mod-mods.json"
    previous: list[str] = []
    try:
        saved = json.loads(stamp.read_text(encoding="utf-8"))
        if isinstance(saved, list):
            previous = [str(name) for name in saved]
    except (OSError, json.JSONDecodeError):
        previous = []
    for name in previous:
        target = mods_dir / name
        if target.is_file():
            target.unlink(missing_ok=True)
    placed: list[str] = []
    for source in sources:
        path = Path(source)
        if not path.is_file() or path.suffix.lower() != ".jar":
            continue
        dest = mods_dir / path.name
        if dest.exists():
            dest.unlink()
        shutil.copy2(path, dest)
        placed.append(dest.name)
    stamp.write_text(json.dumps(placed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(placed)


def _asset_index(profile: dict) -> str:
    index = profile.get("assetIndex") if isinstance(profile.get("assetIndex"), dict) else {}
    return str(index.get("id") or profile.get("assets") or "").strip()


def _assets_dir(minecraft: Path) -> Path:
    local = minecraft / "assets"
    if (local / "indexes").is_dir():
        return local.resolve()
    appdata = os.environ.get("APPDATA", "").strip()
    shared = Path(appdata) / ".minecraft" / "assets" if appdata else None
    if shared and (shared / "indexes").is_dir():
        return shared.resolve()
    return local.resolve()


def _offline_uuid(name: str) -> str:
    digest = bytearray(hashlib.md5(f"OfflinePlayer:{name}".encode("utf-8")).digest())
    digest[6] = (digest[6] & 0x0F) | 0x30
    digest[8] = (digest[8] & 0x3F) | 0x80
    return str(uuid.UUID(bytes=bytes(digest)))


def _spawn(minecraft: Path, version_id: str, command: list[str]) -> subprocess.Popen:
    folder = minecraft / "versions" / version_id
    log_path = minecraft / "logs" / "launcher.log"
    try:
        folder.mkdir(parents=True, exist_ok=True)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        argfile = folder / "wi-mod-launch.txt"
        argfile.write_text("\n".join(_argfile_line(part) for part in command[1:]) + "\n", encoding="utf-8")
        flags = {}
        if os.name == "nt":
            flags["creationflags"] = 0x00000200 | 0x08000000
        else:
            flags["start_new_session"] = True
        with log_path.open("ab") as handle:
            handle.write(b"\n--- launch ---\n")
            process = subprocess.Popen(
                [command[0], f"@{argfile}"],
                cwd=str(minecraft),
                stdin=subprocess.DEVNULL,
                stdout=handle,
                stderr=subprocess.STDOUT,
                close_fds=True,
                **flags,
            )
    except OSError as exc:
        raise LauncherError("No pude arrancar Java.") from exc
    return process


def _argfile_line(arg: str) -> str:
    escaped = arg.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
