# generate_htmls_from_json.py
import os
import re
import json
import argparse
import hashlib
from typing import Any, Dict, List

# ---- STRICT CONSTANT BLOCK SENTINELS ----
START_SENTINEL_RE = re.compile(
    r'^[ \t]*const[ \t]+WORKOUT_ID[ \t]*=[ \t]*".*?"[ \t]*;[ \t]*\r?$',
    re.MULTILINE,
)
END_SENTINEL_RE = re.compile(
    r'^[ \t]*\][ \t]*;[ \t]*\r?$',
    re.MULTILINE,
)

ILLEGAL_WIN_CHARS = set(r'<>:"/\|?*')

# ---------- PATH RESOLUTION ----------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKOUT_DIR = SCRIPT_DIR

TEMPLATE_DEFAULT = os.path.join(WORKOUT_DIR, "WF-STR-A25.html")
JSON_DEFAULT = os.path.join(WORKOUT_DIR, "workouts_constants.json")
OUT_DIR_DEFAULT = WORKOUT_DIR

# ---------- UTILS ----------
def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()

def detect_newline_style(s: str) -> str:
    return "\r\n" if "\r\n" in s else "\n"

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def validate_workout(w: Dict[str, Any]) -> str:
    for k in ("WORKOUT_ID", "WORKOUT_NAME", "EXERCISES"):
        if k not in w:
            raise ValueError(f"Missing key: {k}")

    wid = str(w["WORKOUT_ID"]).strip()
    if not wid or any(c in ILLEGAL_WIN_CHARS for c in wid):
        raise ValueError(f"Invalid WORKOUT_ID: {wid}")

    if not isinstance(w["EXERCISES"], list) or not w["EXERCISES"]:
        raise ValueError(f"{wid}: EXERCISES must be non-empty list")

    for i, ex in enumerate(w["EXERCISES"]):
        if not isinstance(ex, dict):
            raise ValueError(f"{wid}: exercise[{i}] must be object")
        if "title" not in ex:
            raise ValueError(f"{wid}: exercise[{i}] missing title")
        if "duration" not in ex and not ("start" in ex and "end" in ex):
            raise ValueError(f"{wid}: exercise[{i}] missing duration or start/end")

    return wid

def build_constants_block(w: Dict[str, Any], nl: str) -> str:
    def esc(s: Any) -> str:
        return str(s).replace("\\", "\\\\").replace('"', '\\"')

    lines: List[str] = [
        f'    const WORKOUT_ID   = "{esc(w["WORKOUT_ID"])}";',
        f'    const WORKOUT_NAME = "{esc(w["WORKOUT_NAME"])}";',
        "",
        "    const EXERCISES = [",
    ]

    for ex in w["EXERCISES"]:
        parts = [f'title: "{esc(ex["title"])}"']
        if "duration" in ex:
            parts.append(f'duration: "{esc(ex["duration"])}"')
        else:
            parts.append(f'start: "{esc(ex["start"])}"')
            parts.append(f'end: "{esc(ex["end"])}"')
        if "notes" in ex:
            parts.append(f'notes: "{esc(ex["notes"])}"')
        lines.append("      { " + ", ".join(parts) + " },")

    lines += ["    ];", ""]
    return nl.join(lines) + nl

def replace_constants(template: str, block: str) -> str:
    s = START_SENTINEL_RE.search(template)
    if not s:
        raise RuntimeError("Template sentinel START not found (const WORKOUT_ID...).")
    e = END_SENTINEL_RE.search(template, pos=s.end())
    if not e:
        raise RuntimeError("Template sentinel END not found (closing '];').")
    if e.start() <= s.start():
        raise RuntimeError("Template sentinel order invalid.")
    return template[:s.start()] + block + template[e.end():]

def write_atomic(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    os.replace(tmp, path)

# ---------- MAIN ----------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", default=TEMPLATE_DEFAULT)
    ap.add_argument("--json", dest="json_path", default=JSON_DEFAULT)
    ap.add_argument("--outdir", default=OUT_DIR_DEFAULT)
    ap.add_argument("--overwrite", action="store_true", help="Force write even if identical.")
    ap.add_argument("--dry-run", action="store_true", help="Print what would change; write nothing.")
    args = ap.parse_args()

    if not os.path.isfile(args.template):
        raise FileNotFoundError(f"Template not found:\n{args.template}")
    if not os.path.isfile(args.json_path):
        raise FileNotFoundError(f"JSON not found:\n{args.json_path}")

    template = read_text(args.template)
    nl = detect_newline_style(template)

    with open(args.json_path, "r", encoding="utf-8") as f:
        workouts = json.load(f)

    if not isinstance(workouts, list):
        raise ValueError("Top-level JSON must be an array of workout objects.")

    generated = 0
    updated = 0
    unchanged = 0
    skipped_invalid = 0

    for w in workouts:
        try:
            wid = validate_workout(w)
        except Exception:
            skipped_invalid += 1
            raise

        out_path = os.path.join(args.outdir, f"{wid}.html")

        block = build_constants_block(w, nl)
        html = replace_constants(template, block)

        new_hash = sha256_text(html)
        exists = os.path.exists(out_path)

        if exists:
            old_html = read_text(out_path)
            old_hash = sha256_text(old_html)

            if old_hash == new_hash and not args.overwrite:
                unchanged += 1
                continue

            if args.dry_run:
                updated += 1
                continue

            write_atomic(out_path, html)
            updated += 1
        else:
            if args.dry_run:
                generated += 1
                continue
            write_atomic(out_path, html)
            generated += 1

    total_written = generated + updated
    print(f"Generated: {generated}")
    print(f"Updated:   {updated}")
    print(f"Unchanged: {unchanged}")
    print(f"Written:   {total_written}")
    print(f"Directory: {args.outdir}")

if __name__ == "__main__":
    main()
