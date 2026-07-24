# Varasi — Corrected Workflow: Reports, Date-Pick Detection, Rich Watch Areas

Date: 2026-07-24
Status: Approved

## Problem

The engine works, but three parts of the product don't match the intended workflow:

1. **Reports** — there is no way to export results anywhere. Users need polished,
   branded PDF plus raw GeoJSON/CSV download from every result surface.
2. **Change Detection tab** is scene-only. Users want an ad-hoc probe: pick two
   *dates* and let the platform choose the best matching scenes near those dates
   (cloud-aware), run, and export.
3. **Watch Areas** (the persistent "projects") produce thin alerts. Users want a
   configurable, scored, browsable watch surface with downloadable evidence.

## Corrected mental model

- **Rasters**: catalog of scenes (metadata + datetime + external link/S3). The
  engine references, never owns. Already true.
- **Watch Areas**: persistent AOIs. Engine watches → alerts on change with map +
  downloadable GeoJSON. Fires today on detect-on-ingest.
- **Change Detection tab**: ad-hoc/unscheduled probe. Pick two scenes OR two
  dates → run → export report.
- **Reports**: branded PDF + GeoJSON/CSV, available on every result surface.

## Design

### A. Reports system (client-side, reusable)

One engine, four consumers (Detection result, Alert detail, Watch Area detail,
Analytics).

- `ReportDoc` React component: A4 layout, Green Smoke palette. Header (Varasi mark
  + report type + date range), meta block, map snapshot image(s), stats tables,
  class-breakdown bars (inline SVG, no chart dependency), footer (timestamp, org,
  attribution).
- Map → image: before printing, capture `map.getCanvas().toDataURL()` into an
  `<img>`. Live WebGL canvas does not print; a raster snapshot does.
- Export = `window.print()` scoped by `@media print` over a hidden printable
  container. No PDF library, no server. Browser "Save as PDF" yields vector text +
  raster map.
- `Download GeoJSON` and `Download CSV` buttons → client `Blob`. GeoJSON = the
  FeatureCollection; CSV = one row per polygon (class, confidence, area_m2,
  before_date, after_date).

### B. Change Detection — dual mode

- Toggle "By scene" (current) vs "By date".
- By date: two date pickers + optional max-cloud slider. Client calls existing
  `/catalog/stac/search` with `datetime` range, `sortby` datetime, and
  `query: {"eo:cloud_cover": {"lte": maxCloud}}`. Picks the scene nearest each
  target date; shows the chosen scenes as chips ("closest to 2020-06-01 →
  2020-05-28, 4% cloud"). Same run path afterward.
- Result panel gains an Export row (PDF / GeoJSON / CSV). Ad-hoc; no persistence.

### C. Watch Areas — four features

1. Config fields on the create form: max-cloud %, alert-only-on-classes
   multiselect, check cadence (daily/weekly). Cadence is stored and displayed;
   scheduling is deferred — detect-on-ingest already fires on new imagery. This is
   stated in the UI, not faked.
2. Severity score: engine computes `Σ(area_m2 × classWeight × confidence)` and
   stores it on the alert. Dashboard ranks hottest areas by score.
3. Watch Area detail page: header + config, change-timeline sparkline (built
   client-side from that area's detections grouped by `after_date`; click a point
   opens that detection), alert history list, Export report.
4. Alert detail page: before/after SwipeMap + change overlay + class breakdown +
   downloadable GeoJSON/PDF.

Class weights (for severity): urban_growth 1.0, water_change 0.9,
vegetation_loss 0.8, bare_soil 0.6, vegetation_gain 0.4, unknown 0.3.

### D. Backend changes (minimal)

1. Migration `0002`: `watch_areas` add `max_cloud int`, `alert_classes text[]`,
   `cadence text`; `alerts` add `score double precision NOT NULL DEFAULT 0`.
2. `listDetections`: accept `?watch_area=<id>` filter; include `watch_area_id` and
   `job_id` in feature props (enables timeline + alert overlay).
3. `GET /alerts/{id}`: returns `{alert, watch_area (geometry+props), detections
   FeatureCollection, stats}`.
4. `evaluateWatchArea`: apply cloud filter in scene search, filter detections by
   `alert_classes` before alerting, compute + store `score`, set `detection_id`
   linkage on the alert.
5. Date-pick and all reports: zero backend.

### E. Out of scope (YAGNI)

Server-side PDF rendering, real cron scheduler, email PDF attachments, digest
emails. Design leaves room; not built now.

## Components / boundaries

- `web/src/lib/report.ts` — `downloadGeoJSON`, `downloadCSV`, `printReport`,
  `snapshotMap` helpers. Pure, testable.
- `web/src/components/ReportDoc.tsx` — presentational; takes a typed `ReportModel`.
- `web/src/components/Sparkline.tsx` — inline SVG, takes `{x,y}[]`.
- Detection page gains date-mode state + scene-picker logic (client STAC search).
- New pages: `watch-areas/[id]`, `alerts/[id]`.
- Backend: migration + three handler edits, no new services.

## Testing

- `report.ts` helpers: unit tests for CSV rows, GeoJSON blob, date-nearest pick.
- Scene-nearest selection: unit test over a fixture scene list.
- Manual: run detection both modes, export PDF/GeoJSON/CSV; open a watch area +
  alert detail; verify severity ordering on dashboard.
