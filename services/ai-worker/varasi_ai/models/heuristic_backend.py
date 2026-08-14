"""Heuristic backend (runtime=index, always available).

Wraps the existing sensor-agnostic engine — multi-band image-diff magnitude plus
the transparent standard/urban rule classifiers — behind the ModelBackend
contract. This is the universal floor: zero weights, zero GPU, works everywhere,
and is the fallback target when a requested GPU/cloud model is unavailable.
"""
from __future__ import annotations

from typing import Any

from rasterio.features import rasterize
from shapely.geometry import mapping

from ..algorithms import get_algorithm
from ..classify import classify
from ..urban import classify_urban
from ..vectorize import geodesic_area_m2, polygonize
from .base import ModelBackend, RunParams


class HeuristicBackend(ModelBackend):
    name = "heuristic"
    title = "Heuristic (image-diff + rules)"
    tags = [
        "urban_growth", "vegetation_loss", "vegetation_gain", "water_change",
        "bare_soil", "unknown",
        "excavation", "earthworks_fill", "new_construction", "building_demolition",
        "paving", "soil_sealing",
    ]
    paradigm = "bitemporal"
    runtime = "index"
    rank = 30

    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        urban = params.extra.get("classifier") == "urban"
        algo = get_algorithm(params.extra.get("algorithm", "image_diff"))
        magnitude = algo.run(pair.before, pair.after)
        mask = magnitude >= params.threshold

        feats: list[dict[str, Any]] = []
        for poly in polygonize(mask, transform, params.min_area_m2):
            pm = rasterize([(mapping(poly), 1)], out_shape=(pair.height, pair.width),
                           transform=transform, fill=0, dtype="uint8").astype(bool)
            if not pm.any():
                continue
            bmean = pair.before[:, pm].mean(axis=1)
            amean = pair.after[:, pm].mean(axis=1)
            conf_mag = float(magnitude[pm].mean())
            extra: dict[str, Any] = {}
            if urban:
                label, cconf, extra = classify_urban(bmean, amean)
            else:
                label, cconf = classify(bmean, amean)
            props = {
                "change_class": label,
                "confidence": round((conf_mag + cconf) / 2, 3),
                "magnitude": round(conf_mag, 3),
                "area_m2": round(geodesic_area_m2(poly), 1),
            }
            props.update(extra)
            feats.append({"type": "Feature", "geometry": mapping(poly), "properties": props})
        return feats
