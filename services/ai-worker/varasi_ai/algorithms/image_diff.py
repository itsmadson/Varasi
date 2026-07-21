from __future__ import annotations

import numpy as np

from .base import ChangeAlgorithm


class ImageDiff(ChangeAlgorithm):
    """Normalized multi-band Euclidean difference — a fast, sensor-agnostic baseline.

    Good general detector: new construction, demolition, water/soil change all show
    as spectral distance between the two dates.
    """

    name = "image_diff"

    def run(self, before: np.ndarray, after: np.ndarray) -> np.ndarray:
        b = before / 255.0
        a = after / 255.0
        # Per-pixel Euclidean distance across bands, normalized to [0,1].
        diff = np.sqrt(np.mean((a - b) ** 2, axis=0))
        valid = self._valid_mask(before, after)
        diff = np.where(valid, diff, 0.0)
        # Robust contrast stretch to spread the signal.
        hi = np.percentile(diff[valid], 98) if valid.any() else 1.0
        if hi <= 0:
            hi = 1.0
        return np.clip(diff / hi, 0.0, 1.0).astype("float32")
