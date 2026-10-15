"""Clave de Steam Web API. Docs: https://steamcommunity.com/dev/apikey"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from wi_mod import __version__

API = "https://api.steampowered.com"


class SteamError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def validate_key(api_key: str) -> bool:
    key = str(api_key or "").strip()
    if not key:
        raise SteamError("Falta la clave de Steam.")
    url = f"{API}/ISteamWebAPIUtil/GetSupportedAPIList/v1/?{urllib.parse.urlencode({'key': key})}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"wi-mod/{__version__} (local library)", "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in {401, 403}:
            raise SteamError("La clave de Steam no sirve.", exc.code) from exc
        raise SteamError(f"Steam respondió {exc.code}.", exc.code) from exc
    except urllib.error.URLError as exc:
        raise SteamError("No se pudo hablar con Steam.") from exc
    except json.JSONDecodeError as exc:
        raise SteamError("Steam devolvió un JSON raro.") from exc
    if not isinstance(payload, dict):
        raise SteamError("Steam devolvió un JSON raro.")
    return True
