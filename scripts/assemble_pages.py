"""Combine a tested build with the existing Pages site without losing previews."""

import argparse
import json
from pathlib import Path
import re
import shutil


def remove(path):
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def assemble(state, source, preview, open_prs):
    state, source = Path(state), Path(source) if source else None
    if preview is not None and not re.fullmatch(r"[1-9][0-9]*", str(preview)):
        raise ValueError("Preview must be a positive PR number")
    if source:
        if not (source / "index.html").is_file():
            raise ValueError("Build must contain index.html")
        for item in source.rglob("*"):
            if item.is_symlink() or item.name == ".git" or not (item.is_file() or item.is_dir()):
                raise ValueError("Build must contain only ordinary static files")
        if (source / "pr-preview").exists():
            raise ValueError("pr-preview is reserved for deployment state")

    state.mkdir(parents=True, exist_ok=True)
    previews = state / "pr-preview"
    if previews.exists():
        for directory in previews.iterdir():
            match = re.fullmatch(r"pr-([1-9][0-9]*)", directory.name)
            if match and int(match[1]) not in open_prs:
                remove(directory)

    if source:
        target = state if preview is None else previews / f"pr-{preview}"
        target.mkdir(parents=True, exist_ok=True)
        for item in target.iterdir():
            if preview is None and item.name in {".git", "pr-preview"}:
                continue
            remove(item)
        shutil.copytree(source, target, dirs_exist_ok=True)

    (state / ".nojekyll").touch()
    # The initial scaffold PR can have a preview before main contains an app.
    if not (state / "index.html").exists():
        (state / "index.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<title>Gratitude</title><h1>Gratitude</h1>'
            '<p>The main application has not been deployed yet.</p></html>\n'
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True)
    parser.add_argument("--source")
    parser.add_argument("--preview", type=int)
    parser.add_argument("--open-prs", required=True, help="JSON file containing open PR numbers")
    args = parser.parse_args()
    open_prs = json.loads(Path(args.open_prs).read_text())
    if not isinstance(open_prs, list) or any(type(number) is not int or number < 1 for number in open_prs):
        raise ValueError("Open PR list must contain positive integer IDs")
    assemble(args.state, args.source, args.preview, set(open_prs))
