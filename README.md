<div align="center">

# Varasi · وارسی

**AI-powered geospatial Change Detection platform.**
A Raster Catalog + Analysis Engine — references imagery in external storage, does not own it.

</div>

---

## What it is
Continuously monitor large areas from satellite / aerial / drone imagery, automatically detect changes, classify them, and alert users. Open-source, cloud-native, multi-tenant.

## Architecture (short)
Varasi is **modular services**, not a monolith. It integrates the proven eoAPI cloud-native stack for catalog + tiling rather than reinventing GDAL/GeoServer:

- **web** — Next.js dashboard (MapLibre, dark mode, EN/FA RTL).
- **control-plane (Go)** — auth, RBAC, multi-tenancy, jobs, alerts, WebSocket, external REST API.
- **catalog (eoAPI)** — `stac-fastapi` (search) + `titiler-pgstac` (COG tiling) + `tipg` (vector tiles).
- **ai-worker (Python)** — Open-CD / TorchGeo change detection + classification.
- **ingest-worker (Python)** — metadata-first scan of providers → STAC Items (no pixel copy).
- **stores** — PostgreSQL + PostGIS + **pgSTAC**, Redis, MinIO/S3 (derived artifacts only).

Full design: [`PLAN.md`](./PLAN.md) · Roadmap: [`SPRINTS.md`](./SPRINTS.md)

## Quickstart
```bash
cp .env.example .env
make up        # postgis+pgstac, redis, minio, stac, raster, vector
make health    # wait for healthy
make bucket    # create MinIO derived bucket
make seed      # ingest sample public COGs
```
Endpoints: STAC `:8081` · Raster `:8082` · Vector `:8083` · MinIO console `:9001`.

## Concepts
- **Raster Profile** = a STAC Item (footprint, CRS, bands, cloud%, sensor, datetime, asset URIs).
- **Virtual Dataset** = a STAC Collection (Sentinel, drone flights, yearly mosaic...).
- **Provider** = anything that can be turned into a STAC Item (filesystem, S3, HTTP, COG, STAC, GeoServer...).

## Status
Early build. Following `SPRINTS.md`, vertical-slice first (ingest → catalog → map).
