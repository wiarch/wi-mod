"""Lectura de multipart sin cargar el archivo entero en memoria."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import unquote


class Pushback:
    def __init__(self, raw, limit: int):
        self.raw = raw
        self.left = limit
        self.push = b""

    def read(self, size: int) -> bytes:
        if size <= 0:
            return b""
        if self.push:
            take = self.push[:size]
            self.push = self.push[size:]
            size -= len(take)
            if size <= 0:
                return take
            return take + self._raw(size)
        return self._raw(size)

    def readline(self) -> bytes:
        chunks = []
        while True:
            char = self.read(1)
            if not char:
                break
            chunks.append(char)
            if char == b"\n" or sum(len(part) for part in chunks) > 16384:
                break
        return b"".join(chunks)

    def unread(self, data: bytes) -> None:
        self.push = data + self.push

    def _raw(self, size: int) -> bytes:
        if self.left <= 0:
            return b""
        size = min(size, self.left)
        chunk = self.raw.read(size)
        self.left -= len(chunk)
        return chunk


def parse_multipart(raw, content_length: int, content_type: str, directory: Path) -> list[dict]:
    match = re.search(r'boundary="?([^";]+)"?', content_type or "")
    if not match:
        raise ValueError("Falta el boundary del formulario.")
    boundary = match.group(1).encode("utf-8", "replace")
    reader = Pushback(raw, content_length)
    marker = b"--" + boundary
    line = _until_boundary(reader, marker)
    parts: list[dict] = []
    while line is not None and not line.startswith(marker + b"--"):
        headers = _headers(reader)
        disposition = headers.get("content-disposition", "")
        name = _param(disposition, "name") or ""
        filename = _filename(disposition)
        if filename:
            directory.mkdir(parents=True, exist_ok=True)
            dest = directory / f"part-{len(parts)}-{_safe(filename)}"
            size = _write_until(reader, dest, boundary)
            parts.append({"name": name, "filename": filename, "path": dest, "size": size})
        else:
            text = _read_until(reader, boundary).decode("utf-8", "replace")
            parts.append({"name": name, "filename": None, "text": text, "size": len(text)})
        line = reader.readline()
        if line.startswith(marker + b"--"):
            break
        if not line:
            break
    return parts


def _until_boundary(reader: Pushback, marker: bytes) -> bytes | None:
    while True:
        line = reader.readline()
        if not line:
            return None
        stripped = line.rstrip(b"\r\n")
        if stripped.startswith(marker):
            return stripped


def _headers(reader: Pushback) -> dict[str, str]:
    raw = []
    while True:
        line = reader.readline()
        if line in (b"\r\n", b"\n", b""):
            break
        raw.append(line.decode("utf-8", "replace"))
    headers: dict[str, str] = {}
    for line in raw:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        headers[key.strip().lower()] = value.strip()
    return headers


def _write_until(reader: Pushback, dest: Path, boundary: bytes) -> int:
    token = b"\r\n--" + boundary
    buf = b""
    size = 0
    with dest.open("wb") as handle:
        while True:
            chunk = reader.read(64 * 1024)
            if not chunk:
                handle.write(buf)
                size += len(buf)
                return size
            buf += chunk
            index = buf.find(token)
            if index != -1:
                handle.write(buf[:index])
                size += index
                reader.unread(buf[index + 2 :])
                return size
            if len(buf) > len(token):
                cut = len(buf) - len(token)
                handle.write(buf[:cut])
                size += cut
                buf = buf[cut:]


def _read_until(reader: Pushback, boundary: bytes) -> bytes:
    token = b"\r\n--" + boundary
    buf = b""
    out = bytearray()
    while True:
        chunk = reader.read(64 * 1024)
        if not chunk:
            out.extend(buf)
            return bytes(out)
        buf += chunk
        index = buf.find(token)
        if index != -1:
            out.extend(buf[:index])
            reader.unread(buf[index + 2 :])
            return bytes(out)
        if len(buf) > len(token):
            cut = len(buf) - len(token)
            out.extend(buf[:cut])
            buf = buf[cut:]
        if len(out) > 1_000_000:
            raise ValueError("Campo de formulario demasiado grande.")


def _param(header: str, key: str) -> str | None:
    match = re.search(rf'{key}="([^"]*)"', header)
    if match:
        return match.group(1)
    match = re.search(rf"{key}=([^;]+)", header)
    if match:
        return match.group(1).strip()
    return None


def _filename(header: str) -> str | None:
    match = re.search(r"filename\*=UTF-8''([^;]+)", header, re.IGNORECASE)
    if match:
        return Path(unquote(match.group(1))).name
    name = _param(header, "filename")
    if not name:
        return None
    return Path(name).name


def _safe(name: str) -> str:
    cleaned = re.sub(r"[^\w.\- ()\[\]]+", "_", name, flags=re.UNICODE).strip(" .")
    return cleaned[:80] or "archivo"
