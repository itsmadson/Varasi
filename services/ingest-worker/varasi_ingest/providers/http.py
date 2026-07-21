"""HTTP/HTTPS provider (single raster over HTTP, incl. remote COG via range reads)."""
from __future__ import annotations

from typing import Iterator

from .base import Provider, RasterRef

# GDAL config for efficient remote COG reads.
_COG_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff,.jp2,.vrt",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_HTTP_VERSION": "2",
    "VSI_CACHE": "TRUE",
}


class HttpProvider(Provider):
    scheme = "http"

    def list(self, uri: str) -> Iterator[RasterRef]:
        # A single remote raster; GDAL streams it with /vsicurl/ (range requests).
        yield RasterRef(href=uri, gdal_path=f"/vsicurl/{uri}", env=dict(_COG_ENV))
