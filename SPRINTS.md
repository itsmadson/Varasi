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

## Sprint 2 — Control-plane (Go)  `[x]`
- [x] Postgres control schema + embedded migrator (orgs/users/memberships/projects/api_keys/watch_areas/jobs/detections/alerts/audit)
- [x] Auth: JWT + API keys (vsk_); RBAC middleware (viewer<editor<admin<owner)
- [x] Multi-tenancy: org/project scoping; storage_quota column (enforcement deferred)
- [x] REST + OpenAPI/Swagger UI (/docs); reverse proxy to STAC/raster/vector
- [x] Jobs table + WebSocket hub (per-org broadcast, job.created events)
- [x] Dockerized (alpine, static bin, self-probe healthcheck); verified in compose
- [ ] (deferred) OAuth2 provider, tenant-filtered catalog search, Redis queue abstraction, gRPC protos (Sprint 4)

## Sprint 3 — Web dashboard  `[x]`
- [x] Next.js 15 + TS + Tailwind v4 + React Query; dark mode + light toggle
- [x] Design system: Green Smoke tokens, telemetry aesthetic; i18n EN(ltr)/FA(rtl), Vazirmatn+JetBrains Mono
- [x] Shell: direction-aware sidebar nav (all pages) + topbar (lang/theme/user)
- [x] MapLibre map: basemap switch (dark/light/satellite), opacity slider, COG tiles from titiler via auth proxy
- [x] Image Library page: collection filter, footprints on map, thumbnail grid
- [x] Auth flow wired to control-plane (login guard, JWT, /me)
- [x] Dashboard (map hero + stats + scene rail), Jobs/Projects/Watch-areas live pages
- [x] Verified: prod build (13 routes), full proxy chain :3000→control-plane→eoAPI, login screenshot
- [ ] (deferred) shadcn/ui components, swipe/split-screen compare, measure, draw-polygon, layer manager (Sprint 4/6)

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
