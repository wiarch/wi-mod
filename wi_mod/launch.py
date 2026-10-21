"""Detectar y lanzar el ejecutable de un juego en Windows."""

from __future__ import annotations

import os
import re
import string
import subprocess
import time
from pathlib import Path
from typing import Any

# Carpetas del sistema / basura: no entrar.
_SKIP_DIRS = {
    "windows",
    "windows.old",
    "$recycle.bin",
    "system volume information",
    "recovery",
    "boot",
    "efi",
    "perflogs",
    "msocache",
    "intel",
    "amd",
    "nvidia corporation",
    "config.msi",
    "documents and settings",
    "programdata",
    "temp",
    "tmp",
    "cache",
    "node_modules",
    ".git",
    "appdata",
    "winsxs",
    "system32",
    "syswow64",
    "sendto",
    "cookies",
    "nethood",
    "printhood",
    "recent",
}

# Exes que no son el juego.
_SKIP_EXE = re.compile(
    r"(unins|setup|install|crash|report|update|launcher_data|vcredist|dxsetup|"
    r"redist|helper|service|overlay|cef|chrome|unitycrash|bugreport|dotnet|"
    r"vc_redist|directx|prune|crashhandler|errorreporter|"
    r"^minecraft(launcher)?\.exe$|^javaw?\.exe$)",
    re.I,
)

# Launcher oficial de Mojang: nunca se abre desde wi-mod.
_MOJANG_LAUNCHER = re.compile(r"^minecraft(launcher)?\.exe$", re.I)

_KNOWN = (
    "skyrim", "fallout", "oblivion", "starfield", "witcher", "cyberpunk",
    "elden", "stardew", "terraria", "minecraft", "valheim", "hollow",
    "hades", "doom", "wolfenstein", "dishonored", "prey", "outer",
    "baldur", "divinity", "bg3", "gta", "rdr2", "sekiro", "souls",
)

# Nombres típicos de .exe cuando solo tenemos la carpeta del juego.
_EXE_HINTS = (
    "skyrimse.exe", "skyrimvr.exe", "tesv.exe", "skyrim.exe",
    "fallout4.exe", "falloutnv.exe", "fallout3.exe", "fo4.exe",
    "oblivion.exe", "starfield.exe",
    "witcher3.exe", "cyberpunk2077.exe", "eldenring.exe",
    "stardew valley.exe", "stardewvalley.exe", "terraria.exe",
    "valheim.exe",
)


def _tokens(name: str, domain: str = "") -> list[str]:
    raw = f"{name} {domain}".lower()
    bits = re.findall(r"[a-z0-9]{3,}", raw.replace("_", " "))
    extra: list[str] = []
    for known in _KNOWN:
        if known in raw and known not in bits:
            extra.append(known)
        for bit in bits:
            if known in bit and known not in bits and known not in extra:
                extra.append(known)
    out: list[str] = []
    for bit in bits + extra:
        if bit not in out and bit not in {"the", "and", "for", "edition", "special", "game", "mods", "softworks"}:
            out.append(bit)
    return out[:10] or ([domain.lower()] if domain else [])


def _score_name(text: str, tokens: list[str]) -> int:
    low = text.lower()
    compact = re.sub(r"[^a-z0-9]+", "", low)
    if not tokens:
        return 0
    hits = sum(1 for t in tokens if t in low or t in compact)
    if hits == 0:
        return 0
    score = hits * 10
    if all(t in low or t in compact for t in tokens[:2]):
        score += 15
    joined = "".join(tokens)
    if joined and joined in compact:
        score += 25
    if low.endswith(".exe") and tokens and any(t in compact for t in tokens[:3]):
        score += 12
    return score


def _drives() -> list[Path]:
    roots: list[Path] = []
    for letter in string.ascii_uppercase:
        root = Path(f"{letter}:/")
        try:
            if root.exists():
                roots.append(root)
        except OSError:
            continue
    return roots


def _safe_iter(path: Path) -> list[Path]:
    """Lista entradas; materializa para atrapar PermissionError al leer."""
    try:
        return list(path.iterdir())
    except OSError:
        return []


def _steam_libraries() -> list[Path]:
    found: list[Path] = []
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Steam" / "steamapps" / "libraryfolders.vdf",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Steam" / "steamapps" / "libraryfolders.vdf",
    ]
    home = Path.home()
    candidates.append(home / "Steam" / "steamapps" / "libraryfolders.vdf")
    for drive in _drives():
        candidates.append(drive / "Program Files (x86)" / "Steam" / "steamapps" / "libraryfolders.vdf")
        candidates.append(drive / "Program Files" / "Steam" / "steamapps" / "libraryfolders.vdf")
        candidates.append(drive / "Steam" / "steamapps" / "libraryfolders.vdf")
        candidates.append(drive / "SteamLibrary" / "steamapps" / "libraryfolders.vdf")
        candidates.append(drive / "Juegos" / "SteamLibrary" / "steamapps" / "libraryfolders.vdf")
    seen_vdf: set[str] = set()
    for vdf in candidates:
        key = str(vdf).lower()
        if key in seen_vdf or not vdf.is_file():
            continue
        seen_vdf.add(key)
        try:
            text = vdf.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for match in re.finditer(r'"path"\s+"([^"]+)"', text):
            base = Path(match.group(1).replace("\\\\", "\\")) / "steamapps" / "common"
            if base.is_dir() and base not in found:
                found.append(base)
        local = vdf.parent / "common"
        if local.is_dir() and local not in found:
            found.append(local)
    # Rutas fijas por si el VDF falla
    for drive in _drives():
        for rel in (
            Path("Program Files (x86)") / "Steam" / "steamapps" / "common",
            Path("Program Files") / "Steam" / "steamapps" / "common",
            Path("SteamLibrary") / "steamapps" / "common",
            Path("Steam") / "steamapps" / "common",
            Path("Juegos") / "SteamLibrary" / "steamapps" / "common",
        ):
            base = drive / rel
            try:
                if base.is_dir() and base not in found:
                    found.append(base)
            except OSError:
                continue
    return found


def _priority_roots() -> list[Path]:
    roots: list[Path] = []
    roots.extend(_steam_libraries())
    env_paths = [
        os.environ.get("PROGRAMFILES", r"C:\Program Files"),
        os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
        str(Path.home()),
        str(Path.home() / "Games"),
        str(Path.home() / "Desktop"),
        r"C:\Games",
        r"D:\Games",
        r"E:\Games",
        r"F:\Games",
        r"D:\Juegos",
        r"E:\Juegos",
        r"C:\XboxGames",
        r"C:\Epic Games",
        r"C:\GOG Games",
        r"D:\GOG Games",
        r"C:\Program Files\Epic Games",
        r"C:\Program Files (x86)\Epic Games",
        r"C:\Program Files (x86)\GOG Galaxy\Games",
        r"C:\Program Files (x86)\Bethesda Softworks",
        r"C:\Program Files\Bethesda Softworks",
    ]
    for raw in env_paths:
        if not raw:
            continue
        path = Path(raw)
        try:
            if path.is_dir() and path not in roots:
                roots.append(path)
        except OSError:
            continue
    for drive in _drives():
        for name in (
            "Games", "Juegos", "SteamLibrary", "Steam", "GOG Games", "Epic Games",
            "XboxGames", "Bethesda Softworks", "Bethesda",
        ):
            path = drive / name
            try:
                if path.is_dir() and path not in roots:
                    roots.append(path)
            except OSError:
                continue
    return roots


def _walk_limited(root: Path, *, max_depth: int, deadline: float, tokens: list[str], min_score: int = 8) -> list[tuple[int, Path]]:
    hits: list[tuple[int, Path]] = []
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        if time.monotonic() > deadline:
            break
        current, depth = stack.pop()
        for entry in _safe_iter(current):
            if time.monotonic() > deadline:
                break
            name = entry.name
            low = name.lower()
            try:
                if entry.is_dir():
                    if low in _SKIP_DIRS or low.startswith("."):
                        continue
                    score = _score_name(name, tokens)
                    if score >= min_score:
                        hits.append((score + 5, entry))
                    next_depth = max_depth + (1 if score >= 10 else 0)
                    if depth < next_depth:
                        stack.append((entry, depth + 1))
                elif entry.is_file() and low.endswith((".exe", ".bat", ".cmd")):
                    if _SKIP_EXE.search(low):
                        continue
                    score = _score_name(name, tokens)
                    if score >= min_score:
                        hits.append((score + 20, entry))
            except OSError:
                continue
    return hits


def _looks_like_install_dir(path: Path) -> bool:
    low = str(path).lower().replace("/", "\\")
    return "\\steamapps\\common\\" in low or "\\gog games\\" in low or "\\epic games\\" in low


def _resolve_exe(folder: Path, tokens: list[str] | None = None) -> Path | None:
    """Dentro de la carpeta del juego, elige el .exe jugable (no el launcher)."""
    best: tuple[int, Path] | None = None
    tokens = tokens or []
    for child in _safe_iter(folder):
        try:
            if not child.is_file() or child.suffix.lower() != ".exe":
                continue
            if _SKIP_EXE.search(child.name):
                continue
            low = child.name.lower()
            score = _score_name(child.name, tokens) if tokens else 0
            if low in _EXE_HINTS:
                score += 50
            # Preferir el juego real frente a *Launcher.exe
            if re.search(r"launcher", low):
                score -= 25
            if best is None or score > best[0]:
                best = (score, child)
        except OSError:
            continue
    if best and best[0] > 0:
        return best[1]
    for hint in _EXE_HINTS:
        candidate = folder / hint
        if candidate.is_file():
            return candidate
    return best[1] if best else None


def _norm_key(path: Path | str) -> str:
    return str(path).lower().replace("/", "\\").rstrip("\\")


def _is_under(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except (OSError, ValueError):
        return False


def _hit(path: Path, score: int) -> dict[str, Any]:
    return {
        "path": str(path),
        "name": path.name,
        "score": score,
        "isFile": path.is_file(),
        "kind": "file" if path.is_file() else "folder",
    }


def detect_game(game_name: str, game_domain: str = "", *, timeout: float = 45.0, limit: int = 16) -> list[dict[str, Any]]:
    """Busca la carpeta de instalación del juego (con .exe dentro), no un ejemplo fijo."""
    tokens = _tokens(game_name, game_domain)
    if not tokens:
        return []
    deadline = time.monotonic() + max(8.0, timeout)
    scored: list[tuple[int, Path]] = []

    # 1) steamapps/common: carpeta del juego + .exe real → respuesta definitiva
    steam_hits: list[tuple[int, Path]] = []
    for common in _steam_libraries():
        if time.monotonic() > deadline:
            break
        for entry in _safe_iter(common):
            try:
                if not entry.is_dir():
                    continue
                score = _score_name(entry.name, tokens)
                if score < 8:
                    continue
                exe = _resolve_exe(entry, tokens)
                # Carpeta Steam con ejecutable = instalación real
                total = score + 50 + (40 if exe else 0)
                steam_hits.append((total, entry))
                scored.append((total, entry))
            except OSError:
                continue

    steam_hits.sort(key=lambda row: (-row[0], str(row[1]).lower()))
    if steam_hits and steam_hits[0][0] >= 60 and _resolve_exe(steam_hits[0][1], tokens):
        best_score, best_path = steam_hits[0]
        # Una sola carpeta clara: no ensuciar con subcarpetas ni launchers
        return [_hit(best_path, best_score)]

    # 2) Otras raíces habituales (si Steam no dio match fuerte)
    for root in _priority_roots():
        if time.monotonic() > deadline:
            break
        if root.name.lower() == "common" and "steamapps" in str(root).lower():
            continue
        scored.extend(_walk_limited(root, max_depth=3, deadline=deadline, tokens=tokens))

    # 3) Barrido amplio solo si aún no hay carpeta clara
    if not any(score >= 40 and path.is_dir() for score, path in scored):
        for drive in _drives():
            if time.monotonic() > deadline:
                break
            for entry in _safe_iter(drive):
                if time.monotonic() > deadline:
                    break
                try:
                    if not entry.is_dir():
                        continue
                    low = entry.name.lower()
                    if low in _SKIP_DIRS:
                        continue
                    scored.extend(_walk_limited(entry, max_depth=3, deadline=deadline, tokens=tokens, min_score=10))
                except OSError:
                    continue

    # Preferir carpetas de instalación con .exe; no listar hijos ni launchers sueltos
    expanded: list[tuple[int, Path]] = []
    for score, path in scored:
        try:
            if path.is_file():
                if re.search(r"launcher", path.name, re.I):
                    continue
                expanded.append((score, path))
                continue
            if not path.is_dir():
                continue
            exe = _resolve_exe(path, tokens)
            bonus = 0
            if _looks_like_install_dir(path):
                bonus += 20
            if exe:
                bonus += 30
            elif _looks_like_install_dir(path):
                # Carpeta Steam/GOG sin .exe jugable: casi seguro basura (p. ej. subcarpeta)
                bonus -= 15
            else:
                # Carpeta genérica sin ejecutable: baja prioridad
                bonus -= 10
            expanded.append((score + bonus, path))
        except OSError:
            continue

    expanded.sort(key=lambda row: (-row[0], 0 if row[1].is_dir() else 1, str(row[1]).lower()))
    seen: set[str] = set()
    kept_dirs: list[Path] = []
    out: list[dict[str, Any]] = []
    for score, path in expanded:
        key = _norm_key(path)
        if key in seen:
            continue
        if "\\mods\\" in key or "mod.organizer" in key or "\\my games\\" in key:
            score -= 30
            if score < 15:
                continue
        # No devolver subcarpetas dentro de una instalación ya elegida
        if any(_is_under(path, parent) for parent in kept_dirs):
            continue
        # No devolver .exe si ya tenemos su carpeta padre
        if path.is_file() and any(_is_under(path, parent) for parent in kept_dirs):
            continue
        seen.add(key)
        if path.is_dir():
            kept_dirs.append(path)
        out.append(_hit(path, score))
        # Si el primero es carpeta fuerte con .exe, basta
        if len(out) == 1 and path.is_dir() and score >= 70 and _resolve_exe(path, tokens):
            break
        if len(out) >= limit:
            break
    return out


def launch_path(path: str) -> None:
    target = str(path or "").strip()
    if not target:
        raise ValueError("No hay ruta de lanzador.")
    if target.lower().startswith("steam://"):
        os.startfile(target)  # type: ignore[attr-defined]
        return
    file = Path(target)
    if not file.exists():
        raise ValueError("El lanzador ya no está en esa ruta.")
    if file.is_dir():
        exe = _resolve_exe(file)
        if exe is None:
            raise ValueError("Esa carpeta no tiene un .exe jugable. Elige el ejecutable o otra carpeta del juego.")
        file = exe
    if _MOJANG_LAUNCHER.match(file.name):
        raise ValueError("No abro el launcher de Mojang. Elige una instancia de wi-mod.")
    cwd = str(file.parent)
    try:
        os.startfile(str(file))  # type: ignore[attr-defined]
    except AttributeError:
        subprocess.Popen([str(file)], cwd=cwd, close_fds=True)
    except OSError as exc:
        raise ValueError(f"No se pudo abrir: {exc}") from exc


def steam_run_url(steam_app_id: int | str | None) -> str:
    try:
        app_id = int(steam_app_id or 0)
    except (TypeError, ValueError):
        return ""
    return f"steam://run/{app_id}" if app_id > 0 else ""
