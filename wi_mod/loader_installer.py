"""Instala Forge, Fabric, NeoForge o Quilt dentro de una instancia.

El instalador oficial de Forge y NeoForge se ejecuta en modo cliente
headless con --installClient apuntando solo a la .minecraft de la
instancia. APPDATA y user.home del proceso quedan en esa carpeta, así
que no se toca %APPDATA%/.minecraft ni ~/.minecraft.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

from wi_mod import __version__

FABRIC_META = "https://meta.fabricmc.net/v2/versions/loader"
QUILT_META = "https://meta.quiltmc.org/v3/versions/loader"
FABRIC_MAVEN = "https://maven.fabricmc.net/"
QUILT_MAVEN = "https://maven.quiltmc.org/repository/release/"
FORGE_MAVEN = "https://maven.minecraftforge.net/net/minecraftforge/forge"
NEOFORGE_MAVEN = "https://maven.neoforged.net/releases/net/neoforged/neoforge"
NEOFORGE_LEGACY = "https://maven.neoforged.net/releases/net/neoforged/forge"
META_LOADERS = {
    "fabric": (FABRIC_META, FABRIC_MAVEN),
    "quilt": (QUILT_META, QUILT_MAVEN),
}


class LoaderInstallError(Exception):
    """Fallo al instalar el modloader en la instancia."""


def install_loader(
    instance_path: Path,
    loader_type: str,
    loader_version: str,
    mc_version: str,
) -> Path:
    instance = Path(instance_path)
    loader = str(loader_type or "").strip().lower()
    build = str(loader_version or "").strip()
    game = str(mc_version or "").strip()
    if loader not in {"fabric", "quilt", "forge", "neoforge"}:
        raise LoaderInstallError("loader_type debe ser fabric, quilt, forge o neoforge.")
    if not build or not game:
        raise LoaderInstallError("Faltan la versión de Minecraft o del loader.")
    minecraft = instance / ".minecraft"
    if not minecraft.is_dir():
        raise LoaderInstallError("La instancia no tiene .minecraft.")
    if loader not in META_LOADERS:
        try:
            return _find_version(minecraft, loader, build, game)
        except LoaderInstallError:
            pass
    if loader in META_LOADERS:
        return _install_meta(minecraft, loader, build, game)
    return _install_jar(instance, minecraft, loader, build, game)


def _install_meta(minecraft: Path, loader: str, build: str, game: str) -> Path:
    meta, maven = META_LOADERS[loader]
    url = f"{meta}/{quote(game, safe='')}/{quote(build, safe='')}/profile/json"
    profile = _get_json(url)
    if not isinstance(profile, dict) or not str(profile.get("id") or "").strip():
        raise LoaderInstallError(f"{loader} no devolvió un perfil válido.")
    version_id = _version_name(str(profile["id"]))
    libraries = [row for row in profile.get("libraries") or [] if isinstance(row, dict)]
    profile["libraries"] = libraries
    version_json = minecraft / "versions" / version_id / f"{version_id}.json"
    _write_json(version_json, profile)
    _download_libraries(minecraft / "libraries", libraries, maven)
    return version_json


def find_java() -> str | None:
    found = shutil.which("java")
    if found:
        return found
    binary = "java.exe" if os.name == "nt" else "java"
    home = os.environ.get("JAVA_HOME", "").strip()
    if home:
        candidate = Path(home) / "bin" / binary
        if candidate.is_file():
            return str(candidate)
    bundled = _bundled_java(binary)
    if bundled:
        return bundled
    if os.name != "nt":
        linked = Path("/usr/bin/java")
        if linked.is_file():
            return str(linked)
        installed = sorted(Path("/usr/lib/jvm").glob("*/bin/java")) if Path("/usr/lib/jvm").is_dir() else []
        return str(installed[-1]) if installed else None
    return _windows_java(binary)


def _bundled_java(binary: str) -> str | None:
    roots = [
        Path(__file__).resolve().parents[1] / "java",
        Path(sys.executable).resolve().parent / "java",
    ]
    found: list[Path] = []
    for root in roots:
        if not root.is_dir():
            continue
        found.extend(path for path in root.glob("**/bin/" + binary) if path.is_file())
    if not found:
        return None
    found.sort(key=lambda path: path.as_posix().lower())
    return str(found[-1])


def find_java_binary(mc_version: str = "") -> str | None:
    """Busca javaw.exe (PATH, JAVA_HOME, runtimes de Minecraft). Nunca Minecraft.exe."""
    return find_javaw(mc_version)


def _minecraft_runtime_roots() -> list[Path]:
    roots: list[Path] = []
    local = os.environ.get("LOCALAPPDATA", "").strip()
    appdata = os.environ.get("APPDATA", "").strip()
    if local:
        base = Path(local)
        roots.append(base / "Packages" / "Microsoft.4297127D64EC6_8wekyb3d8bbwe" / "LocalCache" / "Local" / "runtime")
        roots.append(base / ".minecraft" / "runtime")
        roots.append(base / "Programs" / "Minecraft Launcher" / "runtime")
    if appdata:
        roots.append(Path(appdata) / ".minecraft" / "runtime")
    return roots


def find_javaw(mc_version: str = "") -> str | None:
    needed = _java_feature(mc_version) if str(mc_version or "").strip() else 0
    binary = "javaw.exe" if os.name == "nt" else "java"
    paths = _java_candidates(binary)
    if not paths:
        fallback = "java.exe" if os.name == "nt" else "java"
        paths = _java_candidates(fallback)
    ranked = [( _java_release_major(path) or 0, str(path)) for path in paths]
    if needed:
        exact = [item for item in ranked if item[0] == needed]
        if exact:
            return exact[-1][1]
        newer = sorted(item for item in ranked if item[0] > needed)
        if newer:
            return newer[0][1]
        return None
    ranked.sort()
    return ranked[-1][1] if ranked else None


def _java_candidates(binary: str) -> list[Path]:
    found: list[Path] = []
    which = shutil.which(binary)
    if which:
        found.append(Path(which))
    home = os.environ.get("JAVA_HOME", "").strip()
    if home:
        found.append(Path(home) / "bin" / binary)
    bundled = _bundled_java(binary)
    if bundled:
        found.append(Path(bundled))
    if os.name == "nt":
        for runtime in _minecraft_runtime_roots():
            if runtime.is_dir():
                found.extend(path for path in runtime.glob("**/bin/" + binary) if path.is_file())
        roots = [
            Path(os.environ.get("ProgramFiles", r"C:\Program Files")),
            Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")),
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs",
        ]
        patterns = (
            "Java/*/bin/" + binary,
            "Eclipse Adoptium/*/bin/" + binary,
            "Microsoft/*/bin/" + binary,
            "Amazon Corretto/*/bin/" + binary,
            "BellSoft/*/bin/" + binary,
            "Zulu/*/bin/" + binary,
            "Temurin/*/bin/" + binary,
        )
        for root in roots:
            if not root.is_dir():
                continue
            for pattern in patterns:
                found.extend(path for path in root.glob(pattern) if path.is_file())
    unique: list[Path] = []
    seen: set[str] = set()
    for path in found:
        if not path.is_file():
            continue
        key = str(path.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def _java_release_major(binary: Path) -> int | None:
    release = binary.parent.parent / "release"
    try:
        text = release.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    match = re.search(r'JAVA_VERSION="(\d+)', text)
    if not match:
        return None
    return int(match.group(1))


def install_java(dest_root: Path, mc_version: str = "") -> str:
    found = find_javaw(mc_version) if str(mc_version or "").strip() else find_java()
    if found:
        return found
    if os.name != "nt":
        raise LoaderInstallError("Instala Java y vuelve a crear el perfil.")
    feature = _java_feature(mc_version)
    dest_root.mkdir(parents=True, exist_ok=True)
    archive = dest_root / f"temurin-{feature}.zip"
    url = (
        "https://api.adoptium.net/v3/binary/latest/"
        f"{feature}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
    )
    _download(url, archive, timeout=300)
    try:
        java = _extract_jdk(archive, dest_root)
    finally:
        archive.unlink(missing_ok=True)
    return java


def _java_feature(mc_version: str) -> int:
    nums = [int(part) for part in re.findall(r"\d+", str(mc_version or ""))[:3]]
    if nums and nums[0] >= 26:
        return 25
    minor, patch = (nums + [0, 0, 0])[1:3]
    if minor > 20 or (minor == 20 and patch >= 5):
        return 21
    if minor >= 17:
        return 17
    return 8


def _extract_jdk(archive: Path, dest: Path) -> str:
    import zipfile

    top: set[str] = set()
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            parts = Path(info.filename).parts
            if not info.filename or info.filename.startswith("/") or ".." in parts:
                continue
            top.add(parts[0])
            bundle.extract(info, dest)
    binary = "java.exe" if os.name == "nt" else "java"
    hits: list[Path] = []
    for name in sorted(top):
        hits.extend(path for path in (dest / name).glob("bin/" + binary) if path.is_file())
    if not hits:
        hits = sorted(path for path in dest.glob("**/bin/" + binary) if path.is_file())
    if not hits:
        raise LoaderInstallError("El paquete de Java no trae el ejecutable.")
    java = hits[-1]
    home = java.parent.parent
    os.environ["JAVA_HOME"] = str(home)
    os.environ["PATH"] = str(home / "bin") + os.pathsep + os.environ.get("PATH", "")
    return str(java)


def _windows_java(binary: str) -> str | None:
    roots = [
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")),
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs",
    ]
    patterns = (
        "Java/*/bin/" + binary,
        "Eclipse Adoptium/*/bin/" + binary,
        "Microsoft/*/bin/" + binary,
        "Amazon Corretto/*/bin/" + binary,
        "BellSoft/*/bin/" + binary,
        "Zulu/*/bin/" + binary,
        "Temurin/*/bin/" + binary,
    )
    found: list[Path] = []
    for root in roots:
        if not root.is_dir():
            continue
        for pattern in patterns:
            found.extend(path for path in root.glob(pattern) if path.is_file())
    appdata = os.environ.get("APPDATA", "").strip()
    if not found and appdata:
        runtime = Path(appdata) / ".minecraft" / "runtime"
        if runtime.is_dir():
            found.extend(path for path in runtime.glob("**/bin/" + binary) if path.is_file())
    if not found:
        return None
    found.sort(key=lambda path: path.as_posix().lower())
    return str(found[-1])


def _install_jar(instance: Path, minecraft: Path, loader: str, build: str, game: str) -> Path:
    java = find_java()
    if not java:
        raise LoaderInstallError("No encuentro Java. Instálalo o agrega java.exe al PATH.")
    installer = _download_installer(minecraft, loader, build, game)
    work = minecraft / "tmp"
    try:
        work.mkdir(parents=True, exist_ok=True)
        profiles = minecraft / "launcher_profiles.json"
        if not profiles.exists():
            profiles.write_text("{}\n", encoding="utf-8")
    except OSError as exc:
        raise LoaderInstallError("No pude preparar la carpeta de la instancia.") from exc
    target = str(minecraft.resolve())
    command = [
        java,
        f"-Duser.home={instance.resolve()}",
        f"-Djava.io.tmpdir={work.resolve()}",
        "-Djava.awt.headless=true",
        "-jar",
        str(installer.resolve()),
        "--installClient",
        target,
    ]
    env = os.environ.copy()
    env["APPDATA"] = str(instance.resolve())
    env["HOME"] = str(instance.resolve())
    log_path = minecraft / "logs" / "loader-install.log"
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("wb") as log:
            result = subprocess.run(
                command,
                cwd=target,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                timeout=600,
                check=False,
            )
    except subprocess.TimeoutExpired as exc:
        raise LoaderInstallError("El instalador tardó demasiado.") from exc
    except OSError as exc:
        raise LoaderInstallError("No pude ejecutar el instalador.") from exc
    if result.returncode != 0:
        raise LoaderInstallError(f"El instalador de {loader} terminó con código {result.returncode}.")
    return _find_version(minecraft, loader, build, game)


def _download_installer(minecraft: Path, loader: str, build: str, game: str) -> Path:
    forge_build = build[len(game) + 1:] if build.startswith(f"{game}-") else build
    if loader == "forge":
        urls = [_forge_installer_url(game, forge_build)]
    else:
        urls = [
            _maven_jar(NEOFORGE_MAVEN, "neoforge", build),
            _maven_jar(NEOFORGE_LEGACY, "forge", f"{game}-{forge_build}"),
        ]
    dest = minecraft / "loaders" / f"{loader}-{forge_build}-installer.jar"
    last_error = "No existe el instalador de esa versión."
    for url in urls:
        try:
            _download(url, dest)
            return dest
        except LoaderInstallError as exc:
            last_error = str(exc)
    raise LoaderInstallError(last_error)


def _forge_installer_url(game: str, build: str) -> str:
    version = f"{game}-{build}"
    return _maven_jar(FORGE_MAVEN, "forge", version)


def _maven_jar(base: str, artifact: str, version: str) -> str:
    safe = quote(version, safe="")
    return f"{base}/{safe}/{artifact}-{safe}-installer.jar"


def _find_version(minecraft: Path, loader: str, build: str, game: str) -> Path:
    forge_build = build[len(game) + 1:] if build.startswith(f"{game}-") else build
    names = [
        f"{game}-forge-{forge_build}",
        f"{game}-neoforge-{forge_build}",
        f"neoforge-{build}",
        f"neoforge-{forge_build}",
    ]
    for name in names:
        path = minecraft / "versions" / name / f"{name}.json"
        if path.is_file():
            return path
    root = minecraft / "versions"
    try:
        matches = [
            path for path in root.glob("*/*.json")
            if forge_build in path.parent.name and loader in path.parent.name.lower()
        ]
    except OSError as exc:
        raise LoaderInstallError("No pude buscar la versión instalada.") from exc
    if len(matches) == 1:
        return matches[0]
    raise LoaderInstallError("El instalador no registró la versión dentro de la instancia.")


def _download_libraries(libraries_dir: Path, libraries: list[dict], maven: str) -> None:
    try:
        libraries_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise LoaderInstallError("No pude crear la carpeta de librerías.") from exc
    for library in libraries:
        if not _library_allowed(library):
            continue
        relative = _library_relative(library)
        if relative is None:
            continue
        dest = _inside(libraries_dir, libraries_dir / Path(relative))
        if dest.is_file() and dest.stat().st_size > 0:
            continue
        base = str(library.get("url") or maven)
        if not base.endswith("/"):
            base = f"{base}/"
        _download(f"{base}{relative}", dest)


def _library_relative(library: dict) -> str | None:
    downloads = library.get("downloads") if isinstance(library.get("downloads"), dict) else {}
    artifact = downloads.get("artifact") if isinstance(downloads.get("artifact"), dict) else {}
    relative = str(artifact.get("path") or "").replace("\\", "/").strip()
    if relative:
        return relative
    name = str(library.get("name") or "").strip()
    if not name:
        return None
    return _maven_path(name)


def _maven_path(name: str) -> str:
    parts = name.split(":")
    if len(parts) < 3:
        raise LoaderInstallError(f"Coordenada Maven no válida: {name}")
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


def _library_allowed(library: dict) -> bool:
    rules = library.get("rules")
    if not rules:
        return True
    allowed = False
    system = platform.system().lower()
    current = "osx" if system == "darwin" else system
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        wanted = (rule.get("os") or {}).get("name")
        if wanted and wanted != current:
            continue
        allowed = rule.get("action") == "allow"
    return allowed


def _version_name(version_id: str) -> str:
    name = version_id.strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise LoaderInstallError("El perfil trae un nombre de versión no válido.")
    return name


def _inside(root: Path, path: Path) -> Path:
    resolved = path.resolve()
    base = root.resolve()
    if resolved != base and base not in resolved.parents:
        raise LoaderInstallError("Una librería iba a guardarse fuera de la instancia.")
    return resolved


def _write_json(path: Path, payload: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise LoaderInstallError(f"No pude registrar la versión {path.parent.name}.") from exc


def _get_json(url: str) -> dict:
    status, payload = _read(url)
    if status in {400, 404}:
        raise LoaderInstallError("Esa versión no es compatible con el loader.")
    if status >= 400:
        raise LoaderInstallError(f"El metadato del loader respondió {status}.")
    try:
        data = json.loads(payload.decode("utf-8"))
    except ValueError as exc:
        raise LoaderInstallError("El metadato del loader no es JSON.") from exc
    if not isinstance(data, dict):
        raise LoaderInstallError("El metadato del loader no es un perfil.")
    return data


def _download(url: str, dest: Path, timeout: int = 60) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": f"wi-mod/{__version__}"})
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(request, timeout=timeout) as response, dest.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 64)
                if not chunk:
                    break
                handle.write(chunk)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise LoaderInstallError(f"No encuentro {dest.name}.") from exc
        raise LoaderInstallError(f"La descarga respondió {exc.code}.") from exc
    except urllib.error.URLError as exc:
        raise LoaderInstallError(f"No pude bajar {dest.name}.") from exc
    except OSError as exc:
        raise LoaderInstallError(f"No pude guardar {dest.name}.") from exc


def _read(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": f"wi-mod/{__version__}"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError as exc:
        raise LoaderInstallError("No hay conexión para instalar el loader.") from exc
