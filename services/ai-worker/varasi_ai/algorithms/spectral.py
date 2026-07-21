from __future__ import annotations

import numpy as np

from .base import ChangeAlgorithm


class VegetationDiff(ChangeAlgorithm):
    """Vegetation-change from an RGB greenness index (VARI), no NIR required.

    VARI = (G - R) / (G + R - B). Change = |VARI_after - VARI_before|. Highlights
    vegetation loss (deforestation, clearing) and gain, which pure RGB distance
    can miss when brightness is similar.
    """

    name = "vegetation"

    def _vari(self, arr: np.ndarray) -> np.ndarray:
        r, g, b = arr[0], arr[1], arr[2]
        denom = g + r - b
        denom = np.where(np.abs(denom) < 1e-3, 1e-3, denom)
        return (g - r) / denom

    def run(self, before: np.ndarray, after: np.ndarray) -> np.ndarray:
        if before.shape[0] < 3:
            # Fall back to single-band magnitude difference.
            d = np.abs(after[0] - before[0]) / 255.0
            return np.clip(d, 0, 1).astype("float32")
        delta = np.abs(self._vari(after) - self._vari(before))
        valid = self._valid_mask(before, after)
        delta = np.where(valid, delta, 0.0)
        hi = np.percentile(delta[valid], 98) if valid.any() else 1.0
        if hi <= 0:
            hi = 1.0
        return np.clip(delta / hi, 0.0, 1.0).astype("float32")
