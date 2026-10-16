#!/usr/bin/env python3
"""Package the existing hackathon page for its own Azure Static Web App.

Only deployment output is changed. Keep editing hackathon/ and the shared
assets in their existing locations; GitHub Actions runs this automatically.
"""

import argparse
from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[2]
SHARED = (
    "assets",
    "adobe-typography.css",
    "motion.css",
    "enhancements.css",
    "scene-client.js",
    "static-batches.js",
    "motion.js",
    "hackathon-motion.js",
    "hackathon-motion.css",
    "edge-decorations.js",
    "polish.css",
    "orbital.js",
    "three-stage.js",
    "staticwebapp.config.json",
)


def build(output):
    output = output.resolve()
    # Never overwrite source files or an existing directory.
    if output == ROOT or output in ROOT.parents or output.exists():
        raise SystemExit(f"Choose a new, empty output path: {output}")
    output.mkdir(parents=True)
    shutil.copytree(ROOT / "hackathon", output, dirs_exist_ok=True)
    for name in SHARED:
        source, target = ROOT / name, output / name
        if source.is_dir():
            shutil.copytree(source, target)
        else:
            shutil.copy2(source, target)

    # The generated page lives at / instead of /hackathon/. Home links must
    # still return to the main site; other shared URLs resolve at this origin.
    index = output / "index.html"
    html = index.read_bytes().decode("utf-8")
    html = re.sub(r'(href=["\'])\.\./(["\'])',
                  r'\1https://www.stem2connect.org/\2', html)
    html = re.sub(r'((?:href|src)=["\'])\.\./', r'\1/', html)
    index.write_bytes(html.encode("utf-8"))
    files = [path for path in output.rglob("*") if path.is_file()]
    print(f"Hackathon package: {len(files)} files, "
          f"{sum(path.stat().st_size for path in files):,} bytes -> {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=ROOT / ".github/.build/hackathon")
    build(parser.parse_args().output)
