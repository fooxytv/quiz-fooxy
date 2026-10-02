#!/usr/bin/env bash
# Build the image on this machine. Safe to re-run; layers are cached.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE="${IMAGE:-marvel-quiz}"
TAG="${TAG:-latest}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"

echo "==> Building ${IMAGE}:${TAG}  (source ${GIT_SHA})"
docker build --pull \
  --build-arg "BUILD_SHA=${GIT_SHA}" --build-arg "BUILD_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
  --tag "${IMAGE}:${TAG}" --tag "${IMAGE}:${GIT_SHA}" .

echo
echo "==> Built"
docker image ls "${IMAGE}" --format '    {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}'
echo
echo "Next:  ./scripts/deploy.sh"
