import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("assemble_pages", Path(__file__).parents[2] / "scripts/assemble_pages.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PagesAssemblyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "site"
        self.build = self.root / "build"
        self.build.mkdir()
        (self.build / "index.html").write_text("new build")
        self.state.mkdir()
        (self.state / ".git").mkdir()
        (self.state / "index.html").write_text("production")
        (self.state / "stale.js").write_text("old")
        for number in (3, 4):
            directory = self.state / "pr-preview" / f"pr-{number}"
            directory.mkdir(parents=True)
            (directory / "index.html").write_text(f"preview {number}")

    def test_main_replaces_production_but_preserves_open_previews(self):
        module.assemble(self.state, self.build, None, {3, 4})
        self.assertEqual((self.state / "index.html").read_text(), "new build")
        self.assertFalse((self.state / "stale.js").exists())
        self.assertEqual((self.state / "pr-preview/pr-3/index.html").read_text(), "preview 3")
        self.assertTrue((self.state / ".git").is_dir())

    def test_preview_changes_only_its_directory_and_prunes_closed_prs(self):
        module.assemble(self.state, self.build, 3, {3})
        self.assertEqual((self.state / "index.html").read_text(), "production")
        self.assertEqual((self.state / "pr-preview/pr-3/index.html").read_text(), "new build")
        self.assertFalse((self.state / "pr-preview/pr-4").exists())

    def test_close_removes_preview_without_needing_a_build(self):
        module.assemble(self.state, None, None, {4})
        self.assertFalse((self.state / "pr-preview/pr-3").exists())
        self.assertEqual((self.state / "index.html").read_text(), "production")

    def test_invalid_build_is_rejected_before_changing_production(self):
        (self.build / "bad-link").symlink_to(self.state / "index.html")
        with self.assertRaises(ValueError):
            module.assemble(self.state, self.build, None, set())
        self.assertEqual((self.state / "index.html").read_text(), "production")

    def test_preview_cannot_escape_its_directory(self):
        with self.assertRaises(ValueError):
            module.assemble(self.state, self.build, "../main", set())
