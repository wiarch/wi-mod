"""Arranque de wi-mod."""

from __future__ import annotations

import threading
import webbrowser

from wi_mod.server import ROOT, App, make_server

_quitting = False
_tray = None


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


def _quit_mode(app: App) -> str:
    mode = str(app.library.settings().get("quitMode") or "")
    return mode if mode in {"quit", "tray"} else ""


def _open(url: str, app: App) -> None:
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
                global _quitting
                if _quitting:
                    _drop_tray()
                    return None
                mode = _quit_mode(app)
                if mode == "quit":
                    _quitting = True
                    _drop_tray()
                    return None
                if mode == "tray":
                    _ensure_tray(window)
                    _hide_window(window)
                    return False

                def ask():
                    window.evaluate_js("window.wiModAskQuit && window.wiModAskQuit()")

                threading.Thread(target=ask, daemon=True).start()
                return False

            window.events.closing += on_closing
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


def _ensure_tray(window) -> None:
    def build():
        global _tray
        if _tray is not None:
            _tray.Visible = True
            return
        from System.Drawing import SystemIcons
        from System.Windows.Forms import ContextMenuStrip, NotifyIcon, ToolStripMenuItem

        icon = NotifyIcon()
        icon.Icon = SystemIcons.Application
        icon.Text = "wi-mod"
        icon.Visible = True
        menu = ContextMenuStrip()
        abrir = ToolStripMenuItem("Abrir wi-mod")
        cerrar = ToolStripMenuItem("Cerrar wi-mod")

        def show(_sender, _args):
            window.show()

        def close(_sender, _args):
            _quit(window)

        abrir.Click += show
        cerrar.Click += close
        icon.DoubleClick += show
        menu.Items.Add(abrir)
        menu.Items.Add(cerrar)
        icon.ContextMenuStrip = menu
        _tray = icon

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
