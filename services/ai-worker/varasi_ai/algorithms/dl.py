"""Deep-learning change detection (TinyCD / Open-CD).

This module imports torch lazily; if torch (and a trained checkpoint) are not
present the registry skips it, so the service always runs with classical methods.
To enable: add `torch` + `opencd`/`torchgeo` to the image, drop a checkpoint at
$VARASI_AI_TINYCD_WEIGHTS, and this algorithm registers automatically.

The contract matches ChangeAlgorithm: (bands,H,W)->(H,W) magnitude in [0,1].
"""
from __future__ import annotations

import os

import numpy as np

import torch  # noqa: F401  (import guarded by registry try/except)

from .base import ChangeAlgorithm

_WEIGHTS = os.getenv("VARASI_AI_TINYCD_WEIGHTS", "")


class TinyCD(ChangeAlgorithm):
    name = "tinycd"

    def __init__(self) -> None:
        if not _WEIGHTS or not os.path.exists(_WEIGHTS):
            raise RuntimeError("TinyCD weights not available")
        self._model = torch.jit.load(_WEIGHTS)  # scripted checkpoint
        self._model.eval()

    def run(self, before: np.ndarray, after: np.ndarray) -> np.ndarray:
        import torch

        def norm(x: np.ndarray) -> "torch.Tensor":
            t = torch.from_numpy(x[:3] / 255.0).float().unsqueeze(0)
            return t

        with torch.no_grad():
            logits = self._model(norm(before), norm(after))
            prob = torch.sigmoid(logits).squeeze().cpu().numpy()
        return np.clip(prob, 0.0, 1.0).astype("float32")
