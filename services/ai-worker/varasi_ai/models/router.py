"""Router: turn a detect request into one or more backend runs and fuse the
results into a single classified FeatureCollection with provenance."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from .base import RunParams
from .registry import resolve

# Category → the tags it owns (mirrors the frontend taxonomy).
CATEGORY_TAGS = {
    "construction": ["excavation", "earthworks_fill", "new_construction",
                     "building_demolition", "paving", "soil_sealing", "urban_growth"],
    "vegetation": ["vegetation_gain", "vegetation_loss"],
    "water": ["water_change"],
    "soil": ["bare_soil"],
}
_CONSTRUCTION = set(CATEGORY_TAGS["construction"])


def route_and_run(pair, transform, *, tags, models, params: RunParams, classifier: str):
    """
    tags:   requested change_class tags (None → single heuristic run, legacy).
    models: optional {tag: backend_name} overrides.
    Returns (features, provenance).
    """
    models = models or {}

    # Legacy / simple path: no explicit tag selection → one heuristic run.
    if not tags:
        params.extra["classifier"] = classifier
        from .registry import FALLBACK
        feats = FALLBACK.run(pair, transform, params)
        for f in feats:
            f["properties"]["model"] = FALLBACK.name
            f["properties"]["model_title"] = FALLBACK.title
        return feats, {"*": FALLBACK.name}

    # Resolve a backend per tag, then group tags by backend so each runs once.
    backend_tags: dict[Any, set] = defaultdict(set)
    provenance: dict[str, str] = {}
    for tag in tags:
        b = resolve(tag, prefer=models.get(tag), allow_cloud=params.allow_cloud)
        backend_tags[b].add(tag)
        provenance[tag] = b.name

    features: list[dict] = []
    for backend, tagset in backend_tags.items():
        p = RunParams(threshold=params.threshold, min_area_m2=params.min_area_m2,
                      allow_cloud=params.allow_cloud, tags=list(tagset),
                      prompt=params.prompt, extra=dict(params.extra))
        # Heuristic emits construction labels only in urban mode.
        if backend.name == "heuristic":
            p.extra["classifier"] = "urban" if (tagset & _CONSTRUCTION) else "standard"
        try:
            out = backend.run(pair, transform, p)
        except Exception:
            # A backend failure must not sink the whole run — fall back to heuristic.
            from .registry import FALLBACK
            fp = RunParams(threshold=params.threshold, min_area_m2=params.min_area_m2,
                           extra={"classifier": "urban" if (tagset & _CONSTRUCTION) else "standard"})
            out = FALLBACK.run(pair, transform, fp)
            for t in tagset:
                provenance[t] = FALLBACK.name + " (fallback)"
        # Keep only the tags routed to this backend; stamp provenance per polygon.
        for f in out:
            if f["properties"].get("change_class") in tagset:
                f["properties"]["model"] = backend.name
                f["properties"]["model_title"] = backend.title
                features.append(f)
    return features, provenance
