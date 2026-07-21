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

## Sprint 4 — Change Detection  `[x]`
- [x] AOI select (GeoJSON polygon/bbox); pick before/after scenes; bbox-intersection AOI
- [x] `ai-worker`: FastAPI service, windowed streamed COG reads, pluggable algorithm registry
- [x] Algorithms: image_diff (multi-band Euclidean), vegetation (VARI); TinyCD/Open-CD DL slot (lazy, weights-gated)
- [x] Outputs: classified GeoJSON polygons, geodesic area, confidence, magnitude, change fraction, class breakdown
- [x] Classification heuristic: urban_growth/vegetation_loss/gain/water_change/bare_soil/unknown + confidence
- [x] Control-plane: POST /detections/run (proxy→persist→job), GET /detections (GeoJSON FC)
- [x] Web /detection page: scene pairing, algorithm/threshold, run, class-colored polygons + stats on map
- [x] Verified: 82 polygons / 8 km² on Tehran 2020→2024, persisted, via web proxy
- [ ] (deferred) gRPC transport, before/after swipe + diff-raster overlay, animated time-series playback (Sprint 6)

## Sprint 5 — Watch Areas & Alerts  `[x]`
- [x] Watch Area CRUD (name, geom, tags, priority, threshold, notify) — create/list/delete/evaluate
- [x] Alert engine: STAC intersect search → auto-pick before/after → CD → threshold → alert
- [x] On ingest: ingest-worker posts footprint → internal trigger evaluates intersecting WAs (async)
- [x] Notifiers: webhook, slack, discord, telegram (HTTP), email (SMTP) — dispatch verified
- [x] Alerts page (severity, ack, open filter, poll) + evaluate button on watch-areas; WS alert.created events
- [x] Verified: auto-trigger raised critical+warning alerts on Tehran footprint; ack flow
- [ ] (deferred) SMS/push channels, per-org catalog scoping in intersect, alert digest batching

## Sprint 6 — Jobs, Analytics, Time Series hardening  `[x]`
- [x] Jobs page (live, polling); Analytics page (class breakdown bars, monthly area series, totals)
- [x] Analytics API: GET /analytics/summary (totals, by_class, monthly series from detections)
- [x] Verified: 223 detections / 17.9 km² aggregated by class
- [ ] (deferred) distributed worker pool, retry/backoff, job cancellation, animated multi-date playback

## Sprint 7 — Observability & Deploy  `[x]`
- [x] Prometheus metrics on control-plane (/metrics: request count + latency by route pattern); structured JSON logs
- [x] Prometheus + Grafana compose (observability profile) + scrape config
- [x] Helm chart (control-plane/ai-worker/web deploys+services, secrets, ingress, GPU node pool for DL)
- [x] CI/CD: GitHub Actions (Go build/vet/test, web build, Python install, image build)
- [x] Vendored Go deps for hermetic offline image builds
- [ ] (deferred) OpenTelemetry traces, Grafana dashboards as-code, load/scale docs

---
Status: **Sprints 0–7 complete** (core + hardening). Deferred items noted per sprint.
