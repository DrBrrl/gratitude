#!/usr/bin/env python3
"""Build and run the exact planned scenario directories without shell interpolation."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from select_ci import PROJECTS, inventory


def commands(root, project, mode, scenarios):
    config = json.loads((root / "ci/walkthroughs.json").read_text())
    found = inventory(root, config)
    allowed = {found[key] for group, ids in config["groups"].items()
               if (group == "generic-ai") == (mode == "generic") for key in ids if key in found}
    if project not in PROJECTS or mode not in ("paid", "generic") or not scenarios or len(scenarios) != len(set(scenarios)) or not set(scenarios) <= allowed:
        raise ValueError("Invalid CI walkthrough plan or build mode")
    return [["node", "scripts/warm_ci_emulators.mjs"], ["npm", "run", "build"],
            ["npx", "playwright", "test", "--project=" + project,
             *["tests/e2e/" + name + "/" + name + ".spec.ts" for name in scenarios]]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    project = os.environ["CI_PROJECT"]
    mode = os.environ["CI_AI_MODE"]
    scenarios = json.loads(os.environ["CI_SCENARIOS"])
    selected = commands(root, project, mode, scenarios)
    if args.dry_run:
        print(json.dumps(selected, indent=2))
        return
    env = {**os.environ, "VITE_FIREBASE_EMULATORS": "true", "VITE_AI_DATA_MODE": mode,
           "E2E_FIREBASE": "true", "E2E_AI_GENERIC": "true" if mode == "generic" else "false"}
    for command in selected:
        subprocess.run(command, cwd=root, env=env, check=True)


if __name__ == "__main__":
    main()
