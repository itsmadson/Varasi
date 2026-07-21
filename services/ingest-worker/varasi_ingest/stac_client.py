"""Thin client for the stac-fastapi-pgstac transactions API."""
from __future__ import annotations

from typing import Any

import httpx

from .config import Settings


class StacClient:
    def __init__(self, cfg: Settings):
        self.base = cfg.stac_url.rstrip("/")
        self.http = httpx.Client(timeout=cfg.request_timeout)

    def close(self) -> None:
        self.http.close()

    # --- collections (Virtual Datasets) ---
    def collection_exists(self, cid: str) -> bool:
        r = self.http.get(f"{self.base}/collections/{cid}")
        return r.status_code == 200

    def upsert_collection(self, collection: dict[str, Any]) -> None:
        cid = collection["id"]
        if self.collection_exists(cid):
            r = self.http.put(f"{self.base}/collections/{cid}", json=collection)
        else:
            r = self.http.post(f"{self.base}/collections", json=collection)
        r.raise_for_status()

    # --- items (Raster Profiles) ---
    def upsert_item(self, collection: str, item: dict[str, Any]) -> None:
        iid = item["id"]
        url = f"{self.base}/collections/{collection}/items"
        r = self.http.post(url, json=item)
        if r.status_code == 409:  # already exists -> update
            r = self.http.put(f"{url}/{iid}", json=item)
        if r.status_code >= 400:
            raise RuntimeError(f"{r.status_code} {r.text[:500]}")

    def search_count(self, collection: str) -> int:
        r = self.http.post(
            f"{self.base}/search",
            json={"collections": [collection], "limit": 1},
        )
        r.raise_for_status()
        return r.json().get("numberMatched", 0)
