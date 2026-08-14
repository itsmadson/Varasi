"""Orchestrate a change-detection run: read → route to model backend(s) → fuse."""
from __future__ import annotations

from typing import Optional

from shapely.geometry import shape

from .config import Settings
from .models import RunParams, route_and_run
from .models.router import CATEGORY_TAGS
from .reader import affine_for, read_pair
from .schemas import DetectionStats, DetectRequest, DetectResponse
from .urban import urban_rollup
from .vectorize import geodesic_area_m2

_CONSTRUCTION = set(CATEGORY_TAGS["construction"])


def _aoi_bbox(req: DetectRequest, cfg: Settings) -> tuple[float, float, float, float]:
    if req.aoi:
        geom = shape(req.aoi)
        return tuple(geom.bounds)  # type: ignore[return-value]
    raise ValueError("aoi geometry is required (bbox derivation from scenes TBD)")


def run_detection(req: DetectRequest, cfg: Optional[Settings] = None) -> DetectResponse:
    cfg = cfg or Settings()
    bbox = _aoi_bbox(req, cfg)
    pair = read_pair(req.before, req.after, bbox, cfg)
    transform = affine_for(pair)

    params = RunParams(
        threshold=req.threshold, min_area_m2=req.min_area_m2,
        allow_cloud=req.allow_cloud, tags=req.tags, prompt=req.prompt,
        extra={"algorithm": req.algorithm},
    )
    features, provenance = route_and_run(
        pair, transform, tags=req.tags, models=req.models,
        params=params, classifier=req.classifier,
    )

    # Stamp acquisition dates; aggregate stats.
    class_area: dict[str, float] = {}
    changed_area = 0.0
    for f in features:
        p = f["properties"]
        p.setdefault("before_datetime", req.before.datetime)
        p.setdefault("after_datetime", req.after.datetime)
        a = float(p.get("area_m2", 0.0))
        changed_area += a
        c = p.get("change_class", "unknown")
        class_area[c] = class_area.get(c, 0.0) + a

    aoi_area = geodesic_area_m2(shape(req.aoi)) if req.aoi else 0.0
    stats = DetectionStats(
        changed_area_m2=round(changed_area, 1),
        changed_fraction=round(changed_area / aoi_area, 4) if aoi_area else 0.0,
        polygon_count=len(features),
        algorithm=req.algorithm,
        class_breakdown={k: round(v, 1) for k, v in class_area.items()},
    )
    urban_present = req.classifier == "urban" or any(c in _CONSTRUCTION for c in class_area)
    urban = urban_rollup(features) if urban_present else None
    return DetectResponse(features=features, stats=stats, urban=urban, provenance=provenance)
