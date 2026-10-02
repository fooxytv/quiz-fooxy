#!/usr/bin/env bash
# Build and bring the stack up, then wait for the container to report healthy.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f .env ]]; then
  echo "!! No .env file. Copy the example and fill it in first:" >&2
  echo "     cp .env.example .env" >&2
  exit 1
fi

# Warn about placeholders rather than deploying a half-configured admin portal.
missing=()
grep -q '^CF_ACCESS_AUD=.\+'                  .env || missing+=("CF_ACCESS_AUD")
grep -q '^CF_ACCESS_TEAM_DOMAIN=.\+'          .env || missing+=("CF_ACCESS_TEAM_DOMAIN")
grep -qE '^CF_ACCESS_TEAM_DOMAIN=yourteam\.'  .env && missing+=("CF_ACCESS_TEAM_DOMAIN (still the placeholder)")
if (( ${#missing[@]} )); then
  echo "!! The admin portal will refuse every request until these are set in .env:" >&2
  printf '     - %s\n' "${missing[@]}" >&2
  echo "   Players can still play. Continuing in 5s; Ctrl-C to stop." >&2
  sleep 5
fi

# These belong to local testing only. Refuse rather than warn: a deploy that
# quietly weakens the admin portal is worse than a deploy that stops.
for leak in ADMIN_INSECURE_LOCAL ADMIN_DEV_BYPASS; do
  if grep -qE "^${leak}=1" .env; then
    echo "!! ${leak}=1 is set in .env. That is a local-testing flag; remove it before deploying." >&2
    echo "   (The image sets NODE_ENV=production, which already neutralises ADMIN_INSECURE_LOCAL," >&2
    echo "    but it has no business in a deployed config.)" >&2
    exit 1
  fi
done

COMPOSE=(docker compose)
docker compose version >/dev/null 2>&1 || COMPOSE=(docker-compose)

echo "==> Building"
"${COMPOSE[@]}" build --pull

echo "==> Starting"
"${COMPOSE[@]}" up -d

echo "==> Waiting for health"
name="$("${COMPOSE[@]}" ps -q quiz)"
for i in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo starting)"
  if [[ "$status" == "healthy" ]]; then
    echo "    healthy after ${i}s"
    break
  fi
  if [[ "$status" == "unhealthy" ]]; then
    echo "!! Container reported unhealthy. Recent logs:" >&2
    "${COMPOSE[@]}" logs --tail 40 quiz >&2
    exit 1
  fi
  sleep 1
done

if [[ "${status:-}" != "healthy" ]]; then
  echo "!! Gave up waiting (last status: ${status:-unknown}). Recent logs:" >&2
  "${COMPOSE[@]}" logs --tail 40 quiz >&2
  exit 1
fi

PUBLIC_URL="$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || true)"
echo
echo "==> Up"
"${COMPOSE[@]}" ps
echo
echo "    Players  ${PUBLIC_URL:-http://localhost:3000}"
echo "    Host     ${PUBLIC_URL:-http://localhost:3000}/admin"
echo
echo "Logs:  ./scripts/logs.sh      Stop:  docker compose down"
