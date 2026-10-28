"""Protocolo nxm:// de Nexus (Mod Manager Download)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse, urlsplit, urlunsplit

from wi_mod import __version__
from wi_mod.nexus import NexusError, download_links, fetch_mod, request_json

_PATH = re.compile(r"^/mods/(\d+)/files/(\d+)/?$", re.IGNORECASE)


def parse_nxm(url: str) -> dict[str, Any] | None:
    raw = str(url or "").strip().strip('"')
    if not raw.lower().startswith("nxm:"):
        return None
    parsed = urlparse(raw)
    if parsed.scheme.lower() != "nxm" or not parsed.netloc:
        return None
    match = _PATH.match(parsed.path or "")
    if not match:
        return None
    query = parse_qs(parsed.query)
    return {
        "game": parsed.netloc.lower(),
        "mod_id": int(match.group(1)),
        "file_id": int(match.group(2)),
        "key": (query.get("key") or [""])[0],
        "expires": (query.get("expires") or [""])[0],
        "user_id": (query.get("user_id") or [""])[0],
    }


def nxm_links(api_key: str, parsed: dict[str, Any]) -> list[dict[str, Any]]:
    params = {}
    if parsed.get("key") and parsed.get("expires"):
        params["key"] = parsed["key"]
        params["expires"] = parsed["expires"]
        if parsed.get("user_id"):
            params["user_id"] = parsed["user_id"]
    query = f"?{urlencode(params)}" if params else ""
    game = parsed["game"]
    mod_id = parsed["mod_id"]
    file_id = parsed["file_id"]
    payload, _ = request_json(
        f"/games/{game}/mods/{mod_id}/files/{file_id}/download_link.json{query}",
        api_key,
    )
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("download_links", "links"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def ingest_nxm(app: Any, url: str) -> dict[str, Any]:
    parsed = parse_nxm(url)
    if not parsed:
        app.note("Enlace nxm no válido.", ok=False, reload=False)
        return {"ok": False, "error": "Enlace nxm no válido."}
    api_key = str(app.library.settings().get("apiKey") or "").strip()
    if not api_key:
        app.note("Agrega tu clave API de Nexus en Ajustes.", ok=False, reload=False)
        return {"ok": False, "error": "Agrega tu clave API de Nexus en Ajustes."}
    from wi_mod.mo2 import ask_target, find_mo2, handoff

    mo2 = find_mo2()
    if mo2:
        known = app.library.find_nexus(parsed["game"], parsed["mod_id"])
        label = str((known or {}).get("name") or "Esta descarga de Nexus")
        if ask_target(label) == "mo2":
            try:
                handoff(mo2, url)
            except OSError as exc:
                app.note(f"No pude abrir Mod Organizer 2: {exc}", ok=False, reload=False)
                return {"ok": False, "error": str(exc)}
            app.note(f"Enviado a Mod Organizer 2: {label}", ok=True, reload=False)
            return {"ok": True, "target": "mo2", "name": label}
    try:
        if parsed.get("key") and parsed.get("expires"):
            links = nxm_links(api_key, parsed)
        else:
            links = download_links(api_key, parsed["game"], parsed["mod_id"], parsed["file_id"])
    except NexusError as exc:
        app.note(str(exc), ok=False, reload=False)
        return {"ok": False, "error": str(exc)}
    uri = next((str(item.get("URI") or item.get("uri") or "") for item in links if item.get("URI") or item.get("uri")), "")
    if not uri.startswith("https://"):
        app.note("Nexus no dio enlace directo.", ok=False, reload=False)
        return {"ok": False, "error": "Nexus no dio enlace directo."}
    mod = app.library.find_nexus(parsed["game"], parsed["mod_id"])
    if not mod:
        try:
            remote = fetch_mod(api_key, parsed["game"], parsed["mod_id"], app.cache)
        except NexusError as exc:
            app.note(str(exc), ok=False, reload=False)
            return {"ok": False, "error": str(exc)}
        remote["primaryFileId"] = parsed["file_id"]
        mod = app.library.add(remote)
    label = str(mod.get("name") or _name_from_url(uri) or "Nexus")
    where = _present(app, mod)
    if where:
        if not _ask_replace(label, where):
            app.note(f"Ya estaba: {label}. No lo reemplacé.", ok=True, reload=False)
            notify_windows("Ya estaba", f"{label}. No lo reemplacé.")
            return {"ok": False, "reason": "kept", "name": label}
        notify_windows("Reemplazando", label)
    else:
        notify_windows("Descarga iniciada", label)
    mod_id = str(mod.get("id") or "")
    app.note(f"Descargando {label}", ok=True, reload=True, phase="download", mod_id=mod_id, name=label)
    dest = app.tmp / f"nxm-{uuid.uuid4().hex}"
    record = None
    file_name = ""
    try:
        saved_name = _save(uri, dest)
        file_name = saved_name or str(mod.get("primaryFileName") or "") or _name_from_url(uri)
        if where:
            _drop_old(app, mod)
        record = app.library.add_file(mod_id, file_name, dest)
    except Exception as exc:  # noqa: BLE001
        app.note(f"No pude bajar el archivo: {exc}", ok=False, reload=False, phase="fail", mod_id=mod_id, name=label)
        return {"ok": False, "error": str(exc)}
    finally:
        dest.unlink(missing_ok=True)
    if not record:
        app.note("No pude guardar el archivo de Nexus.", ok=False, reload=False, phase="fail", mod_id=mod_id, name=label)
        return {"ok": False, "error": "No pude guardar el archivo de Nexus."}
    label = str(mod.get("name") or file_name)
    app.note(f"Listo para instalar: {label}", ok=True, reload=True, phase="done", mod_id=mod_id, name=label)
    return {"ok": True, "modId": mod.get("id"), "name": label}


def _present(app: Any, mod: dict[str, Any]) -> str:
    files = [
        item for item in (mod.get("files") or [])
        if isinstance(item, dict) and str(item.get("storedAs") or "").strip()
    ]
    flags = {part for part in str(mod.get("status") or "").split("+") if part}
    if _in_game(app, str(mod.get("id") or "")) or (files and "in" in flags):
        return "en el juego"
    if files:
        return "descargado"
    return ""


def _in_game(app: Any, mod_id: str) -> bool:
    path = app.library.root / "deploy-links.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    links = data.get("links") if isinstance(data, dict) else None
    if not isinstance(links, dict):
        return False
    return any(isinstance(row, dict) and str(row.get("modId") or "") == mod_id for row in links.values())


def _ask_replace(name: str, where: str) -> bool:
    if sys.platform != "win32":
        return False
    import ctypes

    text = f"{name} ya está {where}.\n\n¿Quieres reemplazarlo?"
    flags = 0x4 | 0x20 | 0x1000 | 0x10000
    try:
        return int(ctypes.windll.user32.MessageBoxW(None, text, "wi-mod", flags)) == 6
    except OSError:
        return False


def _drop_old(app: Any, mod: dict[str, Any]) -> None:
    mod_id = str(mod.get("id") or "")
    if _in_game(app, mod_id):
        try:
            from wi_mod.deploy import undeploy_mod

            undeploy_mod(app.library, mod)
        except Exception:
            pass
    fresh = app.library.get(mod_id) or mod
    for item in list(fresh.get("files") or []):
        if isinstance(item, dict) and item.get("id"):
            app.library.remove_file(mod_id, str(item["id"]))


_TOAST_PS = r"""
$ErrorActionPreference = 'Stop'
$appId = 'wi-mod'
$shortcutPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\wi-mod.lnk'
$python = $env:WI_TOAST_PYTHON
$app = $env:WI_TOAST_APP
function Esc([string]$s) {
  if (-not $s) { return '' }
  return (($s -replace '&','&amp;') -replace '<','&lt;') -replace '>','&gt;'
}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
    uint GetCount(out uint cProps);
    uint GetAt(uint iProp, out PropertyKey pkey);
    uint GetValue(ref PropertyKey key, out PropVariant pv);
    uint SetValue(ref PropertyKey key, ref PropVariant pv);
    uint Commit();
}
[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PropertyKey { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit)]
public struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr pszVal; }
public static class Aumid {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHGetPropertyStoreFromParsingName(string path, IntPtr pbc, uint flags, ref Guid iid, out IPropertyStore store);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(string AppID);
    public static void Set(string shortcut, string appId) {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        int hr = SHGetPropertyStoreFromParsingName(shortcut, IntPtr.Zero, 2, ref iid, out store);
        if (hr != 0) throw new System.ComponentModel.Win32Exception(hr);
        PropertyKey key = new PropertyKey();
        key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.pid = 5;
        PropVariant pv = new PropVariant();
        pv.vt = 31;
        pv.pszVal = Marshal.StringToCoTaskMemUni(appId);
        hr = (int)store.SetValue(ref key, ref pv);
        if (hr != 0) throw new System.ComponentModel.Win32Exception(hr);
        hr = (int)store.Commit();
        if (hr != 0) throw new System.ComponentModel.Win32Exception(hr);
        Marshal.FreeCoTaskMem(pv.pszVal);
    }
}
"@
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = $python
if ($env:WI_TOAST_FROZEN -eq '1') { $sc.Arguments = '' } else { $sc.Arguments = '"' + $app + '"' }
$sc.WorkingDirectory = $env:WI_TOAST_CWD
$sc.Description = 'wi-mod'
$sc.WindowStyle = 7
$sc.Save()
[Aumid]::Set($shortcutPath, $appId)
[Aumid]::SetCurrentProcessExplicitAppUserModelID($appId) | Out-Null
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$title = Esc $env:WI_TOAST_TITLE
$body = Esc $env:WI_TOAST_BODY
$xml = "<toast><visual><binding template=`"ToastGeneric`"><text>$title</text><text>$body</text></binding></visual></toast>"
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
Start-Sleep -Seconds 2
"""


def notify_windows(title: str, body: str) -> None:
    """Aviso de Windows. Hace falta un acceso directo en el menú Inicio para que el sistema lo acepte."""
    if sys.platform != "win32":
        return
    try:
        script = Path(tempfile.gettempdir()) / "wi-mod-toast.ps1"
        script.write_text(_TOAST_PS, encoding="utf-8")
        env = os.environ.copy()
        env["WI_TOAST_TITLE"] = (title or "wi-mod")[:64]
        env["WI_TOAST_BODY"] = (body or "")[:180]
        env["WI_TOAST_PYTHON"] = sys.executable
        app = Path(__file__).resolve().parent.parent / "app.py"
        env["WI_TOAST_APP"] = str(app)
        env["WI_TOAST_CWD"] = str(Path(sys.executable).parent if getattr(sys, "frozen", False) else app.parent)
        env["WI_TOAST_FROZEN"] = "1" if getattr(sys, "frozen", False) else "0"
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
            ],
            creationflags=0x08000000,
            startupinfo=startup,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
        )
    except OSError:
        return


def _windowless_python() -> str:
    exe = Path(sys.executable)
    if exe.name.lower() == "python.exe":
        sibling = exe.with_name("pythonw.exe")
        if sibling.is_file():
            return str(sibling)
    return str(exe)


def register_protocol() -> None:
    """HKCU, sin admin. Nexus abre wi-mod con el enlace nxm://."""
    if sys.platform != "win32":
        return
    import winreg

    from wi_mod.mo2 import capture_nxm_handler

    capture_nxm_handler()
    if getattr(sys, "frozen", False):
        command = f'"{sys.executable}" "%1"'
    else:
        app = Path(__file__).resolve().parent.parent / "app.py"
        command = f'"{_windowless_python()}" "{app}" "%1"'
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\nxm") as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "URL:NXM Protocol")
            winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
            with winreg.CreateKey(key, r"shell\open\command") as command_key:
                winreg.SetValueEx(command_key, "", 0, winreg.REG_SZ, command)
    except OSError:
        return


def http_url(url: str) -> str:
    """Codifica espacios del nombre. urllib rechaza 'Optional Lux Resource pack …'."""
    parts = urlsplit(str(url or "").strip())
    path = quote(unquote(parts.path), safe="/")
    query = quote(unquote(parts.query), safe="=&")
    return urlunsplit((parts.scheme, parts.netloc, path, query, ""))


def _save(url: str, dest: Path) -> str:
    req = urllib.request.Request(
        http_url(url),
        headers={"User-Agent": f"wi-mod/{__version__}", "Accept": "*/*"},
        method="GET",
    )
    name = ""
    with urllib.request.urlopen(req, timeout=180) as res, dest.open("wb") as handle:
        header = res.headers.get("Content-Disposition") or ""
        match = re.search(r"filename\*?=(?:UTF-8''|\"?)([^\";]+)", header, re.IGNORECASE)
        if match:
            name = unquote(match.group(1)).strip().strip('"')
        while True:
            chunk = res.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    return Path(name).name


def _name_from_url(url: str) -> str:
    name = Path(unquote(urlparse(url).path)).name
    return name or "mod.zip"
