"""Runtime configuration, sourced from environment."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VARASI_", extra="ignore")

    # STAC transactions API (stac-fastapi-pgstac)
    stac_url: str = "http://stac:8080"

    # MinIO / S3 for derived thumbnails
    s3_endpoint: str = "http://minio:9000"
    s3_public_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "varasi"
    s3_secret_key: str = "varasiminio"
    s3_bucket: str = "varasi-derived"
    s3_region: str = "us-east-1"

    # Source S3 (for reading imagery from S3 providers). Empty = use public/anon.
    src_aws_no_sign: bool = True

    # Thumbnail size (longest edge, px)
    thumb_size: int = 256

    request_timeout: float = 60.0


def get_settings() -> Settings:
    return Settings()
