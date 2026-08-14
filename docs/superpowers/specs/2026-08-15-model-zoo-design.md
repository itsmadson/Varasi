# Varasi Model Zoo — Architecture Design

Date: 2026-08-15
Status: Approved (user delegated: "do the best, go for it")
Companion research: `docs/MODELS.md`

## Problem

The engine has one heuristic classifier plus an image-diff magnitude. To become a
real product it needs **high accuracy across many GIS tags** (buildings, trees,
roads, water, land cover, open-vocabulary objects), using the **best model per
tag**, on **variable hardware** (sometimes a GPU server, sometimes not), with the
**user choosing** the model and a **graceful fallback** when the required runtime
is absent.

## Principles

- No single best model — accuracy is (tag × resolution × runtime). Route per that.
- Pluggable: adding a model is adding one adapter file, no router changes.
- Runtime-tiered: every backend declares `index | cpu | gpu | cloud`. The catalog
  reports availability; unavailable → auto-fallback down the tier ladder.
- Offline-first: `index` + heuristic tier always works with zero weights/GPU/net.
- Unified output: every backend emits the same classified-GeoJSON contract, so the
  control-plane, storage, alerts, reports and UI are unchanged.

## Architecture (ai-worker)

Three inference **paradigms**, one output contract:

1. **index** — spectral index delta → threshold → polygons (NDVI/NDWI/NDBI/VARI).
2. **bitemporal** — a change model consumes before+after → change probability
   raster (image_diff heuristic, TinyCD, ChangeFormer).
3. **segment-diff** — a segmentation model masks a tag on each date; masks are
   diffed → appeared/removed polygons (SAM/samgeo, DeepForest, D-LinkNet,
   Grounded-SAM by text prompt).

### Components

- `models/base.py` — `ModelBackend` ABC:
  ```
  name, title, tags: list[str], paradigm, runtime: "index|cpu|gpu|cloud",
  available() -> bool          # weights present? torch/cuda present? net?
  run(pair, aoi, params) -> list[Feature]   # unified classified polygons
  ```
- `models/registry.py` — collects backends, lazy-imports heavy ones behind
  `available()`, exposes `catalog()` (for the API) and `resolve(tag, prefer,
  allow_cloud) -> backend` with tier fallback (`gpu→cpu→index→heuristic`).
- `models/router.py` — given a DetectRequest (tags[], model overrides, allow_cloud),
  picks a backend per requested tag, runs each, **fuses** all features into one
  FeatureCollection + per-tag stats + which backend actually ran (for provenance).
- Backends (phase 1, all runnable now, no GPU):
  - `models/index_backend.py` — NDVI/NDWI/NDBI/BSI/VARI (auto-detects available
    bands; RGB→VARI, multiband→full indices).
  - `models/heuristic_backend.py` — wraps existing image_diff + classify + urban.
  - Adapter stubs (present, gated by `available()`): `models/sam_backend.py`,
    `models/openccd_backend.py`, `models/deepforest_backend.py`,
    `models/grounded_backend.py`, `models/landcover_backend.py`. Each returns
    `available()==False` until weights + runtime exist, and documents exactly what
    to drop in to activate. This proves the interface end-to-end without shipping
    GBs of weights.

### Request/response schema additions

- `DetectRequest`: add `tags: list[str] | None`, `models: dict[tag,str] | None`
  (per-tag backend override), `allow_cloud: bool = False`. Keep `classifier`/
  `algorithm` working (mapped onto the registry for back-compat).
- `DetectResponse`: add `provenance: dict[tag, backend_name]` and keep the existing
  `features` + `stats` + `urban`.
- New endpoint `GET /models` on ai-worker → catalog (name, title, tags, paradigm,
  runtime, available). Proxied by control-plane as `GET /api/v1/models`.

### Control-plane

- Proxy `/api/v1/models` (cached). Pass `models`/`tags`/`allow_cloud` through in the
  detect body (already forwards raw JSON). `watch_areas` gains a `models jsonb`
  column (per-tag choice) threaded into `evaluateWatchArea`. Migration 0004.

### Frontend

- `Detect & style` panel: each **category** gets a small model dropdown — “Auto
  (best available)” default + the concrete backends whose tags cover that category,
  with a runtime chip (index/cpu/gpu/cloud) and greyed-out+“needs GPU” when
  unavailable. An `allow cloud` toggle (respects org egress). Same picker feeds the
  watch-area form.
- `/models` catalog fetched via React Query; provenance shown in the result
  (“buildings ← SAMGeo”, “vegetation ← NDVI”).

## Output contract (unchanged downstream)

Every backend yields features with `properties.change_class` (the tag), `confidence`,
`area_m2`, plus optional model-specific props. Existing vectorize/geodesic-area,
persistence, alerts, reports, and MapLibre styling all keep working.

## Testing

- Unit: registry tier-fallback (`gpu` requested but unavailable → `index`);
  index math on synthetic arrays; router fusion dedupe.
- Integration: run detection through the router on the Mashhad pair with the
  index/heuristic tier; assert unified FC + provenance.
- Adapter stubs: `available()==False` path returns a clear catalog entry, never
  crashes a run.

## Out of scope (phased later, see MODELS.md §7)

Actual GPU weights (ChangeFormer/SAM2/Grounded-SAM), vector-diff (Open Buildings),
ensemble max-accuracy. The framework makes each a drop-in.
