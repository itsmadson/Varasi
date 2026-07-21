"""Build a Raster Profile (STAC Item) from a raster reference.

Uses rio-stac to extract geometry, bbox, projection, raster bands and EO metadata
directly from the raster header (windowed header read only — no full download),
then enriches with Varasi-specific fields.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any, Optional

import rasterio
from rasterio.env import Env
from rio_stac.stac import create_stac_item

from .providers.base import RasterRef

# STAC extensions rio-stac can populate from the raster header.
# The API validates stac_extensions as full schema URLs, not short names.
_EXTENSIONS = [
    "https://stac-extensions.github.io/projection/v1.1.0/schema.json",
    "https://stac-extensions.github.io/raster/v1.1.0/schema.json",
    "https://stac-extensions.github.io/eo/v1.1.0/schema.json",
]


def _stable_id(href: str) -> str:
    base = os.path.splitext(os.path.basename(href.rstrip("/")))[0]
    digest = hashlib.sha1(href.encode()).hexdigest()[:8]
    return f"{base}-{digest}" if base else digest


def build_profile(
    ref: RasterRef,
    collection: str,
    *,
    datetime_str: Optional[str] = None,
    properties: Optional[dict[str, Any]] = None,
    asset_href: Optional[str] = None,
) -> dict[str, Any]:
    """Return a STAC Item dict for one raster. Reads header metadata only."""
    props: dict[str, Any] = dict(properties or {})

    dt: Optional[datetime] = None
    if datetime_str:
        from dateutil import parser as dtparser

        dt = dtparser.parse(datetime_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

    with Env(**ref.env):
        item = create_stac_item(
            ref.gdal_path,
            input_datetime=dt,
            extensions=_EXTENSIONS,
            collection=collection,
            with_proj=True,
            with_raster=True,
            with_eo=True,
            properties=props,
            asset_name="data",
            asset_href=asset_href or ref.href,
            asset_media_type="image/tiff; application=geotiff; profile=cloud-optimized",
            id=_stable_id(ref.href),
        )
    item_dict = item.to_dict()
    item_dict["assets"]["data"]["roles"] = ["data"]

    # Varasi provenance stamp.
    item_dict["properties"].setdefault("varasi:source_uri", ref.href)
    item_dict["properties"]["varasi:ingested"] = datetime.now(timezone.utc).isoformat()
    if not item_dict["properties"].get("datetime") and dt is None:
        item_dict["properties"]["datetime"] = datetime.now(timezone.utc).isoformat()
    return item_dict


def read_overview_stats(ref: RasterRef) -> dict[str, Any]:
    """Quick header facts (width/height/bands/crs/overviews) without full read."""
    with Env(**ref.env), rasterio.open(ref.gdal_path) as src:
        return {
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "crs": str(src.crs),
            "dtype": src.dtypes[0],
            "overviews": src.overviews(1),
            "is_cog": bool(src.overviews(1)) and src.is_tiled,
        }
