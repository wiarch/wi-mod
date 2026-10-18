"""Arranque de wi-mod."""

from __future__ import annotations

import threading
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
    app = App(ROOT / "data")
    server = _listen(app)
    thread = threading.Thread(target=server.serve_forever, name="wi-mod")
    thread.start()
    host, port = server.server_address
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
                maximized=True,
                js_api=_Host(holder),
            )
            holder["window"] = window

            def on_closing():
                if _quitting:
                    _drop_tray()
                    return None
                _ensure_tray(window)
                _hide_window(window)
                return False

            def on_shown():
                _apply_window_icon()
                _ensure_tray(window)

            window.events.closing += on_closing
            window.events.shown += on_shown
            webview.start(private_mode=False, storage_path=str(ROOT / "data" / "webview"))
            return
        except Exception as exc:  # noqa: BLE001
            print(f"Ventana nativa no disponible ({exc}). Abro el navegador.")
    webbrowser.open(url)
    threading.Event().wait()


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


_THEMES = {
    "nexus": ("#141210", "#2e2a24", "#f6efe6", "#e08a2c", "#1a1208"),
    "modrinth": ("#16181c", "#2c3036", "#e8eef2", "#1bd96a", "#06210f"),
    "curseforge": ("#121212", "#2a2a2a", "#f4ece8", "#f16436", "#2a100a"),
    "steam": ("#171a21", "#243447", "#e8f4fc", "#66c0f4", "#0b1b28"),
    "moddb": ("#140c0c", "#301818", "#f8f1f1", "#e10600", "#1a0808"),
    "rawg": ("#151515", "#2a2a2a", "#ffffff", "#f4f4f4", "#151515"),
}


def _theme_key() -> str:
    raw = "nexus"
    if _app is not None:
        raw = str(_app.library.settings().get("theme") or "nexus")
    key = raw.strip().lower()
    return key if key in _THEMES else "nexus"


def _argb(hex_color: str):
    from System.Drawing import Color

    text = hex_color.lstrip("#")
    return Color.FromArgb(int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def _brand_icon():
    global _mark
    if _mark is not None:
        return _mark
    from System.Drawing import Bitmap, Color, Font, FontStyle, Graphics, Icon, Rectangle, RectangleF, SolidBrush, StringAlignment, StringFormat
    from System.Drawing.Drawing2D import GraphicsPath, LinearGradientBrush, LinearGradientMode, SmoothingMode

    size = 64
    bitmap = Bitmap(size, size)
    draw = Graphics.FromImage(bitmap)
    draw.SmoothingMode = SmoothingMode.AntiAlias
    draw.Clear(Color.Transparent)
    path = GraphicsPath()
    radius = 14
    box = size - 1
    path.AddArc(0, 0, radius, radius, 180, 90)
    path.AddArc(box - radius, 0, radius, radius, 270, 90)
    path.AddArc(box - radius, box - radius, radius, radius, 0, 90)
    path.AddArc(0, box - radius, radius, radius, 90, 90)
    path.CloseFigure()
    fill = LinearGradientBrush(
        Rectangle(0, 0, size, size),
        _argb("#f0a04a"),
        _argb("#c45c26"),
        LinearGradientMode.ForwardDiagonal,
    )
    draw.FillPath(fill, path)
    layout = StringFormat()
    layout.Alignment = StringAlignment.Center
    layout.LineAlignment = StringAlignment.Center
    draw.DrawString(
        "wi",
        Font("Segoe UI", 26, FontStyle.Bold),
        SolidBrush(_argb("#1a1208")),
        RectangleF(0, 2, float(size), float(size)),
        layout,
    )
    draw.Dispose()
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

    bg, panel, text, accent, ink = (_argb(item) for item in _THEMES[_theme_key()])
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
