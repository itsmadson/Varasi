from __future__ import annotations

import numpy as np


class ChangeAlgorithm:
    """Contract: map an aligned before/after pair to a change-magnitude raster.

    Input arrays are (bands, H, W) float32 (0..255 for 8-bit imagery).
    Output is (H, W) float32 in [0, 1] where 1 = maximal change.
    """

    name: str = ""

    def run(self, before: np.ndarray, after: np.ndarray) -> np.ndarray:
        raise NotImplementedError

    @staticmethod
    def _valid_mask(before: np.ndarray, after: np.ndarray) -> np.ndarray:
        """Pixels with data in both scenes (nonzero in at least one band)."""
        b = np.any(before > 0, axis=0)
        a = np.any(after > 0, axis=0)
        return b & a
