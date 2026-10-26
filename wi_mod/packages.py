"""Lista un .zip/.7z/.rar sin extraerlo y dice si es FOMOD o estándar.

.zip usa la librería estándar. .7z y .rar usan 7-Zip si está instalado
(`7z.exe l -slt`): solo nombres, no el contenido.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import zipfile
from pathlib import Path

_MARKERS = (".esp", ".esm", ".esl", ".bsa", ".ba2")
_FOLDERS = ("meshes/", "textures/", "interface/", "scripts/", "skse/", "sound/", "music/")


def _seven_zip() -> Path | None:
    roots = [Path(__file__).resolve().parent.parent / "tools" / "7zip"]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        roots.append(Path(local) / "wi-mod" / "7zip")
    for root in roots:
        for candidate in (root / "7z.exe", root / "Files" / "7-Zip" / "7z.exe"):
            if candidate.is_file():
                return candidate
    found = shutil.which("7z")
    if found:
        return Path(found)
    for env in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(env)
        if not base:
            continue
        candidate = Path(base) / "7-Zip" / "7z.exe"
        if candidate.is_file():
            return candidate
    return None


def _seven_zip_dir() -> Path:
    root = Path(__file__).resolve().parent.parent / "tools" / "7zip"
    if " " not in str(root):
        return root
    local = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(local) / "wi-mod" / "7zip"


def install_seven_zip() -> str:
    """Saca 7z.exe del MSI oficial. No pide admin."""
    found = _seven_zip()
    if found is not None:
        return str(found)
    dest = _seven_zip_dir()
    dest.mkdir(parents=True, exist_ok=True)
    work = dest / "_setup"
    if work.exists():
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir()
    msi = work / "7zip.msi"
    try:
        import urllib.request

        req = urllib.request.Request(
            "https://www.7-zip.org/a/7z2601-x64.msi",
            headers={"User-Agent": "wi-mod"},
        )
        with urllib.request.urlopen(req, timeout=180) as res, msi.open("wb") as handle:
            shutil.copyfileobj(res, handle)
        proc = subprocess.run(
            ["msiexec", "/a", str(msi), "/qn", f"TARGETDIR={work}"],
            check=False,
            timeout=180,
        )
        if proc.returncode not in (0, 3010):
            raise ValueError(f"msiexec {proc.returncode}")
        exe = next(work.rglob("7z.exe"), None)
        dll = next(work.rglob("7z.dll"), None)
        if exe is None or dll is None:
            raise ValueError("sin 7z.exe")
        shutil.copy2(exe, dest / "7z.exe")
        shutil.copy2(dll, dest / "7z.dll")
    except Exception as exc:
        raise ValueError("No pude instalar 7-Zip.") from exc
    finally:
        shutil.rmtree(work, ignore_errors=True)
    tool = dest / "7z.exe"
    if not tool.is_file():
        raise ValueError("7-Zip no quedó instalado.")
    return str(tool)


def _norm(name: str) -> str:
    return name.replace("\\", "/").lstrip("./")


def list_entries(archive: Path) -> list[str]:
    """Nombres internos. No abre el contenido de cada archivo."""
    suffix = archive.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(archive) as bundle:
            return [_norm(info.filename) for info in bundle.infolist() if not info.is_dir()]
    if suffix not in {".7z", ".rar"}:
        raise ValueError("El paquete tiene que ser .zip, .7z o .rar.")
    tool = _seven_zip()
    if tool is None:
        raise ValueError("Para .7z y .rar hace falta 7-Zip (7z.exe). El .zip no lo necesita.")
    proc = subprocess.run(
        [str(tool), "l", "-slt", "-ba", str(archive)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise ValueError(proc.stderr.strip() or "7-Zip no pudo leer el paquete.")
    names: list[str] = []
    folder = False
    path = ""
    for line in proc.stdout.splitlines():
        if line.startswith("Path = "):
            path = _norm(line[7:].strip())
            folder = False
        elif line.startswith("Folder = "):
            folder = line[9:].strip() in {"+", "true", "True"}
        elif line.strip() == "" and path:
            if path and not folder and path != archive.name:
                names.append(path)
            path = ""
            folder = False
    if path and not folder:
        names.append(path)
    return names


def classify(names: list[str]) -> dict[str, str]:
    """FOMOD si hay fomod/ModuleConfig.xml. Si no, raíz con esp/meshes/textures."""
    files = [_norm(name) for name in names if name and not name.endswith("/")]
    fomod = next((name for name in files if name.lower().endswith("fomod/moduleconfig.xml")), "")
    if fomod:
        root = fomod[: -len("ModuleConfig.xml")]
        cut = root.lower().rfind("fomod/")
        root = root[:cut] if cut >= 0 else ""
        return {"kind": "FOMOD", "root": root, "fomod": fomod}
    roots: set[str] = set()
    for name in files:
        low = name.lower()
        folder_at = next((low.find(folder) for folder in _FOLDERS if folder in low), -1)
        if folder_at >= 0:
            roots.add(name[:folder_at])
            continue
        if low.endswith(_MARKERS):
            slash = name.rfind("/")
            roots.add(f"{name[:slash]}/" if slash >= 0 else "")
    if not roots:
        raise ValueError("No parece un mod de Skyrim: no hay FOMOD, .esp ni meshes/textures.")
    root = "" if "" in roots else min(roots, key=len)
    return {"kind": "STANDARD", "root": root, "fomod": ""}


def read_member(archive: Path, member: str) -> bytes:
    wanted = _norm(member).lower()
    if archive.suffix.lower() == ".zip":
        with zipfile.ZipFile(archive) as bundle:
            match = next((info.filename for info in bundle.infolist() if _norm(info.filename).lower() == wanted), "")
            if not match:
                raise ValueError("Ese archivo no está en el paquete.")
            return bundle.read(match)
    tool = _seven_zip()
    if tool is None:
        raise ValueError("Para leer dentro de .7z/.rar hace falta 7-Zip.")
    proc = subprocess.run(
        [str(tool), "e", "-so", str(archive), member.replace("\\", "/")],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise ValueError("No se pudo leer el archivo dentro del paquete.")
    return proc.stdout
