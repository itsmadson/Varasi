"""Urban-focused change classification for municipal / regulatory monitoring.

Where `classify.py` labels broad land transitions, this module reads the RGB
before/after means of a change polygon and infers the *construction lifecycle*
that matters inside a city: excavation → earthworks/fill → new construction,
plus demolition, paving, soil sealing (imperviousness gain) and green-space
loss/gain.

It is a transparent rule set over colour/brightness/saturation proxies derived
from 8-bit RGB (Sentinel-2 TCI has no NIR), tuned for the sensor-agnostic case.
Contract mirrors `classify.classify`: (before_mean, after_mean) -> (label, conf)
but also returns a props dict with the urban metrics per polygon.
"""
from __future__ import annotations

from typing import Any

import numpy as np

URBAN_CLASSES = [
    "excavation",
    "earthworks_fill",
    "new_construction",
    "building_demolition",
    "paving",
    "soil_sealing",
    "greenspace_loss",
    "greenspace_gain",
    "water_change",
    "unknown",
]

# Which classes add impervious (sealed) surface, and the construction stage they
# represent (1 clear/dig → 2 fill/prepare → 3 build). Used for the urban rollup.
_IMPERVIOUS = {"earthworks_fill", "new_construction", "paving", "soil_sealing"}
_STAGE = {"excavation": 1, "earthworks_fill": 2, "paving": 2, "soil_sealing": 2, "new_construction": 3}


def _feat(rgb: np.ndarray) -> dict[str, float]:
    """Surface descriptors from a mean RGB triple (0..255)."""
    r, g, b = (float(rgb[0]), float(rgb[1]), float(rgb[2]))
    s = r + g + b + 1e-6
    mx, mn = max(r, g, b), min(r, g, b)
    bright = (r + g + b) / 3.0 / 255.0
    sat = (mx - mn) / (mx + 1e-6)          # 0 neutral(gray) .. 1 vivid
    # VARI-style greenness proxy.
    denom = g + r - b
    green = (g - r) / denom if abs(denom) > 1e-3 else 0.0
    blue_ratio = b / s
    veg = max(0.0, min(1.0, green * 2.5))
    water = max(0.0, min(1.0, (blue_ratio - 0.36) * 6.0)) if bright < 0.55 else 0.0
    # Neutral (gray) man-made surfaces: concrete, asphalt, metal roofs — low saturation.
    # At 10 m, buildings mix with surroundings, so we key on neutrality not pure white.
    neutral = max(0.0, min(1.0, 1.0 - sat * 2.6))
    # Tan/soil: warm hue R>=G>=B with visible saturation (sand, gravel, bare earth).
    tan = 1.0 if (r >= g >= b and sat >= 0.10) else 0.0
    # Impervious (sealed) surface index: neutral, not vegetated, not water.
    impervious = max(0.0, min(1.0, neutral * (1.0 - veg) * (1.0 - water)))
    return {
        "bright": bright, "sat": sat, "green": green, "veg": veg, "water": water,
        "neutral": neutral, "tan": tan, "impervious": impervious,
    }


def classify_urban(before: np.ndarray, after: np.ndarray) -> tuple[str, float, dict[str, Any]]:
    if before.shape[0] < 3 or after.shape[0] < 3:
        return "unknown", 0.5, {}

    bf, af = _feat(before), _feat(after)
    d_bright = af["bright"] - bf["bright"]
    d_green = af["green"] - bf["green"]
    d_imperv = af["impervious"] - bf["impervious"]

    sig: dict[str, float] = {}

    # Water.
    sig["water_change"] = max(0.0, af["water"] - bf["water"]) * 2.0

    # Green-space transitions (municipal parks / landscaping).
    sig["greenspace_gain"] = max(0.0, d_green) * 2.5
    sig["greenspace_loss"] = max(0.0, -d_green) * 2.0 * (1.0 - af["water"])

    # Demolition: built/impervious before, darker & de-sealed after (rubble/bare).
    sig["building_demolition"] = bf["impervious"] * max(0.0, -d_imperv) * 3.0 + bf["impervious"] * max(0.0, -d_bright) * 1.5

    # Construction lifecycle (green must not be increasing).
    non_greening = 1.0 if d_green <= 0.02 else 0.0
    # New construction: brightening into a NEUTRAL surface (concrete/roofs), imperv gain.
    sig["new_construction"] = af["neutral"] * max(0.0, d_bright) * 3.5 * non_greening * (1.0 - af["veg"])
    # Earthworks / fill: brightening into a TAN surface (sand/gravel/fill).
    sig["earthworks_fill"] = af["tan"] * max(0.0, d_bright) * 2.6 * non_greening
    # Excavation: cleared to disturbed darker soil/pit (tan, darkening), not water.
    sig["excavation"] = af["tan"] * max(0.0, -d_bright) * 2.4 * non_greening * (1.0 - af["water"])
    # Paving: new dark NEUTRAL impervious (asphalt).
    sig["paving"] = af["neutral"] * max(0.0, -d_bright) * 2.6 * non_greening * max(0.0, d_imperv + 0.05) * 4.0
    # Soil sealing: generic pervious→impervious gain not otherwise explained.
    sig["soil_sealing"] = max(0.0, d_imperv) * 1.8 * non_greening

    label = max(sig, key=lambda k: sig[k])
    strength = sig[label]
    if strength < 0.15:
        label, conf = "unknown", round(min(0.6, 0.4 + strength), 3)
    else:
        conf = round(min(0.98, 0.5 + strength), 3)

    props = {
        "impervious_delta": round(d_imperv, 3),
        "brightness_delta": round(d_bright, 3),
        "greenness_delta": round(d_green, 3),
        "construction_stage": _STAGE.get(label, 0),
        "adds_impervious": label in _IMPERVIOUS,
    }
    return label, conf, props


def urban_rollup(features: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate municipal metrics over classified change polygons."""
    imperv_gain = constr = green_loss = demol = 0.0
    sites = 0
    stages = {1: 0.0, 2: 0.0, 3: 0.0}
    for f in features:
        p = f["properties"]
        cls = p.get("change_class")
        area = float(p.get("area_m2", 0.0))
        if p.get("adds_impervious"):
            imperv_gain += area
        if cls in ("excavation", "earthworks_fill", "new_construction"):
            constr += area
        if cls == "new_construction":
            sites += 1
        if cls == "greenspace_loss":
            green_loss += area
        if cls == "building_demolition":
            demol += area
        st = int(p.get("construction_stage", 0) or 0)
        if st in stages:
            stages[st] += area
    return {
        "impervious_gain_m2": round(imperv_gain, 1),
        "construction_area_m2": round(constr, 1),
        "new_construction_sites": sites,
        "greenspace_loss_m2": round(green_loss, 1),
        "demolition_m2": round(demol, 1),
        "stage_area_m2": {str(k): round(v, 1) for k, v in stages.items()},
    }
