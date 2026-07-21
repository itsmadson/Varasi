"""Varasi ingestion: metadata-first raster catalog.

A raster source is turned into a STAC Item (a Raster Profile) and registered in
pgSTAC via the stac-fastapi transactions API. Source pixels are never copied.
"""

__version__ = "0.1.0"
