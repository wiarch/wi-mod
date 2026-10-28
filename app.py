"""Arranque de wi-mod."""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

from wi_mod.server import ROOT, App, make_server

_quitting = False
_tray = None
_app = None
_url = ""
_mark = None


def main() -> None:
    try:
        _run()
    except Exception as exc:  # noqa: BLE001
        _report(exc)


def _run() -> None:
    if "--restart-wait" in sys.argv:
        time.sleep(1.2)
    pending = _nxm_arg()
    if pending and _forward_nxm(pending):
        return
    app = App(ROOT / "data")
    server = _listen(app)
    thread = threading.Thread(target=server.serve_forever, name="wi-mod")
    thread.start()
    host, port = server.server_address
    try:
        (ROOT / "data" / "port").write_text(str(port), encoding="ascii")
    except OSError:
        pass
    if pending:
        threading.Thread(target=lambda: _ingest_nxm(app, pending), name="wi-mod-nxm", daemon=True).start()
    try:
        from wi_mod.nxm import register_protocol

        register_protocol()
    except Exception:
        pass
    url = f"http://{host}:{port}/"
    try:
        _open(url, app)
    except KeyboardInterrupt:
        pass
    finally:
        _drop_tray()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def _nxm_arg() -> str:
    for arg in sys.argv[1:]:
        text = str(arg).strip().strip('"')
        if text.lower().startswith("nxm:"):
            return text
    return ""


def _forward_nxm(url: str) -> bool:
    port = 47621
    try:
        port = int((ROOT / "data" / "port").read_text(encoding="ascii").strip())
    except (OSError, ValueError):
        pass
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/nxm",
        data=json.dumps({"url": url}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            return 200 <= int(res.status) < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _ingest_nxm(app: App, url: str) -> None:
    from wi_mod.nxm import ingest_nxm

    try:
        ingest_nxm(app, url)
    except Exception as exc:  # noqa: BLE001
        app.note(str(exc), ok=False, reload=False)


def _listen(app: App):
    try:
        return make_server(app, 47621)
    except OSError:
        return make_server(app, 0)


class _Host:
    def __init__(self, holder: dict):
        self.holder = holder

    def quit(self) -> None:
        _quit(self.holder.get("window"))

    def tray(self) -> None:
        window = self.holder.get("window")
        if window is None:
            return
        _ensure_tray(window)
        _hide_window(window)

    def win_min(self) -> None:
        window = self.holder.get("window")
        if window is not None:
            window.minimize()

    def win_max(self) -> None:
        window = self.holder.get("window")
        if window is None:
            return
        native = getattr(window, "native", None)
        if native is None:
            window.maximize()
            return

        def toggle():
            from System.Windows.Forms import FormWindowState

            native.WindowState = FormWindowState.Normal
            if _fills_work(native) and self.holder.get("box") is not None:
                _restore_box(native, self.holder["box"])
                return
            self.holder["box"] = native.Bounds
            _fill_work(native)

        try:
            from System import Func, Type

            if native.InvokeRequired:
                native.Invoke(Func[Type](toggle))
                return
        except Exception:
            pass
        toggle()

    def win_close(self) -> None:
        window = self.holder.get("window")
        if window is None:
            return
        _ensure_tray(window)
        _hide_window(window)

    def win_restart(self) -> None:
        window = self.holder.get("window")
        _spawn_restart()
        _quit(window)

    def site(self) -> None:
        webbrowser.open("https://wiarch.github.io/wi-mod/")

    def pick_exe(self) -> str:
        window = self.holder.get("window")
        if window is None:
            return ""
        try:
            import webview
        except ImportError:
            return ""
        dialog = getattr(webview, "FileDialog", None)
        kind = getattr(dialog, "OPEN", None) if dialog is not None else None
        if kind is None:
            kind = getattr(webview, "OPEN_DIALOG", 10)
        try:
            picked = window.create_file_dialog(
                kind,
                allow_multiple=False,
                file_types=("Ejecutable (*.exe;*.bat;*.cmd)", "Todos (*.*)"),
            )
        except Exception:
            return ""
        if not picked:
            return ""
        if isinstance(picked, (list, tuple)):
            return str(picked[0] or "")
        return str(picked)

    def pick_folder(self) -> str:
        window = self.holder.get("window")
        # 1) Diálogo nativo de pywebview
        if window is not None:
            try:
                import webview
                dialog = getattr(webview, "FileDialog", None)
                kind = getattr(dialog, "FOLDER", None) if dialog is not None else None
                if kind is None:
                    kind = getattr(webview, "FOLDER_DIALOG", 20)
                picked = window.create_file_dialog(kind, allow_multiple=False)
                if picked:
                    if isinstance(picked, (list, tuple)):
                        return str(picked[0] or "")
                    return str(picked)
            except Exception:
                pass
        # 2) Fallback Windows: selector de carpetas del sistema
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            chosen = filedialog.askdirectory(title="Carpeta del juego", mustexist=True)
            root.destroy()
            return str(chosen or "")
        except Exception:
            return ""

    def packs_dir(self) -> str:
        """Carpeta por defecto de export/import (la crea si falta)."""
        if _app is not None:
            try:
                _app.packs.mkdir(parents=True, exist_ok=True)
                return str(_app.packs)
            except OSError:
                pass
        from pathlib import Path
        from wi_mod.server import packs_dir

        folder = packs_dir(ROOT / "data")
        return str(folder)

    def pick_save(self, filename: str = "wi-mod.zip") -> str:
        """Diálogo Guardar como; arranca en Documents\\wi-mod\\packs."""
        name = str(filename or "wi-mod.zip").strip() or "wi-mod.zip"
        if not name.lower().endswith(".zip"):
            name = f"{name}.zip"
        start = self.packs_dir()
        window = self.holder.get("window")
        if window is not None:
            try:
                import webview
                dialog = getattr(webview, "FileDialog", None)
                kind = getattr(dialog, "SAVE", None) if dialog is not None else None
                if kind is None:
                    kind = getattr(webview, "SAVE_DIALOG", 30)
                picked = window.create_file_dialog(
                    kind,
                    directory=start,
                    allow_multiple=False,
                    save_filename=name,
                    file_types=("ZIP (*.zip)", "Todos (*.*)"),
                )
                if picked:
                    if isinstance(picked, (list, tuple)):
                        return str(picked[0] or "")
                    return str(picked)
            except Exception:
                pass
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            chosen = filedialog.asksaveasfilename(
                title="Guardar paquete",
                defaultextension=".zip",
                initialdir=start,
                initialfile=name,
                filetypes=[("ZIP", "*.zip"), ("Todos", "*.*")],
            )
            root.destroy()
            return str(chosen or "")
        except Exception:
            return ""

    def pick_zip(self) -> str:
        """Abrir .zip; arranca en Documents\\wi-mod\\packs."""
        start = self.packs_dir()
        window = self.holder.get("window")
        if window is not None:
            try:
                import webview
                dialog = getattr(webview, "FileDialog", None)
                kind = getattr(dialog, "OPEN", None) if dialog is not None else None
                if kind is None:
                    kind = getattr(webview, "OPEN_DIALOG", 10)
                picked = window.create_file_dialog(
                    kind,
                    directory=start,
                    allow_multiple=False,
                    file_types=("ZIP (*.zip)", "Todos (*.*)"),
                )
                if picked:
                    if isinstance(picked, (list, tuple)):
                        return str(picked[0] or "")
                    return str(picked)
            except Exception:
                pass
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            chosen = filedialog.askopenfilename(
                title="Importar paquete",
                initialdir=start,
                filetypes=[("ZIP", "*.zip"), ("Todos", "*.*")],
            )
            root.destroy()
            return str(chosen or "")
        except Exception:
            return ""


def _open(url: str, app: App) -> None:
    global _app, _url
    _app = app
    _url = url
    _own_taskbar()
    try:
        import webview
    except ImportError:
        webview = None
    if webview is not None:
        try:
            holder: dict = {}
            window = webview.create_window(
                "wi-mod",
                url,
                width=1280,
                height=840,
                min_size=(980, 640),
                resizable=True,
                maximized=False,
                frameless=True,
                easy_drag=False,
                text_select=True,
                background_color="#0c0b0a",
                js_api=_Host(holder),
            )
            holder["window"] = window
            holder["max"] = True

            def on_closing():
                if _quitting:
                    _drop_tray()
                    return None
                _ensure_tray(window)
                _hide_window(window)
                return False

            def on_shown():
                _apply_window_icon()
                _no_browser_keys(window)
                _open_maximized(window, holder)
                _ensure_tray(window)

            window.events.closing += on_closing
            window.events.shown += on_shown
            webview.start(private_mode=False, storage_path=str(ROOT / "data" / "webview"))
            return
        except Exception as exc:  # noqa: BLE001
            print(f"Ventana nativa no disponible ({exc}). Abro el navegador.")
    webbrowser.open(url)
    threading.Event().wait()


def _fills_work(native) -> bool:
    from System.Windows.Forms import Screen

    area = Screen.FromHandle(native.Handle).WorkingArea
    bounds = native.Bounds
    return abs(bounds.Width - area.Width) < 12 and abs(bounds.Height - area.Height) < 12


def _fill_work(native) -> None:
    """Ocupa el área de trabajo, sin marco. La barra de tareas queda fuera."""
    from System.Drawing import Rectangle
    from System.Windows.Forms import FormBorderStyle, Screen

    native.FormBorderStyle = getattr(FormBorderStyle, "None")
    area = Screen.FromHandle(native.Handle).WorkingArea
    native.Bounds = Rectangle(area.X, area.Y, area.Width, area.Height)
    _no_color_border(native)
    _hook_snap(native)


def _restore_box(native, box) -> None:
    from System.Windows.Forms import FormBorderStyle

    native.FormBorderStyle = getattr(FormBorderStyle, "None")
    native.Bounds = box
    _chrome(native)


def _no_color_border(native) -> None:
    import ctypes

    hwnd = int(native.Handle.ToInt32())

    class _Margins(ctypes.Structure):
        _fields_ = (
            ("cxLeftWidth", ctypes.c_int),
            ("cxRightWidth", ctypes.c_int),
            ("cyTopHeight", ctypes.c_int),
            ("cyBottomHeight", ctypes.c_int),
        )

    ctypes.windll.dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(_Margins(0, 0, 0, 0)))
    none = ctypes.c_int(0xFFFFFFFE)
    caption = ctypes.c_int(0x000A0B0C)
    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 34, ctypes.byref(none), 4)
    ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 35, ctypes.byref(caption), 4)


_FRAME_HOOKS: dict = {}


def _hook_snap(native) -> None:
    """Marco grueso para Aero Snap, sin la barra de acento. El arrastre sigue en la titlebar."""
    try:
        handle = native.Handle
        key = int(handle.ToInt64()) if hasattr(handle, "ToInt64") else int(handle.ToInt32())
    except Exception:
        return
    if key in _FRAME_HOOKS:
        return
    from System import IntPtr
    from System.Windows.Forms import NativeWindow

    class _Hook(NativeWindow):
        def WndProc(self, m):
            if m.Msg == 0x0083 and int(m.WParam) == 1:
                m.Result = IntPtr.Zero
                return
            if m.Msg == 0x0084:
                NativeWindow.WndProc(self, m)
                if int(m.Result) == 1:
                    hit = _edge_hit(self.Handle, m.LParam)
                    if hit:
                        m.Result = IntPtr(hit)
                return
            NativeWindow.WndProc(self, m)

    hook = _Hook()
    try:
        hook.AssignHandle(native.Handle)
    except Exception:
        return
    _FRAME_HOOKS[key] = hook


def _edge_hit(handle, lparam) -> int:
    import ctypes

    raw = int(lparam.ToInt64()) if hasattr(lparam, "ToInt64") else int(lparam.ToInt32())
    x = ctypes.c_short(raw & 0xFFFF).value
    y = ctypes.c_short((raw >> 16) & 0xFFFF).value

    class _Rect(ctypes.Structure):
        _fields_ = (("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long))

    rect = _Rect()
    hwnd = int(handle.ToInt64()) if hasattr(handle, "ToInt64") else int(handle.ToInt32())
    get_rect = ctypes.windll.user32.GetWindowRect
    get_rect.argtypes = [ctypes.c_void_p, ctypes.POINTER(_Rect)]
    get_rect.restype = ctypes.c_int
    if not get_rect(hwnd, ctypes.byref(rect)):
        return 0
    grip = 8
    on_l = x < rect.left + grip
    on_r = x >= rect.right - grip
    on_t = y < rect.top + grip
    on_b = y >= rect.bottom - grip
    if on_t and on_l:
        return 13
    if on_t and on_r:
        return 14
    if on_b and on_l:
        return 16
    if on_b and on_r:
        return 17
    if on_l:
        return 10
    if on_r:
        return 11
    if on_t:
        return 12
    if on_b:
        return 15
    return 0


def _chrome(native) -> None:
    """Thick frame para snap y resize. Sin WS_CAPTION: la barra nativa no se pinta."""
    import ctypes

    hwnd = int(native.Handle.ToInt64()) if hasattr(native.Handle, "ToInt64") else int(native.Handle.ToInt32())
    _hook_snap(native)
    user32 = ctypes.windll.user32
    style = user32.GetWindowLongW(hwnd, -16)
    style = (style | 0x00040000 | 0x00010000 | 0x00020000 | 0x00080000) & ~0x00C00000
    user32.SetWindowLongW(hwnd, -16, style)
    user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027)
    try:
        native.MaximizeBox = True
        native.MinimizeBox = True
    except Exception:
        pass
    _no_color_border(native)
    _hook_snap(native)


def _open_maximized(window, holder: dict) -> None:
    """Cada arranque abre maximizada. El botón restaura y luego se achica."""
    native = getattr(window, "native", None)
    if native is None:
        try:
            window.maximize()
        except Exception:
            return
        return

    def apply():
        from System.Drawing import Rectangle
        from System.Windows.Forms import FormWindowState, Screen

        native.WindowState = FormWindowState.Normal
        area = Screen.FromHandle(native.Handle).WorkingArea
        box = native.Bounds
        if abs(box.Width - area.Width) < 12 and abs(box.Height - area.Height) < 12:
            width = min(1280, area.Width)
            height = min(840, area.Height)
            box = Rectangle(
                area.X + (area.Width - width) // 2,
                area.Y + (area.Height - height) // 2,
                width,
                height,
            )
        else:
            box = Rectangle(box.X, box.Y, box.Width, box.Height)
        holder["box"] = box
        _fill_work(native)

    try:
        from System import Func, Type

        if native.InvokeRequired:
            native.Invoke(Func[Type](apply))
            return
    except Exception:
        pass
    try:
        apply()
    except Exception:
        return


def _hide_window(window) -> None:
    try:
        from System.Windows.Forms import Application
    except Exception:
        window.hide()
        return
    form = Application.OpenForms[0] if Application.OpenForms.Count else None
    if form is not None and not form.InvokeRequired:
        form.Hide()
        return
    window.hide()


def _spawn_restart() -> None:
    """Abre otra instancia y deja que esta se cierre. El hijo espera a que suelte el puerto."""
    import subprocess
    from pathlib import Path

    if getattr(sys, "frozen", False):
        cmd = [sys.executable]
    else:
        cmd = [sys.executable, str(Path(sys.argv[0]).resolve())]
    cmd.extend(arg for arg in sys.argv[1:] if arg != "--restart-wait")
    cmd.append("--restart-wait")
    kwargs = {"cwd": str(ROOT), "close_fds": True}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x00000008 | 0x00000200
    subprocess.Popen(cmd, **kwargs)


def _no_browser_keys(window) -> None:
    """Ctrl+Shift+R lo maneja la app, no el recargar del WebView."""
    native = getattr(window, "native", None)
    browser = getattr(native, "browser", None) if native is not None else None
    if browser is None:
        browser = getattr(window, "browser", None)
    web = getattr(browser, "webview", None) if browser is not None else None
    core = getattr(web, "CoreWebView2", None) if web is not None else None
    settings = getattr(core, "Settings", None) if core is not None else None
    if settings is None and web is not None:
        settings = getattr(web, "Settings", None)
    if settings is None:
        return
    try:
        settings.AreBrowserAcceleratorKeysEnabled = False
    except Exception:
        return


def _quit(window) -> None:
    global _quitting
    _quitting = True
    _drop_tray()
    if window is None:
        return
    try:
        from System.Windows.Forms import Application
    except Exception:
        window.destroy()
        return
    form = Application.OpenForms[0] if Application.OpenForms.Count else None
    if form is not None and not form.InvokeRequired:
        form.Close()
        return
    window.destroy()


def _on_ui(fn) -> None:
    try:
        from System import Func, Type
        from System.Windows.Forms import Application
    except Exception:
        fn()
        return
    form = Application.OpenForms[0] if Application.OpenForms.Count else None
    if form is not None and form.InvokeRequired:
        form.Invoke(Func[Type](fn))
        return
    fn()


_SHELL = ("#151b26", "#1c2433", "#f3f4f6", "#22d3ee", "#151b26")


def _argb(hex_color: str):
    from System.Drawing import Color

    text = hex_color.lstrip("#")
    return Color.FromArgb(int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


_MARK = (
    ((6, 16), (24, 6), (42, 16), (42, 32), (24, 42), (6, 32), (6, 16)),
    ((6, 16), (16, 34), (24, 20), (32, 34), (42, 16)),
    ((16, 34), (24, 42), (32, 34)),
    ((14, 11), (24, 28), (34, 11)),
)


def _brand_icon():
    global _mark
    if _mark is not None:
        return _mark
    from System.Drawing import Bitmap, Icon

    ico = ROOT / "public" / "wimod-icon-pack" / "wimod.ico"
    png = ROOT / "public" / "wimod-icon-pack" / "wimod-256x256.png"
    try:
        if ico.is_file():
            icon = Icon(str(ico))
            _mark = (icon.ToBitmap(), icon)
            return _mark
        if png.is_file():
            bitmap = Bitmap(str(png))
            _mark = (bitmap, Icon.FromHandle(bitmap.GetHicon()))
            return _mark
    except Exception:
        pass
    from System.Drawing import Color, Graphics, Pen, PointF, SolidBrush
    from System.Drawing.Drawing2D import GraphicsPath, LineJoin, SmoothingMode

    size = 128
    scale = size / 48.0
    bitmap = Bitmap(size, size)
    draw = Graphics.FromImage(bitmap)
    draw.SmoothingMode = SmoothingMode.AntiAlias
    draw.Clear(Color.Transparent)
    radius = size * 0.22
    box = float(size - 1)
    tile = GraphicsPath()
    tile.AddArc(0, 0, radius * 2, radius * 2, 180, 90)
    tile.AddArc(box - radius * 2, 0, radius * 2, radius * 2, 270, 90)
    tile.AddArc(box - radius * 2, box - radius * 2, radius * 2, radius * 2, 0, 90)
    tile.AddArc(0, box - radius * 2, radius * 2, radius * 2, 90, 90)
    tile.CloseFigure()
    draw.FillPath(SolidBrush(Color.FromArgb(255, 21, 27, 38)), tile)
    edge = Pen(Color.FromArgb(90, 34, 211, 238), max(2.0, size * 0.012))
    draw.DrawPath(edge, tile)
    edge.Dispose()

    def stroke(width, alpha):
        pen = Pen(Color.FromArgb(alpha, 34, 211, 238), width)
        pen.LineJoin = LineJoin.Round
        for mark in _MARK:
            path = GraphicsPath()
            x0, y0 = mark[0]
            for x, y in mark[1:]:
                path.AddLine(PointF(x0 * scale, y0 * scale), PointF(x * scale, y * scale))
                x0, y0 = x, y
            draw.DrawPath(pen, path)
            path.Dispose()
        pen.Dispose()

    stroke(max(2.0, 6.0 * scale), 80)
    stroke(max(1.75, 2.5 * scale), 255)
    draw.Dispose()
    tile.Dispose()
    _mark = (bitmap, Icon.FromHandle(bitmap.GetHicon()))
    return _mark


def _own_taskbar() -> None:
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("wiarch.wi-mod")
    except Exception:
        pass


def _apply_window_icon() -> None:
    try:
        from System.Windows.Forms import Application
    except Exception:
        return
    form = Application.OpenForms[0] if Application.OpenForms.Count else None
    if form is None:
        return
    brand = _brand_icon()[1]

    def paint():
        import ctypes
        form.Icon = brand
        form.ShowIcon = True
        form.ShowInTaskbar = True
        hwnd = form.Handle.ToInt64()
        hicon = brand.Handle.ToInt64()
        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 1, hicon)
        ctypes.windll.user32.SendMessageW(hwnd, 0x0080, 0, hicon)

    _on_ui(paint)


_paint_type = None


def _tray_renderer(bg, panel, text, accent, ink):
    global _paint_type
    from System.Windows.Forms import ToolStripProfessionalRenderer

    if _paint_type is None:
        class _Paint(ToolStripProfessionalRenderer):
            def OnRenderToolStripBackground(self, event):
                from System.Drawing import SolidBrush
                event.Graphics.FillRectangle(SolidBrush(self.bg), event.AffectedBounds)

            def OnRenderToolStripBorder(self, event):
                from System.Drawing import Pen
                event.Graphics.DrawRectangle(Pen(self.accent), 0, 0, event.AffectedBounds.Width - 1, event.AffectedBounds.Height - 1)

            def OnRenderMenuItemBackground(self, event):
                from System.Drawing import SolidBrush
                color = self.accent if event.Item.Selected else self.panel
                event.Graphics.FillRectangle(SolidBrush(color), event.Item.ContentRectangle)

            def OnRenderItemText(self, event):
                event.TextColor = self.ink if event.Item.Selected else self.text
                ToolStripProfessionalRenderer.OnRenderItemText(self, event)

        _paint_type = _Paint
    paint = _paint_type()
    paint.bg = bg
    paint.panel = panel
    paint.text = text
    paint.accent = accent
    paint.ink = ink
    return paint


def _style_tray_menu(menu) -> None:
    from System.Windows.Forms import Padding, ToolStripRenderMode

    bg, panel, text, accent, ink = (_argb(item) for item in _SHELL)
    menu.RenderMode = ToolStripRenderMode.Professional
    menu.Renderer = _tray_renderer(bg, panel, text, accent, ink)
    menu.BackColor = bg
    menu.ForeColor = text
    menu.Padding = Padding(4)
    menu.ShowImageMargin = False
    menu.ShowCheckMargin = False
    for item in menu.Items:
        item.ForeColor = text
        item.BackColor = panel
        item.Padding = Padding(14, 8, 18, 8)


def _ensure_tray(window) -> None:
    def build():
        global _tray
        if _tray is not None:
            _tray.Visible = True
            _style_tray_menu(_tray.ContextMenuStrip)
            return
        from System.Windows.Forms import ContextMenuStrip, NotifyIcon, ToolStripMenuItem

        icon = NotifyIcon()
        icon.Icon = _brand_icon()[1]
        icon.Text = "wi-mod"
        icon.Visible = True
        menu = ContextMenuStrip()
        abrir = ToolStripMenuItem("Abrir")
        recargar = ToolStripMenuItem("Recargar")
        cerrar = ToolStripMenuItem("Cerrar")

        def show(_sender, _args):
            window.show()
            _apply_window_icon()

        def reload(_sender, _args):
            window.show()
            if _url:
                window.load_url(_url)
            else:
                window.evaluate_js("location.reload()")

        def close(_sender, _args):
            _quit(window)

        abrir.Click += show
        recargar.Click += reload
        cerrar.Click += close
        icon.DoubleClick += show
        menu.Items.Add(abrir)
        menu.Items.Add(recargar)
        menu.Items.Add(cerrar)
        menu.Opening += lambda _sender, _args: _style_tray_menu(menu)
        icon.ContextMenuStrip = menu
        _style_tray_menu(menu)
        _tray = icon
        _apply_window_icon()

    _on_ui(build)


def _drop_tray() -> None:
    global _tray
    icon = _tray
    _tray = None
    if icon is None:
        return

    def hide():
        icon.Visible = False
        icon.Dispose()

    try:
        _on_ui(hide)
    except Exception:
        pass


def _report(exc: BaseException) -> None:
    text = f"wi-mod no pudo abrirse.\n\n{exc}"
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, text, "wi-mod", 0x10)
    except Exception:
        print(text)


if __name__ == "__main__":
    main()
