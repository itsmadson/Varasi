# Varasi (وارسی) — Architecture & Build Plan

AI-powered geospatial **Change Detection** platform. A *Raster Catalog + Analysis Engine* — it references imagery in external storage, does not own it.

Comparable to Planet Insights / ArcGIS Image Analyst / Sentinel Hub, but open-source.

---

## 0. Core principle: don't reinvent the geospatial stack

Deep research (July 2026) confirms a mature, production-benchmarked open-source stack already solves the catalog + tiling half of the spec. We integrate it rather than rebuild it.

| Spec requirement | We build | We reuse (why) |
|---|---|---|
| Raster Profile store, indexing tens of millions | thin wrapper | **pgSTAC** — Postgres/PostGIS STAC schema, proven to 100s of millions of items |
| Metadata-first ingestion, search/filter | ingest worker | **stac-fastapi** — OGC-compliant STAC search |
| Tiling, COG streaming, windowed reads, overviews, mosaics | config only | **titiler / titiler-pgstac** — dynamic tiler on GDAL/rasterio, HTTP range reads |
| Vector tiles (detected polygons) | config only | **tipg** — OGC Features + vector tiles |
| Provider interface (S3/COG/STAC/GeoServer/...) | STAC items | a raster source = "write a STAC Item". Providers collapse into STAC |
| Change detection models | inference service | **Open-CD** + **TorchGeo** — TinyCD, ChangeFormer, BIT, ChangeStar, SAM |

**Why not roll our own GDAL raster engine / GeoServer:** GDAL is already C++; titiler wraps it with cloud-native COG range-reads. GeoServer's COG support is a bolt-on community module. Rust raster code is deferred until/unless titiler is proven the bottleneck (YAGNI).

---

## 1. Services (modular, not a monolith)

```
┌─────────────┐   REST/WS    ┌──────────────────┐
│  web (Next) │◄────────────►│ control-plane(Go)│  auth, RBAC, tenancy,
└─────────────┘              └───────┬──────────┘  jobs, alerts, WS, proxy
                                     │ gRPC / REST
        ┌────────────────────────────┼───────────────────────────┐
        ▼                            ▼                             ▼
┌───────────────┐          ┌──────────────────┐         ┌──────────────────┐
│ catalog (eoAPI│          │ ai-worker (Py)   │         │ ingest-worker(Py)│
│ stac-fastapi  │          │ Open-CD/TorchGeo │         │ metadata scan →  │
│ +titiler+tipg)│          │ gRPC inference   │         │ STAC item        │
└───────┬───────┘          └────────┬─────────┘         └────────┬─────────┘
        │                           │                            │
        ▼                           ▼                            ▼
   ┌─────────────────── PostgreSQL + PostGIS + pgSTAC ───────────────────┐
   └── Redis (queue/cache) ─── MinIO/S3 (thumbnails, derived rasters) ───┘
```

- **web** — Next.js 15, TS, Tailwind, shadcn/ui, React Query, MapLibre GL. Dark mode, EN(ltr)/FA(rtl), Green Smoke palette.
- **control-plane** — Go. Auth (JWT/OAuth2/API keys), RBAC, orgs/projects/quotas, job scheduler, WebSocket, alert engine, thin proxy to catalog. External API surface (REST + OpenAPI + WS).
- **catalog** — eoAPI (stac-fastapi + titiler-pgstac + tipg). Search, tiles, mosaics.
- **ai-worker** — Python. Open-CD/TorchGeo change-detection + classification. gRPC + batch/GPU.
- **ingest-worker** — Python. Scans providers (fs/S3/HTTP/COG/STAC), extracts metadata via rasterio, writes STAC Items. No pixel copy.

Internal = gRPC. External = REST + WebSocket.

## 2. Data model (pgSTAC + control tables)
- pgSTAC `collections` = **Virtual Datasets** (Sentinel, drone, yearly mosaic...).
- pgSTAC `items` = **Raster Profiles** (footprint, CRS, bands, cloud%, sensor, datetime, assets → external URI).
- control-plane owns: `organizations, users, memberships, roles, projects, watch_areas, aois, jobs, alerts, detections, api_keys, audit_log`.

## 3. Tech-choice rationale
- **Go control-plane**: goroutines for many concurrent jobs/WS; single static binary; great gRPC.
- **Python AI + ingest**: rasterio/GDAL/PyTorch/Open-CD/TorchGeo live here.
- **Postgres+PostGIS+pgSTAC**: one DB for spatial + catalog + control; spatial intersect for Watch Areas.
- **Redis**: job queue + tile/metadata cache.
- **MinIO/S3**: only derived artifacts (thumbnails, diff rasters). Source pixels stay external.
- **Next.js/MapLibre**: SSR dashboard, open-source vector maps, RTL-capable.

See `SPRINTS.md` for execution.
