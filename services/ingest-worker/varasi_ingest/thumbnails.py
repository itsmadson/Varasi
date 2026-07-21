"""Generate a small PNG quicklook and upload to MinIO (derived artifact)."""
from __future__ import annotations

from typing import Optional

import boto3
from botocore.client import Config
from rasterio.env import Env
from rio_tiler.io import Reader

from .config import Settings
from .providers.base import RasterRef


def _s3(cfg: Settings):
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
        region_name=cfg.s3_region,
        config=Config(signature_version="s3v4"),
    )


def make_thumbnail(ref: RasterRef, item_id: str, cfg: Settings) -> Optional[str]:
    """Render a preview PNG, upload to the derived bucket, return public URL.

    Returns None on failure (thumbnails are best-effort, never block ingestion).
    """
    try:
        with Env(**ref.env), Reader(ref.gdal_path) as src:
            count = src.dataset.count
            # PNG allows 1 (grey) or 3 (rgb) data bands. Pick sensibly.
            indexes = (1, 2, 3) if count >= 3 else (1,)
            img = src.preview(max_size=cfg.thumb_size, indexes=indexes)
            # Stretch non-8-bit data to 0-255 using its own min/max.
            if img.data.dtype != "uint8":
                stats = img.statistics()
                in_range = tuple((s.min, s.max) for s in stats.values())
                img.rescale(in_range=in_range)
            png = img.render(img_format="PNG")
    except Exception:
        return None

    key = f"thumbnails/{item_id}.png"
    try:
        _s3(cfg).put_object(
            Bucket=cfg.s3_bucket, Key=key, Body=png, ContentType="image/png"
        )
    except Exception:
        return None
    return f"{cfg.s3_public_endpoint}/{cfg.s3_bucket}/{key}"
