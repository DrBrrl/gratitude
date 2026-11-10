#!/usr/bin/env python3
"""Conservative PR walkthrough selection. Main/manual/unknown changes run everything."""
import argparse
import html
import json
import os
from pathlib import Path
import re
import subprocess

PROJECTS = ("mobile-chromium", "desktop-chromium")
FULL_LABEL = "ci:full-e2e"


def inventory(root, config):
    found = {}
    for spec in sorted((root / "tests/e2e").glob("[0-9]*/*.spec.ts")):
        name = spec.parent.name
        if not re.fullmatch(r"[0-9]{3}-[a-z0-9-]+", name):
            raise ValueError(f"Invalid walkthrough directory: {name}")
        if spec.name != name + ".spec.ts":
            raise ValueError(f"Walkthrough file must match its directory: {spec}")
        key = name[:3]
        if key in found:
            raise ValueError(f"Duplicate walkthrough ID: {key}")
        found[key] = name
    registered = [key for ids in config["groups"].values() for key in ids]
    if len(registered) != len(set(registered)):
        raise ValueError("A walkthrough is assigned to multiple groups")
    missing = set(found) - set(registered)
    if missing:
        raise ValueError(f"Register new walkthrough IDs and their build mode before CI can pass: {sorted(missing)}")
    if not found or not (set(config["smoke"]) | {"001"}) <= set(found):
        raise ValueError("Required smoke walkthroughs are missing")
    for ids in config["isolated_components"].values():
        if not set(ids) <= set(registered):
            raise ValueError("Component selection references an unregistered walkthrough")
    return found


def changed_paths(root, base, head):
    if not all(re.fullmatch(r"[a-f0-9]{40,64}", value or "") for value in [base, head]):
        raise ValueError("Missing or invalid PR commit IDs")
    merge_base = subprocess.check_output(["git", "merge-base", base, head], cwd=root, text=True).strip()
    output = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", merge_base, head, "--"], cwd=root)
    return [path.decode("utf-8", errors="strict") for path in output.split(b"\0") if path]


def select(root, config, event_name, event, paths=None):
    found = inventory(root, config)
    full = event_name != "pull_request" or any(label.get("name") == FULL_LABEL for label in event.get("pull_request", {}).get("labels", []))
    reasons = ["Main/manual run or explicit full-suite override"] if full else []
    chosen = set(config["smoke"]) | {"001"}
    if not full and paths is None:
        pr = event.get("pull_request", {})
        try:
            paths = changed_paths(root, pr.get("base", {}).get("sha"), pr.get("head", {}).get("sha"))
        except (ValueError, UnicodeError, OSError, subprocess.CalledProcessError):
            full = True
            reasons.append("PR diff unavailable: full suite")
    for path in paths or []:
        reason = "shared or unmapped path: full suite"
        match = re.fullmatch(r"tests/e2e/([0-9]{3}-[a-z0-9-]+)/.+", path)
        if path in config["isolated_components"]:
            chosen.update(config["isolated_components"][path])
            reason = "explicit component consumers"
        elif match and match[1][:3] in found and match[1] == found[match[1][:3]]:
            # Removing a spec must not silently shrink a selected run.
            if path.endswith(".spec.ts") and not (root / path).is_file():
                full = True
            else:
                chosen.add(match[1][:3])
                reason = "walkthrough or its own fixture/baseline"
        elif path in config["documentation"] or path.startswith("docs/"):
            reason = "documentation; smoke retained"
        else:
            full = True
        reasons.append(f"{path}: {reason}")
    if full:
        chosen = set(found)
    chosen &= set(found)
    matrix = []
    for group, ids in config["groups"].items():
        selected = sorted(chosen & set(ids))
        # The public landing is always checked against the actual deployment build.
        selected = [key for key in selected if key != "001"]
        if not selected:
            continue
        for project in PROJECTS:
            matrix.append({"suite": group, "project": project,
                           "mode": "generic" if group == "generic-ai" else "paid",
                           "scenarios": [found[key] for key in selected]})
    return {"full": full, "matrix": {"include": matrix}, "reasons": reasons,
            "scenarios": sorted(chosen), "landing": "001" in found}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--event", type=Path, default=os.environ.get("GITHUB_EVENT_PATH"))
    parser.add_argument("--event-name", default=os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch"))
    parser.add_argument("--output", type=Path, default=os.environ.get("GITHUB_OUTPUT"))
    parser.add_argument("--summary", type=Path, default=os.environ.get("GITHUB_STEP_SUMMARY"))
    args = parser.parse_args()
    config = json.loads((args.root / "ci/walkthroughs.json").read_text())
    event = json.loads(args.event.read_text()) if args.event else {}
    plan = select(args.root, config, args.event_name, event)
    if args.output:
        with args.output.open("a") as output:
            output.write("matrix=" + json.dumps(plan["matrix"], separators=(",", ":")) + "\n")
    if args.summary:
        with args.summary.open("a") as summary:
            summary.write("## Walkthrough selection\n\n" + ("Full suite" if plan["full"] else "Affected walkthroughs plus smoke") + "\n\n")
            summary.write("Always: landing (001), routing/sign-in/navigation (035), both viewports.\n\n")
            summary.write("Selected IDs: " + ", ".join(plan["scenarios"]) + "\n\n")
            for reason in plan["reasons"]:
                summary.write("- <code>" + html.escape(reason) + "</code>\n")
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
