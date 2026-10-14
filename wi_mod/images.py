"""Descarga de la imagen principal, sin enviar la clave de Nexus."""

from __future__ import annotations

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
}


def download_picture(url: str, dest_without_ext: Path) -> Path | None:
    if not _public_https(url):
        return None
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "wi-mod/0.1.0", "Accept": "image/*"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            kind = (res.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            ext = _TYPES.get(kind)
            if not ext:
                return None
            dest = dest_without_ext.with_suffix(ext)
            dest.parent.mkdir(parents=True, exist_ok=True)
            size = 0
            with dest.open("wb") as handle:
                while True:
                    chunk = res.read(64 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > 8 * 1024 * 1024:
                        dest.unlink(missing_ok=True)
                        return None
                    handle.write(chunk)
            return dest
    except (OSError, urllib.error.URLError):
        return None


def _public_https(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname
    if host in {"localhost"} or host.endswith(".local"):
        return False
    try:
        infos = socket.getaddrinfo(host, 443)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True
