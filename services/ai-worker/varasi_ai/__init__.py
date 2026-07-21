"""Varasi change-detection inference service.

Reads a before/after COG pair over an AOI (windowed, streamed), runs a pluggable
change algorithm to a change-magnitude raster, thresholds + vectorizes it into
classified GeoJSON polygons with area and confidence.
"""

__version__ = "0.1.0"
