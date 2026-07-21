# varasi-ai

Change-detection inference service. Reads a before/after COG pair over an AOI
(windowed, streamed via GDAL range requests — no full download), runs a pluggable
algorithm to a change-magnitude raster, then thresholds and vectorizes it into
**classified GeoJSON polygons** with geodesic area and confidence.

## Algorithms (`/algorithms`)
- **image_diff** — normalized multi-band Euclidean difference. Sensor-agnostic
  baseline; catches construction, demolition, water/soil change.
- **vegetation** — RGB greenness (VARI) delta; vegetation loss/gain without NIR.
- **tinycd** *(optional)* — TinyCD / Open-CD deep model. Registers automatically
  when `torch` + a scripted checkpoint (`$VARASI_AI_TINYCD_WEIGHTS`) are present;
  otherwise the service runs on the classical methods. Implements the same
  `ChangeAlgorithm` contract, so any Open-CD/TorchGeo model drops in the same way.

## Pipeline
```
before/after (SceneRef: uri or collection+item_id)
  └─ reader.read_pair  (aligned windowed read over AOI bbox, EPSG:4326)
       └─ algorithm.run  →  magnitude (H,W) ∈ [0,1]
            └─ threshold  →  binary mask
                 └─ vectorize.polygonize  (rasterio shapes + geodesic area filter)
                      └─ classify  (per-polygon RGB heuristic)  →  GeoJSON + stats
```

## API
```
GET  /healthz        → status + available algorithms
GET  /algorithms
POST /detect         → DetectRequest → GeoJSON FeatureCollection + stats
```
`DetectRequest`: `{ before, after, aoi(GeoJSON), algorithm, threshold, min_area_m2 }`.

Feature properties: `change_class, confidence, magnitude, area_m2, algorithm,
before_datetime, after_datetime`. Stats: `changed_area_m2, changed_fraction,
polygon_count, class_breakdown`.

Classes: `urban_growth, vegetation_loss, vegetation_gain, water_change, bare_soil,
unknown`.

## Run
`docker compose up -d ai-worker` (port 8090). The control-plane calls it from
`POST /api/v1/detections/run`, persists polygons, and exposes them at
`GET /api/v1/detections`.
