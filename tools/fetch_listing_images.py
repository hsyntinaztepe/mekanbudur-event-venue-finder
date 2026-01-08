#!/usr/bin/env python3
"""Fetch and cache per-listing images into Web wwwroot.

Why this exists:
- Scraping Google Images directly is not reliable and may violate terms.
- This script instead uses open sources (Wikimedia Commons, Openverse) and
  writes images under src/Web/wwwroot/img/listing-photos/ so the site can use
  them without any API keys.

What it does:
1) Calls the local API to get /api/listings (real listing titles/locations)
2) For each listing, searches for an open image
3) Downloads 1 image, saves it as <listingId>.<ext>
4) Writes manifest.json mapping listingId -> relativePath + attribution

Usage (PowerShell):
  python .\tools\fetch_listing_images.py

Optional env vars:
  API_BASE=http://localhost:8081
  WEB_WWWROOT=src/Web/wwwroot
  LIMIT=200
  FORCE=0  (set to 1 to re-download even if already present)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_BASE = os.environ.get("API_BASE", "http://localhost:8081").rstrip("/")
WEB_WWWROOT = Path(os.environ.get("WEB_WWWROOT", "src/Web/wwwroot")).resolve()
OUT_DIR = WEB_WWWROOT / "img" / "listing-photos"
MANIFEST_PATH = OUT_DIR / "manifest.json"
LIMIT = int(os.environ.get("LIMIT", "200"))
FORCE = os.environ.get("FORCE", "0") == "1"

USER_AGENT = "MekanBudurImageFetcher/1.0 (+local dev script)"


@dataclass
class ImageCandidate:
    url: str
    attribution: str
    source: str


def http_get_json(url: str, timeout_sec: int = 20) -> Any:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=timeout_sec) as resp:
        data = resp.read()
    return json.loads(data.decode("utf-8"))


def http_get_bytes(url: str, timeout_sec: int = 30) -> Tuple[bytes, str]:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout_sec) as resp:
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.read(), content_type


def safe_slug(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text


def commons_search_first_image(query: str) -> Optional[ImageCandidate]:
    # Search in File namespace (6) on Wikimedia Commons
    base = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srnamespace": "6",
        "srlimit": "1",
        "srsearch": query,
    }
    search = http_get_json(f"{base}?{urlencode(params)}")
    items = (search.get("query") or {}).get("search") or []
    if not items:
        return None

    title = items[0].get("title")
    if not title:
        return None

    params2 = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "titles": title,
    }
    info = http_get_json(f"{base}?{urlencode(params2)}")
    pages = (info.get("query") or {}).get("pages") or {}
    page = next(iter(pages.values()), None)
    if not page:
        return None

    imageinfo = (page.get("imageinfo") or [])
    if not imageinfo:
        return None

    ii = imageinfo[0]
    url = ii.get("url")
    if not url:
        return None

    # Basic attribution
    meta = ii.get("extmetadata") or {}
    artist = (meta.get("Artist") or {}).get("value")
    license_short = (meta.get("LicenseShortName") or {}).get("value")
    attribution = f"Wikimedia Commons: {title}"
    if artist or license_short:
        parts = ["Wikimedia Commons", title]
        if artist:
            parts.append(f"Artist: {strip_html(artist)}")
        if license_short:
            parts.append(f"License: {strip_html(license_short)}")
        attribution = " | ".join(parts)

    return ImageCandidate(url=url, attribution=attribution, source="commons")


def openverse_search_first_image(query: str) -> Optional[ImageCandidate]:
    base = "https://api.openverse.engineering/v1/images/"
    params = {
        "q": query,
        "page_size": "1",
        "license_type": "commercial",  # safest default for app usage
    }
    data = http_get_json(f"{base}?{urlencode(params)}")
    results = data.get("results") or []
    if not results:
        return None

    r0 = results[0]
    url = r0.get("url") or r0.get("thumbnail")
    if not url:
        return None

    creator = r0.get("creator")
    license_ = r0.get("license")
    source = r0.get("source") or "Openverse"
    attribution = f"Openverse | {source}"
    if creator or license_:
        parts = ["Openverse", source]
        if creator:
            parts.append(f"Creator: {creator}")
        if license_:
            parts.append(f"License: {license_}")
        attribution = " | ".join(parts)

    return ImageCandidate(url=url, attribution=attribution, source="openverse")


def strip_html(s: str) -> str:
    # Minimal HTML strip; Commons returns values containing tags.
    return re.sub(r"<[^>]+>", "", s or "").strip()


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

    # Fall back to url suffix
    m = re.search(r"\.(jpg|jpeg|png|webp|gif)(?:\?|$)", url, flags=re.IGNORECASE)
    if m:
        ext = m.group(1).lower()
        return ".jpg" if ext == "jpeg" else f".{ext}"

    return ".jpg"


def build_queries(title: str, location: Optional[str]) -> list[str]:
    t = safe_slug(title)
    loc = safe_slug(location or "")

    # A couple of variants; simplest-first.
    q1 = f"{t} {loc}".strip()
    q2 = f"{t} mekan foto".strip()
    q3 = f"{t} {loc} dış görünüş".strip()

    # Dedup while keeping order
    out: list[str] = []
    for q in [q1, q2, q3]:
        if q and q not in out:
            out.append(q)
    return out


def fetch_listings() -> list[Dict[str, Any]]:
    url = f"{API_BASE}/api/listings"
    data = http_get_json(url)
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected /api/listings response: {type(data)}")
    return data[:LIMIT]


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"API_BASE={API_BASE}")
    print(f"WEB_WWWROOT={WEB_WWWROOT}")
    print(f"OUT_DIR={OUT_DIR}")

    listings = fetch_listings()
    print(f"Found {len(listings)} listings")

    manifest: Dict[str, Any] = {
        "generatedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "apiBase": API_BASE,
        "items": {}
    }

    for idx, l in enumerate(listings, start=1):
        listing_id = str(l.get("id") or l.get("Id") or "").strip()
        title = str(l.get("title") or l.get("Title") or "").strip()
        location = l.get("location") or l.get("Location")

        if not listing_id or not title:
            continue

        # Skip if already present (any extension)
        existing = next(iter(OUT_DIR.glob(f"{listing_id}.*")), None)
        if existing and not FORCE:
            rel = existing.relative_to(WEB_WWWROOT).as_posix()
            manifest["items"][listing_id] = {
                "path": "/" + rel,
                "title": title,
                "location": location,
                "source": "local",
                "attribution": None,
            }
            continue

        queries = build_queries(title, str(location) if location is not None else None)

        candidate: Optional[ImageCandidate] = None
        for q in queries:
            try:
                candidate = commons_search_first_image(q)
                if candidate:
                    break
            except Exception as ex:
                print(f"[{idx}/{len(listings)}] commons search failed for '{q}': {ex}")

        if not candidate:
            for q in queries:
                try:
                    candidate = openverse_search_first_image(q)
                    if candidate:
                        break
                except Exception as ex:
                    print(f"[{idx}/{len(listings)}] openverse search failed for '{q}': {ex}")

        if not candidate:
            print(f"[{idx}/{len(listings)}] No image found for '{title}'")
            manifest["items"][listing_id] = {
                "path": None,
                "title": title,
                "location": location,
                "source": None,
                "attribution": None,
            }
            continue

        try:
            img_bytes, content_type = http_get_bytes(candidate.url)
            ext = guess_extension(content_type, candidate.url)

            out_path = OUT_DIR / f"{listing_id}{ext}"
            out_path.write_bytes(img_bytes)

            rel = out_path.relative_to(WEB_WWWROOT).as_posix()
            manifest["items"][listing_id] = {
                "path": "/" + rel,
                "title": title,
                "location": location,
                "source": candidate.source,
                "attribution": candidate.attribution,
                "contentType": content_type,
                "url": candidate.url,
            }

            print(f"[{idx}/{len(listings)}] Saved {title} -> {out_path.name} ({candidate.source})")
        except Exception as ex:
            print(f"[{idx}/{len(listings)}] Download failed for '{title}': {ex}")
            manifest["items"][listing_id] = {
                "path": None,
                "title": title,
                "location": location,
                "source": candidate.source,
                "attribution": candidate.attribution,
                "error": str(ex),
            }

        # Be polite to public APIs
        time.sleep(0.2)

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote manifest: {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
