#!/usr/bin/env bash
# Wait until core compose services report healthy.
set -euo pipefail
services=(database redis minio)
echo "Waiting for services: ${services[*]}"
for s in "${services[@]}"; do
  printf "  %-10s " "$s"
  for _ in $(seq 1 40); do
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "varasi-$s-1" 2>/dev/null || echo "missing")
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      echo "OK ($status)"; break
    fi
    sleep 3
  done
done
echo "Done."
