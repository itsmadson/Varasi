"""Orchestrate a change-detection run: read -> algorithm -> mask -> polygons."""
from __future__ import annotations

from typing import Any, Optional

import numpy as np
from rasterio.features import rasterize
from shapely.geometry import mapping, shape

from .algorithms import get_algorithm
from .classify import classify
from .config import Settings
from .reader import affine_for, read_pair
from .schemas import DetectionStats, DetectRequest, DetectResponse
from .vectorize import geodesic_area_m2, polygonize


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

    algo = get_algorithm(req.algorithm)
    magnitude = algo.run(pair.before, pair.after)  # (H,W) [0,1]
    mask = magnitude >= req.threshold

    features: list[dict[str, Any]] = []
    class_area: dict[str, float] = {}
    changed_area = 0.0

    for poly in polygonize(mask, transform, req.min_area_m2):
        # Rasterize this polygon back to the window grid to sample stats.
        pmask = rasterize(
            [(mapping(poly), 1)], out_shape=(pair.height, pair.width),
            transform=transform, fill=0, dtype="uint8",
        ).astype(bool)
        if not pmask.any():
            continue
        before_mean = pair.before[:, pmask].mean(axis=1)
        after_mean = pair.after[:, pmask].mean(axis=1)
        conf_mag = float(magnitude[pmask].mean())
        label, cls_conf = classify(before_mean, after_mean)
        area = geodesic_area_m2(poly)
        changed_area += area
        class_area[label] = class_area.get(label, 0.0) + area

        features.append({
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "change_class": label,
                "confidence": round((conf_mag + cls_conf) / 2, 3),
                "magnitude": round(conf_mag, 3),
                "area_m2": round(area, 1),
                "algorithm": req.algorithm,
                "before_datetime": req.before.datetime,
                "after_datetime": req.after.datetime,
            },
        })

    valid_px = int(np.count_nonzero(algo._valid_mask(pair.before, pair.after)))
    changed_px = int(np.count_nonzero(mask))
    stats = DetectionStats(
        changed_area_m2=round(changed_area, 1),
        changed_fraction=round(changed_px / valid_px, 4) if valid_px else 0.0,
        polygon_count=len(features),
        algorithm=req.algorithm,
        class_breakdown={k: round(v, 1) for k, v in class_area.items()},
    )
    return DetectResponse(features=features, stats=stats)
