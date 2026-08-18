#!/usr/bin/env bash
# Seed the demo: create an owner account, ingest Ahvaz + Mashhad Sentinel-2
# pairs, create a watch area per city, and evaluate (raises the demo alerts).
#
#   BASE=https://varasi.geotajak.ir EMAIL=admin@varasi.ir PASS=... ./seed.sh
# BASE may also be the direct API, e.g. http://185.53.142.74:8282
set -euo pipefail

BASE="${BASE:-http://localhost:8282}"
EMAIL="${EMAIL:-admin@varasi.ir}"
PASS="${PASS:-varasi12345}"
API="$BASE/api/v1"

jq_get() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))"; }

echo "→ register (ignore error if the user already exists)"
TOKEN=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"org_name\":\"Varasi Demo\"}" | jq_get token || true)
if [ -z "$TOKEN" ]; then
  TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq_get token)
fi
[ -n "$TOKEN" ] || { echo "no token — check credentials"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

ingest() { curl -s -X POST "$API/ingest" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"uri\":\"$1\",\"collection\":\"$2\",\"datetime\":\"$3\"}"; echo; }

S3=https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs

echo "→ ingest Ahvaz (tile 39RTQ, 2020 + 2024)"
ingest "$S3/39/R/TQ/2020/8/S2B_39RTQ_20200823_1_L2A/TCI.tif" sentinel-2-ahvaz 2020-08-23T00:00:00Z
ingest "$S3/39/R/TQ/2024/8/S2B_39RTQ_20240819_0_L2A/TCI.tif" sentinel-2-ahvaz 2024-08-19T00:00:00Z

echo "→ ingest Mashhad (tile 40SGF, 2020 + 2024)"
ingest "$S3/40/S/GF/2020/8/S2B_40SGF_20200821_1_L2A/TCI.tif" sentinel-2-mashhad 2020-08-21T00:00:00Z
ingest "$S3/40/S/GF/2024/6/S2A_40SGF_20240626_0_L2A/TCI.tif" sentinel-2-mashhad 2024-06-26T00:00:00Z

watch() { # name  polygon-json
  local id
  id=$(curl -s -X POST "$API/watch-areas" -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"priority\":1,\"threshold\":0.05,\"max_cloud\":0,\"classifier\":\"urban\",\"alert_classes\":[],\"geometry\":$2}" | jq_get id)
  echo "  watch area $1 = $id"
  [ -n "$id" ] && curl -s -X POST "$API/watch-areas/$id/evaluate" -H "$AUTH" >/dev/null && echo "  evaluated"
}

echo "→ watch areas + evaluate (raises demo alerts)"
watch "Ahvaz city"   '{"type":"Polygon","coordinates":[[[48.55,31.24],[48.78,31.24],[48.78,31.40],[48.55,31.40],[48.55,31.24]]]}'
watch "Mashhad city" '{"type":"Polygon","coordinates":[[[59.45,36.20],[59.78,36.20],[59.78,36.42],[59.45,36.42],[59.45,36.20]]]}'

echo "✓ seed complete. Log in at $BASE with $EMAIL"
