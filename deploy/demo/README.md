# Varasi — Demo Server Setup

Fits the shared-nginx pattern: each app runs its own compose and publishes host
ports; the central `nginx` container proxies a subdomain to those ports.

**Nothing is source-mounted.** Services run from prebuilt images on ghcr; the only
persisted state is Docker **named volumes** (`pgdata`, `miniodata`). Code is NOT
volumed — to update, pull new images.

Only two containers face nginx:

| Container | Host port (`.env`) | nginx routes |
|---|---|---|
| `web` (Next.js) | `WEB_PORT` (9292) | `location /` |
| `control-plane` (Go API) | `CONTROL_PORT` (8282) | `/api/ /catalog/ /ws /docs` |

`control-plane` internally fronts stac + titiler + tipg + ai-worker + ingest —
they stay on the compose network with no host ports.

## 1. Files

Put these in the app folder on the demo (e.g. `/root/mithra`):

```
/root/mithra/
  docker-compose.yml      # from deploy/demo/docker-compose.yml
  .env                    # from .env.example — fill in secrets
  seed.sh                 # optional demo data
```

## 2. Secrets

```bash
cd /root/mithra
cp .env.example .env
# set POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, JWT_SECRET, INTERNAL_TOKEN, WEB_ORIGIN
openssl rand -hex 32   # good value for JWT_SECRET / INTERNAL_TOKEN
```

## 3. Pull the images

The `varasi-*` images are on ghcr. If the packages are **private**, log in first:

```bash
echo <GITHUB_TOKEN> | docker login ghcr.io -u itsmadson --password-stdin
```

(or make the packages public on GitHub → Packages → each → Change visibility.)

```bash
docker compose pull
docker compose up -d
docker compose ps          # all healthy
```

DB migrations run automatically on control-plane start.

## 3b. (optional) higher-accuracy ML model

The default `ai-worker` is lean (index + heuristic). To enable the DeepForest CPU
model, point the `ai-worker` service at `ghcr.io/itsmadson/varasi-ai-worker-ml`
(build & push it from `services/ai-worker/Dockerfile.ml`) — not required for the demo.

## 4. Which compose to `up`

Just this one: **`/root/mithra/docker-compose.yml`** (`deploy/demo/docker-compose.yml`).
Do **not** use the repo root `docker-compose.yml` on the demo — that one builds
from source and publishes every port.

## 5. nginx

```bash
# pick the subdomain + host IP + ports, then:
cp deploy/demo/varasi.conf /root/nginx_config/conf.d/varasi.conf
# edit: server_name, 185.53.142.74 → demo IP, 8282/9292 → your .env ports
# ensure DNS + a cert for the subdomain exist (same as the other apps)
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

## 6. Seed demo data (Ahvaz + Mashhad)

Fresh DB is empty. Seed the two Iranian cities + watch areas + alerts:

```bash
BASE=https://varasi.geotajak.ir EMAIL=admin@varasi.ir PASS=<pw> bash seed.sh
```

Then log in at the subdomain with that account. Dashboard, Alerts (Ahvaz/Mashhad
critical), Detection, Permits, Developers (API keys) are all live.

## Update later

```bash
docker compose pull && docker compose up -d
```

## Ports summary (host)

Only `9292` (web) and `8282` (control-plane) are published — change in `.env` if
they collide with another app on the demo host.
