"""Heuristic change classification from RGB before/after statistics.

Not a trained classifier — a transparent rule set over brightness and a greenness
proxy, good enough to label the common transitions. Swap for a DL classifier by
implementing the same (before_stats, after_stats) -> (label, confidence) contract.
"""
from __future__ import annotations

import numpy as np

CLASSES = [
    "urban_growth",
    "vegetation_loss",
    "vegetation_gain",
    "water_change",
    "bare_soil",
    "unknown",
]


def _greenness(rgb: np.ndarray) -> float:
    r, g, b = rgb
    denom = g + r - b
    return float((g - r) / denom) if abs(denom) > 1e-3 else 0.0


def classify(before: np.ndarray, after: np.ndarray) -> tuple[str, float]:
    """before/after: (bands,) mean RGB (0..255) inside a change polygon."""
    if before.shape[0] < 3:
        return "unknown", 0.5

    b_bright = float(before.mean()) / 255.0
    a_bright = float(after.mean()) / 255.0
    d_bright = a_bright - b_bright

    b_green = _greenness(before)
    a_green = _greenness(after)
    d_green = a_green - b_green

    b_blue = before[2] / (before.sum() + 1e-6)
    a_blue = after[2] / (after.sum() + 1e-6)
    d_blue = float(a_blue - b_blue)

    # Confidence scales with how pronounced the dominant signal is.
    signals = {
        "vegetation_loss": max(0.0, -d_green) * 3,
        "vegetation_gain": max(0.0, d_green) * 3,
        "urban_growth": max(0.0, d_bright) * 2 if a_green < 0.05 else 0.0,
        "water_change": max(0.0, d_blue) * 4,
        "bare_soil": max(0.0, d_bright) * 1.5 if abs(d_green) < 0.03 else 0.0,
    }
    label = max(signals, key=lambda k: signals[k])
    strength = signals[label]
    if strength < 0.15:
        return "unknown", round(min(0.6, 0.4 + strength), 3)
    return label, round(min(0.98, 0.55 + strength), 3)
