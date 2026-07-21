"""Local filesystem / network share provider."""
from __future__ import annotations

import glob
import os
from typing import Iterator

from .base import Provider, RasterRef


class FilesystemProvider(Provider):
    scheme = "file"

    def list(self, uri: str) -> Iterator[RasterRef]:
        path = uri[7:] if uri.startswith("file://") else uri
        if os.path.isdir(path):
            for root, _dirs, files in os.walk(path):
                for name in sorted(files):
                    if self.is_raster(name):
                        p = os.path.join(root, name)
                        yield RasterRef(href=f"file://{p}", gdal_path=p)
        elif any(ch in path for ch in "*?["):
            for p in sorted(glob.glob(path, recursive=True)):
                if self.is_raster(p):
                    yield RasterRef(href=f"file://{p}", gdal_path=p)
        else:
            yield RasterRef(href=f"file://{path}", gdal_path=path)
