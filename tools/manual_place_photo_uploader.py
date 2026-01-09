"""Interactive manual place photo uploader.

Goal:
- Reads embedded place lists from src/Web/wwwroot/js/app.js (GOLBASI_PLACES, PHOTOGRAPHERS, BAKERIES, FLORISTS).
- Asks you, in order, to pick a local image for each place.
- Copies the chosen file into src/Web/wwwroot/img/place-photos/ with a normalized filename.
- Updates src/Web/wwwroot/img/place-photos/manifest.json after EACH upload so the website can show it immediately.

Usage (from evently-docker-dotnet):
  python tools/manual_place_photo_uploader.py

Notes:
- Allowed image types: .jpg, .jpeg, .png, .webp
- Press Enter to skip when a photo already exists.
- Type 's' to skip, 'r' to replace existing, 'q' to quit.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class Place:
    name: str
    category: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_place_key(name: str) -> str:
    s = str(name or "").strip().lower()
    if not s:
        return ""

    # Turkish specific
    s = (
        s.replace("ı", "i")
        .replace("ş", "s")
        .replace("ğ", "g")
        .replace("ü", "u")
        .replace("ö", "o")
        .replace("ç", "c")
    )

    # Strip diacritics (NFKD)
    try:
        import unicodedata

        s = "".join(
            ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch)
        )
    except Exception:
        pass

    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def app_js_path(root: Path) -> Path:
    return root / "src" / "Web" / "wwwroot" / "js" / "app.js"


def place_photos_dir(root: Path) -> Path:
    return root / "src" / "Web" / "wwwroot" / "img" / "place-photos"


def place_manifest_path(root: Path) -> Path:
    return place_photos_dir(root) / "manifest.json"


_JS_STRING_RE = re.compile(r'"((?:\\.|[^"\\])*)"')


def _unescape_js_string(s: str) -> str:
    # Minimal JS string unescape that preserves non-ASCII characters.
    # We only handle a small set of escape sequences used in string literals.
    if "\\" not in s:
        return s
    return (
        s.replace("\\\\", "\\")
        .replace("\\\"", '"')
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
    )


def parse_places_from_app_js(js_text: str) -> List[Place]:
    """Extract place names + categories from the four embedded arrays, preserving order."""

    arrays_in_order = [
        "GOLBASI_PLACES",
        "PHOTOGRAPHERS",
        "BAKERIES",
        "FLORISTS",
    ]

    places: List[Place] = []

    for array_name in arrays_in_order:
        # Capture between: const NAME = [ ... ];
        m = re.search(
            rf"const\s+{re.escape(array_name)}\s*=\s*\[(.*?)\];",
            js_text,
            flags=re.DOTALL,
        )
        if not m:
            continue

        body = m.group(1)

        # Match each object literal: { ... }
        for obj in re.finditer(r"\{(.*?)\}", body, flags=re.DOTALL):
            chunk = obj.group(1)

            name_match = re.search(r"\bname\s*:\s*" + _JS_STRING_RE.pattern, chunk)
            cat_match = re.search(r"\bcategory\s*:\s*" + _JS_STRING_RE.pattern, chunk)
            if not name_match or not cat_match:
                continue

            raw_name = name_match.group(1)
            raw_cat = cat_match.group(1)
            try:
                name = _unescape_js_string(raw_name)
            except Exception:
                name = raw_name
            try:
                category = _unescape_js_string(raw_cat)
            except Exception:
                category = raw_cat

            name = name.strip()
            category = category.strip()
            if not name or not category:
                continue

            places.append(Place(name=name, category=category))

    # De-duplicate by normalized key but keep first occurrence order
    seen: set[str] = set()
    unique: List[Place] = []
    for p in places:
        k = normalize_place_key(p.name)
        if not k or k in seen:
            continue
        seen.add(k)
        unique.append(p)

    return unique


def load_manifest(path: Path) -> Dict:
    if not path.exists():
        return {"generatedAtUtc": utc_now_iso(), "items": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("manifest root must be object")
        data.setdefault("generatedAtUtc", utc_now_iso())
        items = data.get("items")
        if not isinstance(items, dict):
            data["items"] = {}
        return data
    except Exception:
        return {"generatedAtUtc": utc_now_iso(), "items": {}}


def write_manifest(path: Path, manifest: Dict) -> None:
    manifest["generatedAtUtc"] = utc_now_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def pick_file_dialog() -> Optional[str]:
    """Try to open a native file picker. Returns selected path or None."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        file_path = filedialog.askopenfilename(
            title="Mekan görseli seçin",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png *.webp"),
                ("All files", "*.*"),
            ],
        )
        root.destroy()
        return file_path or None
    except Exception:
        return None


def is_allowed_image(path: Path) -> bool:
    return path.suffix.lower() in ALLOWED_EXTS


def target_filename(key: str, source_path: Path) -> str:
    ext = source_path.suffix.lower()
    if ext == ".jpeg":
        ext = ".jpg"
    return f"{key}{ext}"


def copy_image(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(src), str(dest))


def main() -> int:
    root = repo_root()
    js_path = app_js_path(root)
    out_dir = place_photos_dir(root)
    manifest_path = place_manifest_path(root)

    if not js_path.exists():
        print(f"ERROR: app.js not found at: {js_path}")
        return 2

    js_text = js_path.read_text(encoding="utf-8", errors="replace")
    places = parse_places_from_app_js(js_text)
    if not places:
        print("ERROR: No embedded places found in app.js.")
        return 3

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(manifest_path)
    items: Dict = manifest.setdefault("items", {})

    # Pre-seed manifest entries for all places and detect already-existing files.
    if isinstance(items, dict):
        for p in places:
            key = normalize_place_key(p.name)
            if not key:
                continue

            existing = items.get(key)
            if not isinstance(existing, dict):
                existing = {}

            # Detect a file already placed on disk even if manifest wasn't updated.
            disk_file = None
            try:
                for candidate in out_dir.glob(f"{key}.*"):
                    if candidate.is_file() and candidate.suffix.lower() in ALLOWED_EXTS:
                        disk_file = candidate
                        break
            except Exception:
                disk_file = None

            existing.setdefault("name", p.name)
            existing.setdefault("category", p.category)
            existing.setdefault("source", "local")
            existing.setdefault("attribution", None)

            if disk_file is not None:
                existing["path"] = f"/img/place-photos/{disk_file.name}"
            else:
                existing.setdefault("path", None)

            items[key] = existing

        # Write once so the website can immediately reflect any already-copied files.
        write_manifest(manifest_path, manifest)

    print("\nManual place photo uploader")
    print("- It will ask you one by one in list order.")
    print(f"- Output folder: {out_dir}")
    print(f"- Manifest: {manifest_path}")
    print("\nControls:")
    print("  Enter: skip if already has a photo")
    print("  s    : skip")
    print("  r    : replace (force pick a new image)")
    print("  q    : quit\n")

    updated = 0
    skipped = 0

    try:
        for i, p in enumerate(places, start=1):
            key = normalize_place_key(p.name)
            if not key:
                skipped += 1
                continue

            existing = items.get(key) if isinstance(items, dict) else None
            existing_path = existing.get("path") if isinstance(existing, dict) else None

            exists_on_disk = False
            if isinstance(existing_path, str) and existing_path.startswith("/img/place-photos/"):
                disk_name = existing_path.split("/")[-1]
                exists_on_disk = (out_dir / disk_name).exists()

            has_photo = bool(existing_path) and exists_on_disk

            print(f"[{i}/{len(places)}] {p.name}  (category: {p.category})")
            print(f"  mevcut: {existing_path}" if has_photo else "  mevcut: yok")

            prompt = (
                "  [Enter]=skip, (r)eplace, (s)kip, (q)uit: "
                if has_photo
                else
                "  [Enter]=choose, (s)kip, (q)uit: "
            )
            action = input(prompt).strip().lower()

            if action == "q":
                print("\nQuit.")
                break

            if has_photo and action in ("", "s"):
                skipped += 1
                print("  -> skip (zaten var)\n")
                continue

            if action == "s":
                skipped += 1
                print("  -> skip\n")
                continue

            # Pick file
            picked = pick_file_dialog()
            if not picked:
                picked = input("  Görsel dosya yolu (jpg/png/webp) veya boş=iptal: ").strip()
            if not picked:
                skipped += 1
                print("  -> iptal/skip\n")
                continue

            src = Path(picked).expanduser().resolve()
            if not src.exists() or not src.is_file():
                print("  ERROR: Dosya bulunamadı.")
                skipped += 1
                print("")
                continue
            if not is_allowed_image(src):
                print(f"  ERROR: Desteklenmeyen uzantı: {src.suffix}")
                skipped += 1
                print("")
                continue

            filename = target_filename(key, src)
            dest = out_dir / filename

            # If existing file has different name/ext, remove it
            if isinstance(existing_path, str) and existing_path.startswith("/img/place-photos/"):
                old_name = existing_path.split("/")[-1]
                old_file = out_dir / old_name
                if old_file.exists() and old_file.name != dest.name:
                    try:
                        old_file.unlink()
                    except Exception:
                        pass

            copy_image(src, dest)

            items[key] = {
                "path": f"/img/place-photos/{dest.name}",
                "name": p.name,
                "category": p.category,
                "source": "local",
                "attribution": None,
            }
            write_manifest(manifest_path, manifest)
            updated += 1

            print(f"  -> kaydedildi: /img/place-photos/{dest.name}")
            print("  -> Sitede görmek için sayfayı yenileyin (F5).\n")

    except KeyboardInterrupt:
        print("\n\nInterrupted. Writing manifest and exiting...")

    # Ensure manifest exists even if nothing updated
    write_manifest(manifest_path, manifest)

    print("Done.")
    print(f"- Updated: {updated}")
    print(f"- Skipped: {skipped}")
    print(f"- Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
