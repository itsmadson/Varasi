"""Ingestion pipeline: source URI -> STAC Items in pgSTAC.

Metadata-first: reads only raster headers, generates a best-effort thumbnail,
and registers the Item. Source pixels are never copied into Varasi.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from .collections import make_collection
from .config import Settings
from .profile import build_profile
from .providers import get_provider
from .stac_client import StacClient
from .thumbnails import make_thumbnail


@dataclass
class IngestResult:
    collection: str
    ingested: int
    failed: int
    errors: list[str]


def ingest_source(
    uri: str,
    collection: str,
    *,
    cfg: Optional[Settings] = None,
    datetime_str: Optional[str] = None,
    properties: Optional[dict[str, Any]] = None,
    with_thumbnail: bool = True,
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> IngestResult:
    cfg = cfg or Settings()
    client = StacClient(cfg)
    log = on_progress or (lambda level, msg: None)

    client.upsert_collection(make_collection(collection))
    log("info", f"collection '{collection}' ready")

    provider = get_provider(uri)
    ingested = failed = 0
    errors: list[str] = []

    for ref in provider.list(uri):
        try:
            item = build_profile(
                ref,
                collection,
                datetime_str=datetime_str,
                properties=properties,
            )
            if with_thumbnail:
                thumb = make_thumbnail(ref, item["id"], cfg)
                if thumb:
                    item["assets"]["thumbnail"] = {
                        "href": thumb,
                        "type": "image/png",
                        "roles": ["thumbnail", "overview"],
                        "title": "Quicklook",
                    }
            client.upsert_item(collection, item)
            ingested += 1
            log("ok", f"ingested {item['id']}")
            _notify_control_plane(cfg, item, log)
        except Exception as exc:  # keep going; report per-item failures
            failed += 1
            msg = f"{ref.href}: {exc}"
            errors.append(msg)
            log("error", msg)

    client.close()
    return IngestResult(collection, ingested, failed, errors)


def _notify_control_plane(cfg: Settings, item: dict[str, Any], log) -> None:
    """Best-effort: tell the control-plane a new footprint landed (auto-CD trigger)."""
    if not cfg.control_url or not item.get("geometry"):
        return
    import httpx

    try:
        httpx.post(
            f"{cfg.control_url.rstrip('/')}/internal/events/item-ingested",
            json={"geometry": item["geometry"]},
            headers={"X-Internal-Token": cfg.internal_token},
            timeout=10.0,
        )
    except Exception as exc:  # never fail ingestion over a notify
        log("info", f"control-plane notify skipped: {exc}")
