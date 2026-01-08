#!/usr/bin/env python3
"""Fetch and cache images for the hardcoded Gölbaşı place lists in app.js.

This is the "get me out of the API" path:
- Reads place names from src/Web/wwwroot/js/app.js (GOLBASI_PLACES, PHOTOGRAPHERS, etc.)
- Finds a best-effort open-licensed image (Wikimedia Commons then Openverse)
- Downloads one image per place
- Writes a manifest used by the website at /img/place-photos/manifest.json

Why not Google Images:
- Scraping Google Images directly is unreliable and violates terms; it also risks copyright issues.
- Commons/Openverse are designed for reuse with attribution.

Usage:
  python .\tools\fetch_place_images.py

Env vars:
  APP_JS=src/Web/wwwroot/js/app.js
  WEB_WWWROOT=src/Web/wwwroot
  FORCE=0  (1 re-download)
  LIMIT=999
"""

from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

USER_AGENT = "MekanBudurPlaceImageFetcher/1.0 (+local dev script)"

APP_JS = Path(os.environ.get("APP_JS", "src/Web/wwwroot/js/app.js")).resolve()
WEB_WWWROOT = Path(os.environ.get("WEB_WWWROOT", "src/Web/wwwroot")).resolve()
OUT_DIR = WEB_WWWROOT / "img" / "place-photos"
MANIFEST_PATH = OUT_DIR / "manifest.json"
FORCE = os.environ.get("FORCE", "0") == "1"
LIMIT = int(os.environ.get("LIMIT", "999"))
OVERRIDES_PATH = Path(os.environ.get("OVERRIDES", "tools/place_image_overrides.json")).resolve()
SLEEP_SEC = float(os.environ.get("SLEEP_SEC", "0.8"))


@dataclass
class Place:
    name: str
    category: str


@dataclass
class ImageCandidate:
    url: str
    attribution: str
    source: str


def http_get_json(url: str, timeout_sec: int = 25) -> Any:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=timeout_sec) as resp:
        data = resp.read()
    return json.loads(data.decode("utf-8"))


def http_get_bytes(url: str, timeout_sec: int = 40) -> Tuple[bytes, str]:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout_sec) as resp:
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.read(), content_type


def http_get_bytes_with_retry(url: str, timeout_sec: int = 40, retries: int = 3) -> Tuple[bytes, str]:
    # Be polite to public services (Commons/Openverse). Handle 429 with backoff.
    backoff = [2.0, 6.0, 12.0]
    last_ex: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return http_get_bytes(url, timeout_sec=timeout_sec)
        except HTTPError as ex:
            last_ex = ex
            if getattr(ex, "code", None) == 429 and attempt < retries:
                wait = backoff[min(attempt, len(backoff) - 1)]
                time.sleep(wait)
                continue
            raise
        except Exception as ex:
            last_ex = ex
            if attempt < retries:
                time.sleep(1.0 + attempt)
                continue
            raise
    assert last_ex is not None
    raise last_ex


def strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


def normalize_text_for_match(s: str) -> str:
    s = (s or "").strip().lower()
    s = (s
         .replace("ı", "i")
         .replace("ş", "s")
         .replace("ğ", "g")
         .replace("ü", "u")
         .replace("ö", "o")
         .replace("ç", "c"))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


STOP_TOKENS: set[str] = {
    # generic business words
    "dugun", "dugunu", "dugun-salonu", "salon", "salonu", "salonlari", "balo", "kir", "bahcesi", "bahcesi",
    "wedding", "hall", "event", "events", "plaza", "park", "life", "elite", "lux", "luxe",
    "cafe", "pastane", "pastanesi", "firin", "pasta", "ekler", "ekleristan",
    "cicek", "cicekcilik", "cicekci", "orkide",
    "foto", "fotograf", "fotografcilik", "studyo", "stüdyo", "studio", "medya", "film",
    # location words
    "golbasi", "golbasi", "ankara",
}


def tokenize_for_match(s: str) -> list[str]:
    s2 = normalize_text_for_match(s)
    tokens = [t for t in s2.split(" ") if t and len(t) > 1]
    out: list[str] = []
    for t in tokens:
        if t in STOP_TOKENS:
            continue
        out.append(t)
    return out


def token_overlap_score(query_name: str, candidate_title: str) -> float:
    q = set(tokenize_for_match(query_name))
    c = set(tokenize_for_match(candidate_title))
    if not q or not c:
        return 0.0
    inter = len(q & c)
    union = len(q | c)
    if union == 0:
        return 0.0
    return inter / union


def normalize_place_key(name: str) -> str:
    # Must match the JS-side normalization
    s = (name or "").strip().lower()

    # Turkish specific
    s = (s
         .replace("ı", "i")
         .replace("İ".lower(), "i")
         .replace("ş", "s")
         .replace("ğ", "g")
         .replace("ü", "u")
         .replace("ö", "o")
         .replace("ç", "c"))

    # Remove diacritics (just in case)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))

    # Keep alnum, collapse others
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def guess_extension(content_type: str, url: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct == "image/jpeg":
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    if ct == "image/gif":
        return ".gif"

    m = re.search(r"\.(jpg|jpeg|png|webp|gif)(?:\?|$)", url, flags=re.IGNORECASE)
    if m:
        ext = m.group(1).lower()
        return ".jpg" if ext == "jpeg" else f".{ext}"

    return ".jpg"


def commons_search_best_image(query_name: str, query: str) -> Optional[ImageCandidate]:
    base = "https://commons.wikimedia.org/w/api.php"

    # Single API call: generator=search + prop=imageinfo
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrnamespace": "6",
        "gsrlimit": "10",
        "gsrsearch": query,
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
    }
    data = http_get_json(f"{base}?{urlencode(params)}")
    pages = (data.get("query") or {}).get("pages") or {}

    best: tuple[float, ImageCandidate] | None = None
    for page in pages.values():
        title = page.get("title")
        if not title:
            continue
        imageinfo = (page.get("imageinfo") or [])
        if not imageinfo:
            continue
        ii = imageinfo[0]
        url = ii.get("url")
        if not url:
            continue

        meta = ii.get("extmetadata") or {}
        artist = (meta.get("Artist") or {}).get("value")
        license_short = (meta.get("LicenseShortName") or {}).get("value")

        parts = ["Wikimedia Commons", title]
        if artist:
            parts.append(f"Artist: {strip_html(artist)}")
        if license_short:
            parts.append(f"License: {strip_html(license_short)}")

        score = token_overlap_score(query_name, title)
        cand = ImageCandidate(url=url, attribution=" | ".join(parts), source="commons")
        if best is None or score > best[0]:
            best = (score, cand)

    return best[1] if best else None


def openverse_search_best_image(query_name: str, query: str) -> Optional[ImageCandidate]:
    base = "https://api.openverse.engineering/v1/images/"
    params = {
        "q": query,
        "page_size": "20",
        # broaden to increase hit rate; still open-licensed/attributed by Openverse
        "license_type": "all",
    }
    data = http_get_json(f"{base}?{urlencode(params)}")
    results = data.get("results") or []
    if not results:
        return None

    best: tuple[float, ImageCandidate] | None = None
    for r in results:
        url = r.get("url") or r.get("thumbnail")
        if not url:
            continue

        title = r.get("title") or ""
        creator = r.get("creator")
        license_ = r.get("license")
        source = r.get("source") or "Openverse"

        parts = ["Openverse", source]
        if title:
            parts.append(f"Title: {title}")
        if creator:
            parts.append(f"Creator: {creator}")
        if license_:
            parts.append(f"License: {license_}")

        score = token_overlap_score(query_name, title)
        cand = ImageCandidate(url=url, attribution=" | ".join(parts), source="openverse")
        if best is None or score > best[0]:
            best = (score, cand)

    return best[1] if best else None


def parse_places_from_appjs(text: str) -> list[Place]:
    # Extract all occurrences of: { name: "...", ... category: "..." }
    # within the known const lists.
    blocks: list[str] = []
    for const_name in ["GOLBASI_PLACES", "PHOTOGRAPHERS", "BAKERIES", "FLORISTS"]:
        m = re.search(rf"const\s+{re.escape(const_name)}\s*=\s*\[(.*?)\];", text, flags=re.DOTALL)
        if m:
            blocks.append(m.group(1))

    places: list[Place] = []
    for b in blocks:
        for mm in re.finditer(r"\{[^\}]*?name\s*:\s*\"([^\"]+)\"[^\}]*?category\s*:\s*\"([^\"]+)\"[^\}]*?\}", b, flags=re.DOTALL):
            name = mm.group(1).strip()
            cat = mm.group(2).strip()
            if name and cat:
                places.append(Place(name=name, category=cat))

    # de-dup by normalized key
    seen: set[str] = set()
    uniq: list[Place] = []
    for p in places:
        k = normalize_place_key(p.name)
        if k and k not in seen:
            seen.add(k)
            uniq.append(p)

    return uniq


def build_queries(name: str, category: str) -> list[str]:
    base = name.strip()
    base_norm = normalize_text_for_match(base)

    # remove very common suffixes/prefixes to widen search
    simplified = base_norm
    for w in [
        "dugun salonu", "balo salonu", "balo salonlari", "kir bahcesi", "wedding", "event", "events",
        "pastanesi", "pastane", "firin", "cafe", "cicekcilik", "cicekci", "fotograf", "foto",
        "golbasi", "ankara",
    ]:
        simplified = simplified.replace(w, " ")
    simplified = re.sub(r"\s+", " ", simplified).strip()

    # Queries: start specific, then broaden
    out: list[str] = []
    candidates = [
        f"intitle:{base}",
        f'"{base}"',
        f"{base} Gölbaşı Ankara",
        f"{base} Golbasi Ankara",
        f"{base} {category}",
        f"{base} mekan",
    ]
    if simplified and simplified != base_norm and simplified.lower() != base.lower():
        candidates.extend([
            f"intitle:{simplified}",
            f'"{simplified}"',
            f"{simplified} Golbasi Ankara",
        ])

    for q in candidates:
        q = (q or "").strip()
        if q and q not in out:
            out.append(q)
    return out


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not APP_JS.exists():
        raise SystemExit(f"app.js not found: {APP_JS}")

    text = APP_JS.read_text(encoding="utf-8")
    places = parse_places_from_appjs(text)[:LIMIT]

    print(f"APP_JS={APP_JS}")
    print(f"OUT_DIR={OUT_DIR}")
    print(f"Found {len(places)} places")

    overrides: Dict[str, Any] = {}
    if OVERRIDES_PATH.exists():
        try:
            overrides = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")) or {}
        except Exception as ex:
            print(f"Overrides read failed ({OVERRIDES_PATH}): {ex}")
            overrides = {}

    manifest: Dict[str, Any] = {
        "generatedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "items": {}
    }

    for idx, p in enumerate(places, start=1):
        key = normalize_place_key(p.name)
        if not key:
            continue

        if isinstance(overrides, dict) and key in overrides and overrides[key]:
            override_url = str(overrides[key]).strip()
            if override_url:
                try:
                    img_bytes, content_type = http_get_bytes(override_url)
                    ext = guess_extension(content_type, override_url)
                    out_path = OUT_DIR / f"{key}{ext}"
                    out_path.write_bytes(img_bytes)
                    rel = out_path.relative_to(WEB_WWWROOT).as_posix()
                    manifest["items"][key] = {
                        "path": "/" + rel,
                        "name": p.name,
                        "category": p.category,
                        "source": "override",
                        "attribution": "Provided by overrides",
                        "contentType": content_type,
                        "url": override_url,
                    }
                    print(f"[{idx}/{len(places)}] Saved (override) {p.name} -> {out_path.name}")
                    time.sleep(0.1)
                    continue
                except Exception as ex:
                    print(f"[{idx}/{len(places)}] Override download failed for '{p.name}': {ex}")

        existing = next(iter(OUT_DIR.glob(f"{key}.*")), None)
        if existing and not FORCE:
            rel = existing.relative_to(WEB_WWWROOT).as_posix()
            manifest["items"][key] = {
                "path": "/" + rel,
                "name": p.name,
                "category": p.category,
                "source": "local",
                "attribution": None,
            }
            continue

        queries = build_queries(p.name, p.category)
        candidate: Optional[ImageCandidate] = None

        for q in queries:
            try:
                candidate = commons_search_best_image(p.name, q)
                if candidate:
                    break
            except Exception as ex:
                print(f"[{idx}/{len(places)}] commons search failed for '{q}': {ex}")

        if not candidate:
            for q in queries:
                try:
                    candidate = openverse_search_best_image(p.name, q)
                    if candidate:
                        break
                except Exception as ex:
                    print(f"[{idx}/{len(places)}] openverse search failed for '{q}': {ex}")

        if not candidate:
            print(f"[{idx}/{len(places)}] No image found for '{p.name}'")
            manifest["items"][key] = {
                "path": None,
                "name": p.name,
                "category": p.category,
                "source": None,
                "attribution": None,
            }
            continue

        try:
            img_bytes, content_type = http_get_bytes_with_retry(candidate.url)
            ext = guess_extension(content_type, candidate.url)

            out_path = OUT_DIR / f"{key}{ext}"
            out_path.write_bytes(img_bytes)

            rel = out_path.relative_to(WEB_WWWROOT).as_posix()
            manifest["items"][key] = {
                "path": "/" + rel,
                "name": p.name,
                "category": p.category,
                "source": candidate.source,
                "attribution": candidate.attribution,
                "contentType": content_type,
                "url": candidate.url,
            }

            print(f"[{idx}/{len(places)}] Saved {p.name} -> {out_path.name} ({candidate.source})")
        except Exception as ex:
            print(f"[{idx}/{len(places)}] Download failed for '{p.name}': {ex}")
            manifest["items"][key] = {
                "path": None,
                "name": p.name,
                "category": p.category,
                "source": candidate.source,
                "attribution": candidate.attribution,
                "error": str(ex),
            }

        time.sleep(SLEEP_SEC)

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote manifest: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
