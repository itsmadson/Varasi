"""Windowed, aligned reads of a before/after COG pair over an AOI."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx
import numpy as np
from rasterio.env import Env
from rasterio.transform import from_bounds
from rio_tiler.io import Reader

from .config import GDAL_ENV, Settings
from .schemas import SceneRef


@dataclass
class Pair:
    before: np.ndarray  # (bands, H, W) float32
    after: np.ndarray
    bbox: tuple[float, float, float, float]  # lon/lat 4326
    width: int
    height: int


def resolve_uri(ref: SceneRef, cfg: Settings) -> str:
    """Resolve a SceneRef to a readable raster URI (direct or via STAC asset)."""
    if ref.uri:
        return ref.uri
    if not (ref.collection and ref.item_id):
        raise ValueError("SceneRef needs uri, or collection+item_id")
    url = f"{cfg.stac_url}/collections/{ref.collection}/items/{ref.item_id}"
    r = httpx.get(url, timeout=cfg.request_timeout)
    r.raise_for_status()
    assets = r.json()["assets"]
    asset = assets.get("data") or next(iter(assets.values()))
    return asset["href"]


def _size_for(bbox: tuple[float, float, float, float], max_size: int) -> tuple[int, int]:
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    if w >= h:
        width = max_size
        height = max(1, round(max_size * h / w))
    else:
        height = max_size
        width = max(1, round(max_size * w / h))
    return width, height


def _read_one(uri: str, bbox, width, height, cfg: Settings) -> np.ndarray:
    with Env(**GDAL_ENV), Reader(uri) as src:
        img = src.part(
            bbox, dst_crs="EPSG:4326", bounds_crs="EPSG:4326",
            width=width, height=height, indexes=None,
        )
    # up to 3 bands, float32
    data = img.data.astype("float32")
    if data.shape[0] > 3:
        data = data[:3]
    return data


def read_pair(before: SceneRef, after: SceneRef, aoi_bbox, cfg: Optional[Settings] = None) -> Pair:
    cfg = cfg or Settings()
    width, height = _size_for(aoi_bbox, cfg.max_size)
    b_uri = resolve_uri(before, cfg)
    a_uri = resolve_uri(after, cfg)
    b = _read_one(b_uri, aoi_bbox, width, height, cfg)
    a = _read_one(a_uri, aoi_bbox, width, height, cfg)
    # Align band count.
    n = min(b.shape[0], a.shape[0])
    return Pair(before=b[:n], after=a[:n], bbox=tuple(aoi_bbox), width=width, height=height)


def affine_for(pair: Pair):
    """Pixel->lon/lat affine for the read window."""
    return from_bounds(*pair.bbox, pair.width, pair.height)
