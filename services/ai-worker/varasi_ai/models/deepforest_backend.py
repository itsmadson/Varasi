"""DeepForest tree-crown backend (paradigm=segment-diff, runtime=cpu).

Detects individual tree crowns on each date with DeepForest (a RetinaNet trained
on airborne RGB), rasterizes the crowns to a canopy mask per date, and diffs the
masks: crowns that appear → vegetation_gain, crowns that vanish → vegetation_loss.

Real, CPU-runnable ML — but it wants sub-metre RGB. On coarse (10 m) imagery it
finds little, which is correct behaviour, not a bug. It is gated on the optional
`deepforest` dependency (see Dockerfile.ml); until installed the registry skips it
and the router falls back to the vegetation index / heuristic.
"""
from __future__ import annotations

import importlib.util
from typing import Any

import numpy as np
from shapely.geometry import mapping

from ..vectorize import geodesic_area_m2, polygonize
from .base import ModelBackend, RunParams

_MODEL = None


def _load():
    global _MODEL
    if _MODEL is None:
        from deepforest import main  # type: ignore
        m = main.deepforest()
        m.use_release()  # downloads the pretrained release weights once
        _MODEL = m
    return _MODEL


def _crown_mask(rgb: np.ndarray, shape: tuple[int, int]) -> tuple[np.ndarray, float]:
    """Predict crowns on an (3,H,W) float array; return a boolean canopy mask + mean score."""
    img = np.clip(rgb[:3], 0, 255).astype("uint8").transpose(1, 2, 0)  # HWC
    model = _load()
    df = model.predict_image(image=img, return_plot=False)
    mask = np.zeros(shape, dtype=bool)
    if df is None or len(df) == 0:
        return mask, 0.0
    for _, row in df.iterrows():
        x0, y0 = int(max(0, row["xmin"])), int(max(0, row["ymin"]))
        x1, y1 = int(min(shape[1], row["xmax"])), int(min(shape[0], row["ymax"]))
        mask[y0:y1, x0:x1] = True
    return mask, float(df["score"].mean()) if "score" in df else 0.7


class DeepForestBackend(ModelBackend):
    name = "deepforest_tree"
    title = "DeepForest · trees (crowns)"
    tags = ["vegetation_gain", "vegetation_loss"]
    paradigm = "segment-diff"
    runtime = "cpu"
    # Opt-in: below the index backend so auto-routing stays fast on coarse imagery.
    # DeepForest needs sub-metre RGB; the user selects it explicitly for high-res.
    rank = 20

    def available(self) -> bool:
        return importlib.util.find_spec("deepforest") is not None

    def unavailable_reason(self) -> str:
        return "needs deepforest (build the ai-worker ML image)"

    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        shape = (pair.height, pair.width)
        before_mask, _ = _crown_mask(pair.before, shape)
        after_mask, score = _crown_mask(pair.after, shape)
        gained = after_mask & ~before_mask
        lost = before_mask & ~after_mask

        feats: list[dict[str, Any]] = []
        for mask, cls in ((gained, "vegetation_gain"), (lost, "vegetation_loss")):
            for poly in polygonize(mask, transform, params.min_area_m2):
                feats.append({
                    "type": "Feature", "geometry": mapping(poly),
                    "properties": {
                        "change_class": cls,
                        "confidence": round(min(0.97, 0.6 + score * 0.3), 3),
                        "area_m2": round(geodesic_area_m2(poly), 1),
                        "model": self.name,
                    },
                })
        return feats
