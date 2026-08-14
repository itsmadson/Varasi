"""Model registry: collects backends, reports the catalog, resolves a backend per
tag with graceful tier fallback (gpu→cloud→cpu→index→heuristic)."""
from __future__ import annotations

from typing import Optional

from .adapters import ADAPTERS
from .base import ModelBackend
from .heuristic_backend import HeuristicBackend
from .index_backend import VegetationIndexBackend, WaterIndexBackend

# Order: real/always-available first, then the gated high-accuracy adapters.
BACKENDS: list[ModelBackend] = [
    HeuristicBackend(),
    VegetationIndexBackend(),
    WaterIndexBackend(),
    *ADAPTERS,
]
_BY_NAME = {b.name: b for b in BACKENDS}

# The universal floor — always available, covers the most tags.
FALLBACK = _BY_NAME["heuristic"]


def catalog() -> list[dict]:
    return [b.info() for b in BACKENDS]


def get(name: str) -> Optional[ModelBackend]:
    return _BY_NAME.get(name)


def _covers(b: ModelBackend, tag: str) -> bool:
    return tag in b.tags or "change" in b.tags or "custom" in b.tags


def resolve(tag: str, prefer: Optional[str] = None, allow_cloud: bool = False) -> ModelBackend:
    """Pick the backend for a tag. Honour an explicit `prefer` when usable; else
    the highest-rank available backend that covers the tag; else the heuristic."""
    if prefer:
        b = _BY_NAME.get(prefer)
        if b and b.available() and (allow_cloud or b.runtime != "cloud"):
            return b
        # requested model not usable here → fall through to auto (graceful).
    candidates = [
        b for b in BACKENDS
        if _covers(b, tag) and b.available() and (allow_cloud or b.runtime != "cloud")
    ]
    if candidates:
        return max(candidates, key=lambda b: b.rank)
    return FALLBACK
