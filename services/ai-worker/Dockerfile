FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# rasterio/rio-tiler wheels bundle GDAL but need a few host libs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libexpat1 libtiff6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY varasi_ai ./varasi_ai
RUN pip install .

EXPOSE 8090
CMD ["uvicorn", "varasi_ai.main:app", "--host", "0.0.0.0", "--port", "8090"]
