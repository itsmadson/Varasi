from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class SceneRef(BaseModel):
    """A raster to compare: either a direct COG URI, or a STAC item id."""

    uri: Optional[str] = None
    collection: Optional[str] = None
    item_id: Optional[str] = None
    datetime: Optional[str] = None


class DetectRequest(BaseModel):
    before: SceneRef
    after: SceneRef
    # AOI as GeoJSON geometry (Polygon/MultiPolygon) in EPSG:4326. Optional:
    # if omitted, the overlap of the two scenes is used.
    aoi: Optional[dict[str, Any]] = None
    algorithm: str = "image_diff"
    threshold: float = Field(0.35, ge=0.0, le=1.0)
    min_area_m2: float = Field(2000.0, ge=0.0)


class DetectionStats(BaseModel):
    changed_area_m2: float
    changed_fraction: float
    polygon_count: int
    algorithm: str
    class_breakdown: dict[str, float]


class DetectResponse(BaseModel):
    type: str = "FeatureCollection"
    features: list[dict[str, Any]]
    stats: DetectionStats
