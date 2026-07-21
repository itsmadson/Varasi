#!/usr/bin/env bash
# Create the derived-artifacts bucket in MinIO.
set -euo pipefail
: "${MINIO_ROOT_USER:=varasi}"
: "${MINIO_ROOT_PASSWORD:=varasiminio}"
: "${MINIO_BUCKET:=varasi-derived}"
: "${MINIO_PORT:=9000}"

docker run --rm --network varasi_default --entrypoint sh minio/mc -c "
  mc alias set local http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD} &&
  mc mb -p local/${MINIO_BUCKET} || true &&
  mc anonymous set download local/${MINIO_BUCKET} &&
  echo 'bucket ${MINIO_BUCKET} ready'
"
