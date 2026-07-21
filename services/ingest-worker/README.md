# varasi-ingest

Metadata-first raster ingestion. Turns a raster **source** into a STAC **Item**
(a Raster Profile) registered in pgSTAC. Source pixels are never copied — only
headers are read (via GDAL range requests) and a small quicklook is derived.

## Concepts
- **Provider** — resolves a source URI into `RasterRef`s (GDAL-openable paths).
  Registered: `file` (FilesystemProvider), `http`/`https` (HttpProvider),
  `s3` (S3Provider). Add a source type by implementing `providers.base.Provider`.
- **Raster Profile** — a STAC Item built by `profile.build_profile` using rio-stac
  (proj/raster/eo extensions from the header) + Varasi provenance fields.
- **Virtual Dataset** — a STAC Collection (`collections.make_collection`).

## Usage (via compose)
```bash
make seed                                   # ingest built-in sample COGs
make ingest SRC=https://host/scene.tif COLLECTION=my-set
make ingest SRC=s3://bucket/prefix/ COLLECTION=my-set
make ingest SRC=file:///data/orthos/       COLLECTION=drone
```
Direct:
```bash
docker compose --profile tools run --rm ingest \
  ingest --uri <uri> --collection <id> [--datetime ISO] [--prop k=v] [--no-thumbnail]
docker compose --profile tools run --rm ingest providers
```

## Flow
```
source uri ─▶ Provider.list ─▶ RasterRef ─▶ build_profile (rio-stac header read)
          ─▶ make_thumbnail (rio-tiler ─▶ MinIO) ─▶ StacClient.upsert_item (pgSTAC)
```

## Config (env, `VARASI_` prefix)
`STAC_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY,
S3_BUCKET, THUMB_SIZE, SRC_AWS_NO_SIGN`.
