"""Arranque de wi-mod."""

from __future__ import annotations

import threading
import webbrowser

from wi_mod.server import ROOT, App, make_server


def main() -> None:
    try:
        _run()
    except Exception as exc:  # noqa: BLE001
        _report(exc)


def _run() -> None:
    app = App(ROOT / "data")
    server = make_server(app)
    thread = threading.Thread(target=server.serve_forever, name="wi-mod")
    thread.start()
    host, port = server.server_address
    url = f"http://{host}:{port}/"
    try:
        _open(url)
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def _open(url: str) -> None:
    try:
        import webview
    except ImportError:
        webview = None
    if webview is not None:
        try:
            webview.create_window("wi-mod", url, width=1280, height=840, min_size=(980, 640))
            webview.start()
            return
        except Exception as exc:  # noqa: BLE001
            print(f"Ventana nativa no disponible ({exc}). Abro el navegador.")
    webbrowser.open(url)
    threading.Event().wait()


def _report(exc: BaseException) -> None:
    text = f"wi-mod no pudo abrirse.\n\n{exc}"
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, text, "wi-mod", 0x10)
    except Exception:
        print(text)


if __name__ == "__main__":
    main()
