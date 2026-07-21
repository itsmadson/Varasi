"""Change-algorithm registry. Add an algorithm by implementing ChangeAlgorithm."""
from __future__ import annotations

from .base import ChangeAlgorithm
from .image_diff import ImageDiff
from .spectral import VegetationDiff

_REGISTRY: dict[str, ChangeAlgorithm] = {
    a.name: a for a in (ImageDiff(), VegetationDiff())
}

# Deep-learning models are registered lazily (heavy optional deps).
try:  # pragma: no cover - optional
    from .dl import TinyCD

    _REGISTRY[TinyCD.name] = TinyCD()
except Exception:
    pass


def get_algorithm(name: str) -> ChangeAlgorithm:
    algo = _REGISTRY.get(name)
    if algo is None:
        raise ValueError(f"unknown algorithm '{name}'. available: {list(_REGISTRY)}")
    return algo


def list_algorithms() -> list[str]:
    return list(_REGISTRY)
