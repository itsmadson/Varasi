"""S3-compatible provider (AWS S3, MinIO, GCS/Azure via S3 gateways).

Lists objects under an s3://bucket/prefix and yields each raster as a /vsis3/ path.
Anonymous (requester-pays-free public buckets) is the default; credentials come
from the standard AWS env chain when present.
"""
from __future__ import annotations

import os
from typing import Iterator
from urllib.parse import urlparse

import boto3
from botocore import UNSIGNED
from botocore.client import Config

from .base import Provider, RasterRef


class S3Provider(Provider):
    scheme = "s3"

    def _client(self):
        no_sign = os.getenv("VARASI_SRC_AWS_NO_SIGN", "true").lower() == "true"
        kwargs = {}
        if os.getenv("AWS_S3_ENDPOINT"):
            kwargs["endpoint_url"] = os.environ["AWS_S3_ENDPOINT"]
        if no_sign and not os.getenv("AWS_ACCESS_KEY_ID"):
            kwargs["config"] = Config(signature_version=UNSIGNED)
        return boto3.client("s3", **kwargs)

    def list(self, uri: str) -> Iterator[RasterRef]:
        parsed = urlparse(uri)
        bucket, prefix = parsed.netloc, parsed.path.lstrip("/")
        env = {
            "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
            "AWS_NO_SIGN_REQUEST": os.getenv("VARASI_SRC_AWS_NO_SIGN", "YES").upper()
            if not os.getenv("AWS_ACCESS_KEY_ID")
            else "NO",
        }
        if os.getenv("AWS_S3_ENDPOINT"):
            env["AWS_S3_ENDPOINT"] = os.environ["AWS_S3_ENDPOINT"]

        # Single object (has an extension) vs prefix listing.
        if self.is_raster(prefix):
            yield RasterRef(
                href=uri, gdal_path=f"/vsis3/{bucket}/{prefix}", env=env
            )
            return
        paginator = self._client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if self.is_raster(key):
                    yield RasterRef(
                        href=f"s3://{bucket}/{key}",
                        gdal_path=f"/vsis3/{bucket}/{key}",
                        env=env,
                    )
