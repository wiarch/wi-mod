"""Caché local de imágenes http(s). Sin red se sirve el archivo ya guardado."""

from __future__ import annotations

import hashlib
import ipaddress
import socket
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}
_FROM_SUFFIX = {
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".png": ".png",
    ".webp": ".webp",
    ".gif": ".gif",
    ".ico": ".ico",
}
KIND = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
}
_MAX = 8 * 1024 * 1024
_KEYS = {"imageUrl", "logoUrl", "pictureUrl", "thumbnailUrl"}


def _folder(root: Path) -> Path:
    return root / "cache" / "img"


def _digest(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def _public(url: str) -> str:
    parsed = urlparse(url.strip())
    host = parsed.hostname or ""
    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("url")
    if host.lower() in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("url")
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as exc:
        raise ValueError("url") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError("url")
    return url.strip()


def lookup(root: Path, url: str) -> Path | None:
    folder = _folder(root)
    if not folder.is_dir():
        return None
    stem = _digest(url.strip())
    for path in folder.glob(stem + ".*"):
        if path.is_file() and path.suffix in KIND and path.stat().st_size > 0:
            return path
    return None


def fetch(root: Path, url: str) -> Path | None:
    text = str(url or "").strip()
    hit = lookup(root, text)
    if hit:
        return hit
    try:
        clean = _public(text)
    except ValueError:
        return None
    suffix = _FROM_SUFFIX.get(Path(urlparse(clean).path).suffix.lower(), "")
    req = urllib.request.Request(
        clean,
        headers={"User-Agent": "wi-mod", "Accept": "image/*"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as res:
            ctype = (res.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
            ext = _TYPES.get(ctype) or suffix
            if ext not in KIND:
                return None
            data = res.read(_MAX + 1)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return lookup(root, clean)
    if not data or len(data) > _MAX:
        return None
    folder = _folder(root)
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{_digest(clean)}{ext}"
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def _urls(value, found: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in _KEYS and isinstance(item, str) and item.startswith(("http://", "https://")):
                found.append(item)
            else:
                _urls(item, found)
    elif isinstance(value, list):
        for item in value:
            _urls(item, found)


def warm(root: Path, payload) -> None:
    found: list[str] = []
    _urls(payload, found)
    seen: set[str] = set()
    for url in found:
        if url in seen:
            continue
        seen.add(url)
        try:
            fetch(root, url)
        except OSError:
            continue
