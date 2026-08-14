"""Model-zoo core: the backend contract every detector implements.

A backend maps an aligned before/after Pair to a list of classified GeoJSON
features. Three paradigms share this one contract:
  - index        : spectral-index delta → threshold → polygons
  - bitemporal   : a change model → change probability raster → polygons
  - segment-diff : segment a tag on each date → diff masks → polygons

Every backend declares the runtime it needs (index|cpu|gpu|cloud) and whether it
is `available()` on this host. The registry/router use that to let the user pick a
model and to fall back gracefully when the required runtime is absent.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any, Optional

# Runtime tiers, ordered cheap→capable. Fallback walks this list downward.
RUNTIMES = ["gpu", "cloud", "cpu", "index"]


@dataclass
class RunParams:
    threshold: float = 0.5
    min_area_m2: float = 40000.0
    allow_cloud: bool = False
    tags: Optional[list[str]] = None        # restrict output to these tags
    prompt: Optional[str] = None            # open-vocabulary text (Grounded-SAM)
    extra: dict[str, Any] = field(default_factory=dict)


class ModelBackend(abc.ABC):
    name: str = ""            # stable id, e.g. "ndvi", "changeformer"
    title: str = ""           # human label
    tags: list[str] = []      # change_class values this backend can emit
    paradigm: str = "bitemporal"   # index | bitemporal | segment-diff
    runtime: str = "cpu"      # gpu | cloud | cpu | index
    rank: int = 50            # higher = better accuracy for its tags

    def available(self) -> bool:
        """True if weights + runtime (torch/cuda/network) are present here."""
        return True

    def unavailable_reason(self) -> str:
        return ""

    @abc.abstractmethod
    def run(self, pair, transform, params: RunParams) -> list[dict[str, Any]]:
        """Return classified GeoJSON features (unified contract)."""

    def info(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "tags": self.tags,
            "paradigm": self.paradigm,
            "runtime": self.runtime,
            "rank": self.rank,
            "available": self.available(),
            "reason": "" if self.available() else self.unavailable_reason(),
        }
