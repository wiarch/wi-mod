"""Traducción a español vía MyMemory (sin clave para uso personal)."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class TranslateError(Exception):
    pass


def translate_text(text: str, source: str = "en", target: str = "es") -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    if target.startswith("es") and _looks_spanish(raw):
        return raw
    langpair = f"{source}|{target}" if source and source != "auto" else f"en|{target}"
    chunks = _chunk(raw, 450)
    parts = [_translate_chunk(chunk, langpair) for chunk in chunks]
    return _join(parts, raw)


def _translate_chunk(text: str, langpair: str) -> str:
    query = urllib.parse.urlencode({"q": text, "langpair": langpair})
    req = urllib.request.Request(
        f"https://api.mymemory.translated.net/get?{query}",
        headers={"User-Agent": "wi-mod/0.1.0", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise TranslateError("El traductor no respondió. Intenta otra vez.") from exc
    except urllib.error.URLError as exc:
        raise TranslateError("Sin conexión para traducir.") from exc
    except json.JSONDecodeError as exc:
        raise TranslateError("Respuesta ilegible del traductor.") from exc
    return _extract(payload)


def _extract(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise TranslateError("No se pudo traducir ese texto.")
    data = payload.get("responseData")
    if isinstance(data, dict):
        translated = str(data.get("translatedText") or "").strip()
        upper = translated.upper()
        if translated and "MYMEMORY WARNING" not in upper and "INVALID EMAIL" not in upper:
            return urllib.parse.unquote_plus(translated)
        if "INVALID EMAIL" in upper or "MYMEMORY WARNING" in upper:
            raise TranslateError(translated)
    matches = payload.get("matches")
    if isinstance(matches, list):
        usable = [m for m in matches if isinstance(m, dict) and m.get("translation")]
        if usable:
            best = max(usable, key=lambda m: float(m.get("quality") or 0))
            return str(best["translation"]).strip()
    detail = payload.get("responseDetails")
    if detail:
        raise TranslateError(str(detail))
    raise TranslateError("No se pudo traducir ese texto.")


def _chunk(text: str, size: int) -> list[str]:
    if len(text) <= size:
        return [text]
    parts: list[str] = []
    rest = text
    while rest:
        if len(rest) <= size:
            parts.append(rest)
            break
        cut = rest.rfind(". ", 0, size)
        if cut < size // 3:
            cut = rest.rfind(" ", 0, size)
        if cut < size // 3:
            cut = size
        else:
            cut += 1
        parts.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    return [p for p in parts if p]


def _join(parts: list[str], original: str) -> str:
    if not parts:
        return original
    if len(parts) == 1:
        return parts[0]
    spacer = "\n" if "\n" in original else " "
    return spacer.join(parts)


def _looks_spanish(text: str) -> bool:
    sample = text.lower()
    markers = ("ción", "ñ", "qué", "también", " para ", " de la ", " los ", " las ", " una ")
    hits = sum(1 for marker in markers if marker in sample)
    english = len(re.findall(r"\b(the|and|with|from|this|that|which|reworking|focusing)\b", sample))
    return hits >= 2 and english == 0
