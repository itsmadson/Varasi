"""GPU / cloud model adapters — the high-accuracy tier.

These declare their tags and runtime so the catalog and UI show them and the user
can select them, but they report `available()==False` until their weights and
runtime (torch/CUDA or network) are present. Each documents exactly what to drop
in to activate — the framework then routes to them with no other change. Until
then the router falls back to the heuristic/index tier.

Activation, per adapter, is a matter of:
  1. add the dep to requirements (torch, samgeo, deepforest, groundingdino…),
  2. mount the checkpoint at MODEL_WEIGHTS_DIR/<file>,
  3. implement run() (the interface + fusion are already wired).
"""
from __future__ import annotations

import os
import importlib.util
from typing import Any

from .base import ModelBackend, RunParams

WEIGHTS_DIR = os.environ.get("MODEL_WEIGHTS_DIR", "/models")


def _has(mod: str) -> bool:
    return importlib.util.find_spec(mod) is not None


def _weights(*names: str) -> bool:
    return all(os.path.exists(os.path.join(WEIGHTS_DIR, n)) for n in names)


class _Stub(ModelBackend):
    """Base for not-yet-activated adapters."""
    _requires_mods: tuple[str, ...] = ()
    _requires_weights: tuple[str, ...] = ()

    def available(self) -> bool:
        return all(_has(m) for m in self._requires_mods) and _weights(*self._requires_weights)

    def unavailable_reason(self) -> str:
        miss_m = [m for m in self._requires_mods if not _has(m)]
        miss_w = [w for w in self._requires_weights if not _weights(w)]
        parts = []
        if miss_m:
            parts.append("needs " + ", ".join(miss_m))
        if miss_w:
            parts.append("missing weights " + ", ".join(miss_w))
        return "; ".join(parts) or "unavailable"

    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        raise RuntimeError(f"{self.name} not activated: {self.unavailable_reason()}")


class ChangeFormerBackend(_Stub):
    name = "changeformer"
    title = "ChangeFormer (bitemporal, SOTA)"
    tags = ["change"]
    paradigm = "bitemporal"
    runtime = "gpu"
    rank = 90
    _requires_mods = ("torch",)
    _requires_weights = ("changeformer_levir.pt",)


class TinyCDBackend(_Stub):
    name = "tinycd"
    title = "TinyCD (bitemporal, CPU/edge)"
    tags = ["change"]
    paradigm = "bitemporal"
    runtime = "cpu"
    rank = 60
    _requires_mods = ("onnxruntime",)
    _requires_weights = ("tinycd.onnx",)


class SAMGeoBuildingBackend(_Stub):
    name = "samgeo_building"
    title = "SAMGeo · buildings (segment→diff)"
    tags = ["new_construction", "building_demolition"]
    paradigm = "segment-diff"
    runtime = "gpu"
    rank = 88
    _requires_mods = ("samgeo", "torch")
    _requires_weights = ("sam2_hiera_large.pt",)


class DeepForestTreeBackend(_Stub):
    name = "deepforest_tree"
    title = "DeepForest · trees (crowns)"
    tags = ["vegetation_gain", "vegetation_loss", "tree"]
    paradigm = "segment-diff"
    runtime = "cpu"
    rank = 70
    _requires_mods = ("deepforest",)
    _requires_weights = ()  # deepforest downloads its own release weights


class RoadExtractBackend(_Stub):
    name = "dlinknet_road"
    title = "D-LinkNet · roads"
    tags = ["paving", "road"]
    paradigm = "segment-diff"
    runtime = "gpu"
    rank = 75
    _requires_mods = ("torch",)
    _requires_weights = ("dlinknet_road.pt",)


class GroundedSAMBackend(_Stub):
    name = "grounded_sam"
    title = "Grounded-SAM · open-vocabulary (text prompt)"
    tags = ["custom"]
    paradigm = "segment-diff"
    runtime = "gpu"
    rank = 85
    _requires_mods = ("groundingdino", "segment_anything", "torch")
    _requires_weights = ("groundingdino_swint.pth", "sam_vit_h.pth")


class LandCoverBackend(_Stub):
    name = "dynamic_world"
    title = "Dynamic World · land cover (9-class)"
    tags = ["landcover_change"]
    paradigm = "segment-diff"
    runtime = "cloud"
    rank = 80
    _requires_mods = ("ee",)   # Google Earth Engine client
    _requires_weights = ()

    def available(self) -> bool:  # cloud model: also needs egress allowance
        return _has("ee")


ADAPTERS: list[ModelBackend] = [
    ChangeFormerBackend(), TinyCDBackend(), SAMGeoBuildingBackend(),
    DeepForestTreeBackend(), RoadExtractBackend(), GroundedSAMBackend(),
    LandCoverBackend(),
]
