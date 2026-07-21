# Varasi — Sprint Roadmap

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Resume by finding first non-`[x]`.

Vertical-slice order: build a **demoable end-to-end path** first (ingest → catalog → map), then deepen.

---

## Sprint 0 — Foundation & Infra  `[x]`
- [x] Monorepo layout: `web/ control-plane/ catalog/ services/ai-worker/ services/ingest-worker/ deploy/ docs/`
- [x] `docker-compose.yml`: postgres+postgis+pgstac, redis, minio, catalog (eoAPI: stac-fastapi + titiler-pgstac + tipg)
- [x] `.env.example`, root `Makefile` (up/down/logs/seed), `.gitignore`, scripts
- [x] pgSTAC migrations applied (pgstac 0.9.5, postgis); DB healthy
- [x] README quickstart
- [x] `make up` brings whole infra healthy (stac:8081 raster:8082 vector:8083 minio:9001)

## Sprint 1 — Catalog & Ingestion  `[x]`
- [x] Varasi Collection = Virtual Dataset; Item = Raster Profile (STAC ext: proj, raster, eo)
- [x] `ingest-worker`: providers (filesystem, http, s3) → rio-stac metadata extract → STAC Item (no pixel copy)
- [x] Thumbnail/quicklook generation → MinIO (RGB/grey aware, best-effort)
- [x] Register collections + items into pgSTAC via stac-fastapi transactions
- [x] Search API live (STAC search: bbox, datetime, cloud%, collection)
- [x] titiler-pgstac serving tiles + preview for items (verified: Tehran S2 tile renders)
- [x] Seed: live public COGs (Sentinel-2 Tehran 2020+2024 pair, NAIP aerial, swissALTI3D DEM)
- [ ] (deferred) tags/arbitrary-metadata search filters, COG-validity flag surfaced in API

## Sprint 2 — Control-plane (Go)  `[ ]`
- [ ] Postgres control schema + migrations (orgs/users/roles/projects/api_keys/audit)
- [ ] Auth: JWT, API keys, OAuth2 stub; RBAC middleware
- [ ] Multi-tenancy: org/project scoping, storage quotas
- [ ] REST + OpenAPI/Swagger; proxy to catalog with tenant filter
- [ ] Jobs table + Redis queue abstraction; WebSocket hub (progress/alerts)
- [ ] gRPC protos shared (`proto/`)

## Sprint 3 — Web dashboard  `[ ]`
- [ ] Next.js 15 + TS + Tailwind + shadcn/ui + React Query; dark mode
- [ ] Design system: Green Smoke palette tokens; i18n EN(ltr)/FA(rtl) + font pairing
- [ ] Shell: sidebar nav (Dashboard, Projects, Watch Areas, Image Library, Change Detection, Alerts, Analytics, Users, Settings, Jobs)
- [ ] MapLibre map: basemap switch, layer manager, opacity slider, COG tiles from titiler
- [ ] Image Library page: search/filter Raster Profiles, footprints on map, thumbnails
- [ ] Auth flow wired to control-plane
- [ ] Swipe + split-screen compare, measure, draw polygon

## Sprint 4 — Change Detection  `[ ]`
- [ ] AOI select (polygon/bbox/geojson/draw/saved); find intersecting items; auto-pair by date
- [ ] `ai-worker`: Open-CD (TinyCD default, ChangeFormer opt), gRPC inference, windowed tiles
- [ ] Algorithms: image diff, NDVI/NDBI diff, DL segmentation; model switching
- [ ] Outputs: GeoJSON polygons, area stats, before/after thumbs, confidence, diff raster, heatmap
- [ ] Classification (agri→urban, deforestation, flood, fire, ...) + confidence
- [ ] CD page + results viewer; time-series compare (any two dates, playback)

## Sprint 5 — Watch Areas & Alerts  `[ ]`
- [ ] Watch Area CRUD (name, geom, tags, priority, threshold, notify settings)
- [ ] On ingest: spatial intersect → auto-run CD → threshold → alert
- [ ] Notifiers: email, webhook, telegram, slack, discord, SMS, push
- [ ] Alerts page + WS live feed

## Sprint 6 — Jobs, Analytics, Time Series hardening  `[ ]`
- [ ] Distributed workers, retry/backoff, cancellation, progress reporting
- [ ] Jobs page; Analytics page (charts, area-change stats)
- [ ] Animated multi-date playback

## Sprint 7 — Observability & Deploy  `[ ]`
- [ ] Prometheus + Grafana + OpenTelemetry tracing; structured logs
- [ ] Helm chart + k8s manifests; CI/CD (GitHub Actions)
- [ ] Load/scale docs

---
Current focus: **Sprint 0 → Sprint 1**.
