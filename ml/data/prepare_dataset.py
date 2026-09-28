"""Prepare a training dataset by mapping DeepFashion / user-provided labels to
StyleLoom's canonical `label_schema.json` vocabulary.

Writes a manifest.jsonl of {image_path, labels: {attr: value_or_null}} where
attributes with no source label are left `null` — training scripts will ignore
`null` per-example so undertrained heads never learn wrong labels.
"""
from __future__ import annotations
import argparse, json, os, csv
from pathlib import Path

SCHEMA = json.loads((Path(__file__).parent / "label_schema.json").read_text())

def normalize(attr: str, raw: str | None) -> str | None:
    if not raw:
        return None
    raw = raw.strip().lower()
    return raw if raw in SCHEMA[attr] else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="path to source dataset dir")
    ap.add_argument("--labels", help="optional CSV of image_path,attr,value rows")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    manifest = out / "manifest.jsonl"

    rows: dict[str, dict[str, str | None]] = {}
    if args.labels and os.path.exists(args.labels):
        with open(args.labels) as f:
            for row in csv.DictReader(f):
                rows.setdefault(row["image_path"], {})[row["attr"]] = normalize(row["attr"], row["value"])

    n = 0
    with manifest.open("w") as f:
        for img in Path(args.source).rglob("*.jpg"):
            rel = str(img.relative_to(args.source))
            labels = {a: None for a in SCHEMA}
            labels.update(rows.get(rel, {}))
            f.write(json.dumps({"image_path": rel, "labels": labels}) + "\n")
            n += 1
    print(f"Wrote {n} entries to {manifest}")

if __name__ == "__main__":
    main()
