"""Turn a binary change mask into geodesic-measured polygons."""
from __future__ import annotations

from typing import Iterator

import numpy as np
from pyproj import Geod
from rasterio.features import shapes
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

_GEOD = Geod(ellps="WGS84")


def geodesic_area_m2(geom: BaseGeometry) -> float:
    if geom.geom_type == "Polygon":
        area, _ = _GEOD.geometry_area_perimeter(geom)
        return abs(area)
    total = 0.0
    for g in getattr(geom, "geoms", []):
        a, _ = _GEOD.geometry_area_perimeter(g)
        total += abs(a)
    return total


def polygonize(mask: np.ndarray, transform, min_area_m2: float) -> Iterator[BaseGeometry]:
    """Yield lon/lat shapely polygons for connected change regions above min area."""
    mask8 = mask.astype("uint8")
    for geom, val in shapes(mask8, mask=mask8 > 0, transform=transform):
        if val == 0:
            continue
        poly = shape(geom)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        if geodesic_area_m2(poly) >= min_area_m2:
            yield poly
