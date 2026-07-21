"""Provider contract.

A Provider resolves a source spec into RasterRefs. Each RasterRef carries:
  - href:    the canonical URI stored in the STAC asset (what clients/titiler use)
  - gdal_path: the GDAL-openable path (/vsicurl/, /vsis3/, local path) for reading
  - env:     GDAL config overrides needed to open it (auth, vsi tuning)

This uniform interface is what lets Filesystem/HTTP/S3/COG/STAC sources be treated
identically by the rest of the pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator


@dataclass
class RasterRef:
    href: str
    gdal_path: str
    env: dict[str, str] = field(default_factory=dict)


class Provider:
    scheme: str = ""

    def list(self, uri: str) -> Iterator[RasterRef]:
        """Yield every raster reachable from `uri` (may be a single file or a set)."""
        raise NotImplementedError

    @staticmethod
    def is_raster(name: str) -> bool:
        return name.lower().endswith(
            (".tif", ".tiff", ".jp2", ".ecw", ".vrt", ".img")
        )
