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
}

# Exes que no son el juego.
_SKIP_EXE = re.compile(
    r"(unins|setup|install|crash|report|update|launcher_data|vcredist|dxsetup|"
    r"redist|helper|service|overlay|cef|chrome|unitycrash|bugreport)",
    re.I,
)


def _tokens(name: str, domain: str = "") -> list[str]:
    raw = f"{name} {domain}".lower()
    bits = re.findall(r"[a-z0-9]{3,}", raw.replace("_", " "))
    # Dominios tipo skyrimspecialedition → trozos largos útiles
    extra: list[str] = []
    for known in ("skyrim", "fallout", "minecraft", "witcher", "cyberpunk", "elden", "stardew", "terraria"):
        if known in raw and known not in bits:
            extra.append(known)
    out: list[str] = []
    for bit in bits + extra:
        if bit not in out and bit not in {"the", "and", "for", "edition", "special", "game", "mods"}:
            out.append(bit)
    return out[:8] or ([domain.lower()] if domain else [])


def _score_name(text: str, tokens: list[str]) -> int:
    low = text.lower()
    if not tokens:
        return 0
    hits = sum(1 for t in tokens if t in low)
    if hits == 0:
        return 0
    score = hits * 10
    if all(t in low for t in tokens[:2]):
        score += 15
    joined = "".join(tokens)
    if joined and joined in low.replace(" ", "").replace("-", "").replace("_", ""):
        score += 25
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


def _steam_libraries() -> list[Path]:
    found: list[Path] = []
    candidates = [
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Steam" / "steamapps" / "libraryfolders.vdf",
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Steam" / "steamapps" / "libraryfolders.vdf",
    ]
    home = Path.home()
    candidates.append(home / "Steam" / "steamapps" / "libraryfolders.vdf")
    for vdf in candidates:
        if not vdf.is_file():
            continue
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
        r"C:\XboxGames",
        r"C:\Epic Games",
        r"C:\GOG Games",
        r"D:\GOG Games",
        r"C:\Program Files\Epic Games",
        r"C:\Program Files (x86)\Epic Games",
        r"C:\Program Files (x86)\GOG Galaxy\Games",
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
        for name in ("Games", "SteamLibrary", "Steam", "GOG Games", "Epic Games", "XboxGames"):
            path = drive / name
            try:
                if path.is_dir() and path not in roots:
                    roots.append(path)
            except OSError:
                continue
    return roots


def _safe_iter(path: Path):
    try:
        return path.iterdir()
    except OSError:
        return []


def _walk_limited(root: Path, *, max_depth: int, deadline: float, tokens: list[str]) -> list[tuple[int, Path]]:
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
                    if score >= 10:
                        hits.append((score + 5, entry))
                    if depth < max_depth:
                        stack.append((entry, depth + 1))
                elif entry.is_file() and low.endswith((".exe", ".bat", ".cmd")):
                    if _SKIP_EXE.search(low):
                        continue
                    score = _score_name(name, tokens)
                    if score >= 10:
                        hits.append((score + 20, entry))
            except OSError:
                continue
    return hits


def detect_game(game_name: str, game_domain: str = "", *, timeout: float = 22.0, limit: int = 12) -> list[dict[str, Any]]:
    """Busca carpetas/exes parecidos al nombre del juego. Devuelve candidatos ordenados."""
    tokens = _tokens(game_name, game_domain)
    if not tokens:
        return []
    deadline = time.monotonic() + max(4.0, timeout)
    scored: list[tuple[int, Path]] = []

    for root in _priority_roots():
        if time.monotonic() > deadline:
            break
        scored.extend(_walk_limited(root, max_depth=4, deadline=deadline, tokens=tokens))

    # Barrido amplio de discos (poco profundo) si aún no hay nada bueno.
    if not any(score >= 25 for score, _ in scored):
        for drive in _drives():
            if time.monotonic() > deadline:
                break
            for entry in _safe_iter(drive):
                try:
                    if not entry.is_dir():
                        continue
                    if entry.name.lower() in _SKIP_DIRS:
                        continue
                    # En raíz del disco solo bajamos a Program Files / Users / Games-like
                    low = entry.name.lower()
                    if low in {"program files", "program files (x86)", "users"} or "game" in low or "steam" in low:
                        scored.extend(_walk_limited(entry, max_depth=3, deadline=deadline, tokens=tokens))
                except OSError:
                    continue

    # Si el hit es carpeta, busca un .exe dentro (1 nivel + common)
    expanded: list[tuple[int, Path]] = []
    for score, path in scored:
        if path.is_file():
            expanded.append((score, path))
            continue
        best: tuple[int, Path] | None = None
        for child in _safe_iter(path):
            try:
                if child.is_file() and child.suffix.lower() == ".exe" and not _SKIP_EXE.search(child.name):
                    child_score = score + _score_name(child.name, tokens)
                    if best is None or child_score > best[0]:
                        best = (child_score, child)
            except OSError:
                continue
        if best:
            expanded.append(best)
        else:
            # carpeta sin exe visible: aún útil si el usuario elige después
            expanded.append((score, path))

    expanded.sort(key=lambda row: (-row[0], str(row[1]).lower()))
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for score, path in expanded:
        key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "path": str(path),
            "name": path.name,
            "score": score,
            "isFile": path.is_file(),
        })
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
        raise ValueError("Esa ruta es una carpeta. Elige el .exe del juego.")
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
