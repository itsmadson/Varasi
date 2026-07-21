# Deploy

## Observability (local)
```bash
docker compose --profile observability up -d prometheus grafana
```
- Prometheus → http://localhost:9090 (scrapes control-plane `/metrics`)
- Grafana → http://localhost:3001 (anonymous view; admin pw `GRAFANA_PASSWORD`)

Control-plane exposes `varasi_http_requests_total` and
`varasi_http_request_duration_seconds`, labelled by route pattern.

## Kubernetes (Helm)
The chart deploys the stateless Varasi services (control-plane, ai-worker, web).
Postgres+pgSTAC, Redis, MinIO/S3 and the eoAPI services (stac/titiler/tipg) are
provided as external/managed endpoints via `values.external.*`.

```bash
helm install varasi ./helm/varasi \
  --set image.registry=ghcr.io/itsmadson \
  --set image.tag=0.1.0 \
  --set external.databaseUrl='postgres://…' \
  --set external.stacUrl='http://stac:8080' \
  --set secrets.jwtSecret=… --set secrets.internalToken=…
```
DL inference: set `aiWorker.gpu=true` to schedule on a GPU node pool
(`varasi.io/gpu=true`) and request `nvidia.com/gpu`.

## CI
`.github/workflows/ci.yml` — builds/vets/tests Go, builds the web app, installs the
Python services, then builds all service images. Runs on push to `main` and PRs.
