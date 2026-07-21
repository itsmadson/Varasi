"""Virtual Dataset (STAC Collection) helpers."""
from __future__ import annotations

from typing import Any

_DEFAULT_EXTENT = {
    "spatial": {"bbox": [[-180.0, -90.0, 180.0, 90.0]]},
    "temporal": {"interval": [[None, None]]},
}


def make_collection(
    cid: str,
    title: str | None = None,
    description: str | None = None,
    license_: str = "proprietary",
) -> dict[str, Any]:
    """Build a minimal valid STAC Collection = a Varasi Virtual Dataset."""
    return {
        "type": "Collection",
        "stac_version": "1.0.0",
        "id": cid,
        "title": title or cid,
        "description": description or f"Varasi virtual dataset: {cid}",
        "license": license_,
        "extent": _DEFAULT_EXTENT,
        "links": [],
        "varasi:kind": "virtual_dataset",
    }
