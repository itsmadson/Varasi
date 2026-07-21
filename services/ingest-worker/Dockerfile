# rasterio/rio-tiler ship manylinux wheels with GDAL bundled — no system GDAL needed.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# rasterio's bundled GDAL wheel still needs a couple of host shared libs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libexpat1 libtiff6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY varasi_ingest ./varasi_ingest
RUN pip install .

ENTRYPOINT ["varasi-ingest"]
CMD ["--help"]
