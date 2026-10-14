import io
import json
import tempfile
import threading
import unittest
import urllib.request
import zipfile
from pathlib import Path

from wi_mod.archive import export_library, import_library
from wi_mod.multipart import parse_multipart
from wi_mod.nexus import extract_dependencies, parse_mod_url, pick_file
from wi_mod.server import App, _has_update, make_server
from wi_mod.store import Library


class UrlTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(
            parse_mod_url("https://www.nexusmods.com/skyrimspecialedition/mods/12604?tab=files"),
            ("skyrimspecialedition", 12604),
        )
        self.assertIsNone(parse_mod_url("https://www.nexusmods.com/skyrimspecialedition"))

    def test_pick_primary(self):
        chosen = pick_file([
            {"version": "old", "uploaded_timestamp": 20, "category_name": "OLD_VERSION"},
            {"version": "1.2", "uploaded_timestamp": 10, "is_primary": True, "category_name": "MAIN"},
        ])
        self.assertEqual(chosen["version"], "1.2")

    def test_category_from_games_cache(self):
        from wi_mod.nexus import Cache

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            games = root / "games.json"
            games.write_text(
                '[{"domain_name":"skyrimspecialedition","name":"Skyrim Special Edition",'
                '"categories":[{"category_id":79,"name":"Overhauls"}]}]',
                encoding="utf-8",
            )
            cache = Cache(games, root / "categories.json")
            self.assertEqual(
                cache.category_name("unused", "skyrimspecialedition", 79),
                "Overhauls",
            )

    def test_has_update(self):
        self.assertFalse(_has_update(
            {"version": "2.2", "updatedAt": "2025-02-01T13:49:27Z"},
            {"version": "2.2", "updatedAt": "2025-02-01T13:49:27Z"},
        ))
        self.assertTrue(_has_update(
            {"version": "2.2", "updatedAt": "2025-02-01T13:49:27Z"},
            {"version": "2.3", "updatedAt": "2025-03-01T13:49:27Z"},
        ))

    def test_translate_skips_spanish(self):
        from wi_mod.translate import translate_text

        text = "Esta descripción también habla de la iluminación para el camino."
        self.assertEqual(translate_text(text), text)

    def test_extract_dependencies(self):
        desc = (
            "Hard requirements: [url=https://www.nexusmods.com/skyrimspecialedition/mods/12604]SkyUI[/url] "
            "Optional patch: [url=https://www.nexusmods.com/skyrimspecialedition/mods/43158]Lux[/url]"
        )
        deps = extract_dependencies(desc, "skyrimspecialedition", 63588)
        self.assertTrue(any(item["modId"] == 12604 for item in deps["required"]))
        self.assertTrue(any(item["modId"] == 43158 for item in deps["optional"]))


class MultipartTests(unittest.TestCase):
    def test_file_part(self):
        body = (
            b"--abc\r\n"
            b'Content-Disposition: form-data; name="file"; filename="a.zip"\r\n'
            b"\r\n"
            b"PKDATA\r\n"
            b"--abc--\r\n"
        )
        with tempfile.TemporaryDirectory() as folder:
            parts = parse_multipart(io.BytesIO(body), len(body), 'multipart/form-data; boundary=abc', Path(folder))
            self.assertEqual(parts[0]["filename"], "a.zip")
            self.assertEqual(Path(parts[0]["path"]).read_bytes(), b"PKDATA")


class ArchiveTests(unittest.TestCase):
    def test_roundtrip(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            library = Library(root / "lib")
            mod = library.add({
                "name": "SkyUI",
                "gameDomain": "skyrimspecialedition",
                "gameName": "Skyrim Special Edition",
                "modId": 12604,
                "category": "User Interface",
                "version": "5.2",
                "summary": "Interfaz",
                "nexusUrl": "https://www.nexusmods.com/skyrimspecialedition/mods/12604",
            })
            blob = root / "sample.zip"
            blob.write_bytes(b"mod-bytes")
            library.add_file(mod["id"], "SkyUI.zip", blob)
            image = root / "lib" / "images"
            image.mkdir(parents=True)
            picture = image / f"{mod['id']}.jpg"
            picture.write_bytes(b"img")
            library.set_picture(mod["id"], f"images/{mod['id']}.jpg")

            dest = root / "pack.zip"
            export_library(library, dest, None)
            restored = Library(root / "restored")
            result = import_library(restored, dest)
            self.assertEqual(result["added"], 1)
            mods = restored.list_mods()
            self.assertEqual(mods[0]["name"], "SkyUI")
            self.assertEqual(mods[0]["version"], "5.2")
            stored = restored.absolute(mods[0]["files"][0]["storedAs"])
            self.assertEqual(stored.read_bytes(), b"mod-bytes")
            self.assertTrue(restored.absolute(mods[0]["pictureFile"]).is_file())
            with zipfile.ZipFile(dest) as bundle:
                self.assertIn("manifest.json", bundle.namelist())


class ServerTests(unittest.TestCase):
    def test_manual_mod_export(self):
        with tempfile.TemporaryDirectory() as folder:
            app = App(Path(folder))
            server = make_server(app)
            thread = threading.Thread(target=server.serve_forever)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            try:
                created = _post(base + "/api/mods", {
                    "url": "https://www.nexusmods.com/skyrimspecialedition/mods/12604",
                    "category": "UI",
                    "manual": {
                        "name": "SkyUI",
                        "gameName": "Skyrim",
                        "summary": "Interfaz",
                        "version": "5.2",
                    },
                })
                self.assertEqual(created["mod"]["name"], "SkyUI")
                self.assertEqual(created["mod"]["category"], "UI")
                listing = json.loads(urllib.request.urlopen(base + "/api/library").read())
                self.assertEqual(len(listing["mods"]), 1)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


def _post(url, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode())


if __name__ == "__main__":
    unittest.main()
