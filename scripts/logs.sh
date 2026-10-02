#!/usr/bin/env bash
# Follow the application log (add a service name to narrow it, e.g. ./scripts/logs.sh tunnel).
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec docker compose logs -f --tail 100 "${1:-quiz}"
