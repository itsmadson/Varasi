"""Spectral-index change backends (paradigm=index, runtime=index).

Cheap, CPU-only, no weights, no network. Compute a vegetation/water/built-up
index on both dates, threshold the delta, polygonize. Works on plain RGB via VARI;
full NDVI/NDWI/NDBI activate automatically when the raster carries NIR/SWIR bands.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from rasterio.features import rasterize
from shapely.geometry import mapping

from ..vectorize import geodesic_area_m2, polygonize
from .base import ModelBackend, RunParams


def _vari(a: np.ndarray) -> np.ndarray:
    r, g, b = a[0], a[1], a[2]
    denom = g + r - b
    return np.where(np.abs(denom) > 1e-3, (g - r) / (denom + 1e-6), 0.0)


def _ndvi(a: np.ndarray) -> np.ndarray:
    red, nir = a[0], a[3]
    return (nir - red) / (nir + red + 1e-6)


def _polys_from_delta(delta, mask, transform, params, pos_cls, neg_cls, k):
    feats: list[dict[str, Any]] = []
    for poly in polygonize(mask, transform, params.min_area_m2):
        pm = rasterize([(mapping(poly), 1)], out_shape=mask.shape, transform=transform,
                       fill=0, dtype="uint8").astype(bool)
        if not pm.any():
            continue
        d = float(delta[pm].mean())
        cls = pos_cls if d >= 0 else neg_cls
        area = geodesic_area_m2(poly)
        feats.append({
            "type": "Feature", "geometry": mapping(poly),
            "properties": {
                "change_class": cls,
                "confidence": round(min(0.95, 0.55 + abs(d) * k), 3),
                "area_m2": round(area, 1),
                "index_delta": round(d, 3),
            },
        })
    return feats


class VegetationIndexBackend(ModelBackend):
    name = "veg_index"
    title = "Vegetation index (NDVI/VARI)"
    tags = ["vegetation_gain", "vegetation_loss"]
    paradigm = "index"
    runtime = "index"
    rank = 40

    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        multiband = pair.before.shape[0] >= 4 and pair.after.shape[0] >= 4
        bi = _ndvi(pair.before) if multiband else _vari(pair.before)
        ai = _ndvi(pair.after) if multiband else _vari(pair.after)
        valid = np.any(pair.before > 0, axis=0) & np.any(pair.after > 0, axis=0)
        delta = np.where(valid, ai - bi, 0.0)
        thr = max(0.03, params.threshold * 0.15)
        mask = np.abs(delta) >= thr
        return _polys_from_delta(delta, mask, transform, params,
                                 "vegetation_gain", "vegetation_loss", k=1.2)


class WaterIndexBackend(ModelBackend):
    name = "water_index"
    title = "Water index (NDWI)"
    tags = ["water_change"]
    paradigm = "index"
    runtime = "index"
    rank = 45

    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        # NDWI needs Green+NIR; without NIR fall back to blue-ratio proxy.
        def ndwi(a):
            if a.shape[0] >= 4:
                g, nir = a[1], a[3]
                return (g - nir) / (g + nir + 1e-6)
            s = a.sum(axis=0) + 1e-6
            return a[2] / s  # blue ratio proxy
        valid = np.any(pair.before > 0, axis=0) & np.any(pair.after > 0, axis=0)
        delta = np.where(valid, ndwi(pair.after) - ndwi(pair.before), 0.0)
        thr = max(0.04, params.threshold * 0.15)
        mask = np.abs(delta) >= thr
        feats = []
        for poly in polygonize(mask, transform, params.min_area_m2):
            area = geodesic_area_m2(poly)
            feats.append({
                "type": "Feature", "geometry": mapping(poly),
                "properties": {"change_class": "water_change", "confidence": 0.7, "area_m2": round(area, 1)},
            })
        return feats
