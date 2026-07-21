from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VARASI_AI_", extra="ignore")

    # titiler/raster not needed; we read source COGs directly by URI.
    stac_url: str = "http://stac:8080"
    # Max working raster edge (px). Keeps inference bounded regardless of AOI size.
    max_size: int = 512
    # GDAL tuning for remote COG range reads.
    request_timeout: float = 120.0


def get_settings() -> Settings:
    return Settings()


# GDAL env applied when opening remote rasters.
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff,.jp2",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_HTTP_VERSION": "2",
    "VSI_CACHE": "TRUE",
    "AWS_NO_SIGN_REQUEST": "YES",
}
