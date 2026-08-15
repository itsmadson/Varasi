# Varasi Model Zoo — Deep Research & Benchmark

_Last updated: 2026-08-15. Scope: which model is best for each detection tag, at
which imagery resolution, on which runtime. This drives the pluggable model
router (see `2026-08-15-model-zoo-design.md`)._

## TL;DR selection matrix

| Tag / task | Best model (accuracy) | Paradigm | Runtime | Min GEO res | Fallback |
|---|---|---|---|---|---|
| Generic change (any) | **ChangeFormer** > BIT > TinyCD | bitemporal | GPU | any | image_diff (heuristic) |
| Building footprint | **SAMGeo (SAM2)** / Open Buildings / BuildFormer | segment→diff | GPU | ≤0.5 m | building index |
| Building change/damage | **ChangeOS**, BDANet (xBD) | bitemporal | GPU | ≤0.5 m | image_diff |
| Trees / individual | **DeepForest** (crowns) | segment→diff | CPU/GPU | ≤0.3 m | NDVI |
| Canopy / vegetation cover | **NDVI** + Meta Canopy Height | index / regression | CPU | ≥10 m | NDVI |
| Roads | **D-LinkNet** / SAMGeo-road | segment→diff | GPU | ≤1 m | image_diff |
| Water | **NDWI** (McFeeters) / SAR | index | CPU | any | NDWI |
| Built-up / impervious | **NDBI** + Dynamic World | index / classifier | CPU | ≥10 m | NDBI/urban |
| Land cover (9-class) | **Dynamic World** / ESA WorldCover | classifier | GPU/cloud | 10 m | urban heuristic |
| Open-vocabulary ("detect X") | **Grounded-SAM** (GDINO+SAM) | prompt→segment→diff | GPU | ≤1 m | — |
| Solar / greenhouse / pool… | Grounded-SAM text prompt | prompt→segment→diff | GPU | ≤1 m | — |

Key principle: **there is no single best model.** Accuracy is a function of
(tag × resolution × runtime). The router picks per that triple; the user can
override; if the required runtime is absent, it degrades gracefully.

---

## 1. Bitemporal change-detection models (direct "what changed")

Datasets/metrics community-standard: **LEVIR-CD** (building change, 0.5 m),
**WHU-CD**, **DSIFN**, **S2Looking**, **SECOND** (semantic change). Metric = F1 /
IoU on the change class.

| Model | LEVIR-CD F1 | Params | Notes |
|---|---|---|---|
| FC-Siam-diff (baseline) | ~86 | 1.4 M | classic Siamese, CPU-runnable |
| **TinyCD** | ~91.0 | **0.28 M** | tiny, edge/CPU-friendly (ONNX) — our light DL slot |
| BIT (transformer) | ~89.3 | 3.5 M | bitemporal image transformer |
| **ChangeFormer** | **~90.4** | 41 M | transformer Siamese, strong general change |
| Changer / ChangerEx | ~92 | — | Open-CD zoo, SOTA-ish |
| **Open-CD** (framework) | — | — | mmseg-based zoo hosting BIT/Changer/TinyCD/ChangeFormer |

**Pick:** ChangeFormer for GPU "high accuracy"; TinyCD (int8 ONNX) for CPU;
image_diff heuristic as the universal floor. Host all via an **Open-CD**-style
registry so adding a checkpoint = adding a row.

## 2. Segment-anything family (segment each date, then diff masks)

| Model | Use | Runtime | Notes |
|---|---|---|---|
| **SAM** (ViT-H/L/B) | class-agnostic masks | GPU | zero-shot; needs prompts (points/box/grid) |
| **SAM 2** | faster, better masks | GPU | preferred over SAM v1 |
| **MobileSAM / FastSAM / EfficientSAM** | CPU/edge SAM | CPU | ~real-time, lower quality — CPU tier |
| **samgeo** (segment-geospatial) | SAM for GeoTIFF | GPU | tiles, georeferences masks, text prompt via GroundingDINO |
| **Grounded-SAM** (GDINO + SAM) | open-vocab: "building", "car", "pool" | GPU | text→boxes→masks; the key to arbitrary tags |
| **LangSAM** | text-prompt SAM wrapper | GPU | simpler Grounded-SAM |

**Change via segmentation:** segment tag on both dates → rasterize masks →
`after_mask & ~before_mask` = appeared, `before_mask & ~after_mask` = removed.
This yields *class-specific* change (new buildings, felled trees) that bitemporal
change models don't label by type.

**Pick:** samgeo+SAM2 (GPU) for footprint-precise tags at ≤0.5 m; MobileSAM/FastSAM
for a CPU tier; Grounded-SAM for open-vocabulary tags.

## 3. Object / domain-specific models

| Domain | Model | Metric | Runtime | Notes |
|---|---|---|---|---|
| Buildings | **Microsoft Global Building Footprints**, **Google Open Buildings v3** | pre-computed vectors | — | free vector layers; diff against detection to find *new* builds |
| Buildings | BuildFormer, HRNet-seg | IoU ~91 (WHU) | GPU | on-the-fly footprint |
| Building damage | **xView2 winners (ChangeOS, BDANet)** | xBD F1 | GPU | 4-level damage — demolition/construction proxy |
| Trees | **DeepForest** | crown mAP | CPU/GPU | RetinaNet on RGB; individual tree boxes |
| Canopy height | **Meta/WRI 1 m Canopy Height** | RMSE | GPU/cloud | global raster, regression |
| Roads | **D-LinkNet** (DeepGlobe winner) | IoU ~65 | GPU | road extraction |
| Land cover | **Google Dynamic World** (9-class, near-real-time), **ESA WorldCover** (11-class, 10 m) | OA ~75-90 | cloud/GPU | pixel land-cover; change = class transition |
| Land cover | **Prithvi-100M / SatMAE / Clay** foundation models | fine-tune | GPU | geospatial foundation models for custom tags |

## 4. Spectral indices (no ML, CPU, reliable, need multispectral)

Sentinel-2 has NIR/SWIR — indices are cheap and robust when bands are present.
(Our current Mashhad rasters are RGB TCI only, so these light up once we ingest
multiband S2 L2A.)

| Index | Formula | Detects |
|---|---|---|
| **NDVI** | (NIR−Red)/(NIR+Red) | vegetation health/cover |
| **NDWI** | (Green−NIR)/(Green+NIR) | open water |
| **NDBI** | (SWIR−NIR)/(SWIR+NIR) | built-up / impervious |
| **NDMI/NBR** | NIR/SWIR variants | moisture / burn |
| **BSI** | bare-soil index | bare earth / construction sites |
| **VARI** | (G−R)/(G+R−B) | greenness from **RGB only** (our current floor) |

Change = threshold the index delta (|NDVIₐ − NDVI_b| > τ), then polygonize.

## 5. Runtime tiers (why "user selectable")

| Tier | Hardware | Models available | Latency (1 km² tile) |
|---|---|---|---|
| `index` | any CPU | NDVI/NDWI/NDBI/VARI + heuristic | ms–s |
| `cpu` | modern CPU | TinyCD-int8, MobileSAM/FastSAM, DeepForest-cpu | s–min |
| `gpu` | ≥8 GB VRAM | ChangeFormer, SAM2/samgeo, Grounded-SAM, D-LinkNet | s |
| `cloud` | internet + allowed egress | hosted SAM/Dynamic World/any API | network-bound |

The product ships knowing every backend's tier. On a GPU server the user sees
and can pick the heavy models; on a laptop those are greyed/auto-fallback to the
CPU or index tier. Data-egress policy (org setting) hides cloud backends when off.

## 6. Licensing (product-relevant)

- SAM/SAM2, DeepForest, D-LinkNet, ChangeFormer, Open-CD, TinyCD — permissive
  (Apache-2.0 / MIT / CC) — OK to bundle.
- Google Open Buildings / Dynamic World — CC-BY / Earth Engine terms — attribute.
- Microsoft Building Footprints — ODbL — attribute/share-alike.
- Grounding DINO — Apache-2.0.

## 7. Roadmap (phased, per category)

1. **Framework + index/heuristic tier** (ships now, CPU, offline) — router,
   registry, tiers, NDVI/NDWI/NDBI/VARI, image_diff, urban.
2. **CPU DL tier** — TinyCD-int8 ONNX, DeepForest-cpu, FastSAM.
3. **GPU tier** — ChangeFormer, SAM2/samgeo (buildings/trees/roads via
   segment-diff), Grounded-SAM (open-vocab tags).
4. **Vector-diff tier** — Open Buildings / MS Footprints diff for new-building
   detection without inference.
5. **Ensemble "max-accuracy"** — fuse multiple backends per tag with confidence
   weighting.

Each phase = new adapter files behind the same `ModelBackend` interface; no
router changes.

## 8. Activating the CPU ML tier (DeepForest)

The default `ai-worker` image is lean (index + heuristic only). To run the CPU
deep-learning tier build the ML variant:

```
docker build -f services/ai-worker/Dockerfile.ml -t varasi-ai-worker:ml services/ai-worker
# then run that image in place of varasi-ai-worker
```

It adds CPU `torch`/`torchvision` + `deepforest` (~1.5 GB). `GET /models` then
reports `deepforest_tree` as `available: true`; the router uses it for the
`vegetation_*` tags on high-res RGB, falling back to the vegetation index on coarse
imagery. GPU/segment checkpoints mount at `/models` (`MODEL_WEIGHTS_DIR`).
