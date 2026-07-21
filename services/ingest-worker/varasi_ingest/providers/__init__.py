"""Provider registry.

Every provider exposes the same contract (see base.Provider): given a source
spec, yield RasterRef objects that GDAL/rasterio can open. New raster sources are
added by implementing Provider and registering here.
"""
from __future__ import annotations

from .base import Provider, RasterRef
from .filesystem import FilesystemProvider
from .http import HttpProvider
from .s3 import S3Provider

_REGISTRY: dict[str, type[Provider]] = {
    p.scheme: p for p in (FilesystemProvider, HttpProvider, S3Provider)
}


def get_provider(uri: str) -> Provider:
    """Pick a provider by URI scheme (file/http/https/s3)."""
    scheme = uri.split("://", 1)[0].lower() if "://" in uri else "file"
    if scheme in ("http", "https"):
        scheme = "http"
    cls = _REGISTRY.get(scheme)
    if cls is None:
        raise ValueError(f"No provider for scheme '{scheme}' (uri={uri})")
    return cls()


__all__ = ["Provider", "RasterRef", "get_provider"]
