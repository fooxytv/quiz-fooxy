#!/usr/bin/env bash
# Build and bring the stack up, then wait for the container to report healthy.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -f .env ]]; then
  echo "!! No .env file. Copy the example and fill it in first:" >&2
  echo "     cp .env.example .env" >&2
  exit 1
fi

# Without a tunnel token nothing can reach the quiz, so stop rather than start a
# stack that looks healthy and is unreachable.
if ! grep -qE '^TUNNEL_TOKEN=.+' .env; then
  echo "!! TUNNEL_TOKEN is empty in .env. Nothing could reach the quiz." >&2
  echo "   Zero Trust > Networks > Tunnels > your tunnel > Install and run a connector," >&2
  echo "   and copy the token out of the command it shows you." >&2
  exit 1
fi

# The host screen needs SOMETHING in front of it, or you cannot run a quiz.
pw="$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2- || true)"
access_ok=no
grep -qE '^CF_ACCESS_AUD=.+' .env && grep -qE '^CF_ACCESS_TEAM_DOMAIN=.+' .env && access_ok=yes

if [[ -z "$pw" && "$access_ok" == "no" ]]; then
  echo "!! No ADMIN_PASSWORD in .env, and Cloudflare Access is not configured." >&2
  echo "   The host screen would be sealed: players could play, but you could not" >&2
  echo "   open the leaderboard or start a round." >&2
  echo >&2
  echo "   Set one in .env:   ADMIN_PASSWORD=\$(openssl rand -base64 24)" >&2
  exit 1
fi

if [[ -n "$pw" && ${#pw} -lt 12 ]]; then
  echo "!! ADMIN_PASSWORD is only ${#pw} characters, on a publicly reachable" >&2
  echo "   hostname. Use something longer:  openssl rand -base64 24" >&2
  echo "   Continuing in 8s; Ctrl-C to change it." >&2
  sleep 8
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

echo "==> Validating the compose file and .env"
if ! "${COMPOSE[@]}" config -q; then
  echo "!! The compose file or .env could not be resolved. Nothing was built." >&2
  exit 1
fi

echo "==> Building"
BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" \
BUILD_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
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

# A healthy app behind a dead tunnel is still an unreachable site.
echo "==> Checking the tunnel"
tname="$("${COMPOSE[@]}" ps -q tunnel || true)"
tstate="$([[ -n "$tname" ]] && docker inspect -f '{{.State.Status}}' "$tname" 2>/dev/null || echo missing)"
if [[ "$tstate" != "running" ]]; then
  echo "!! The tunnel container is ${tstate}. The quiz is up but unreachable." >&2
  "${COMPOSE[@]}" logs --tail 30 tunnel >&2 || true
  exit 1
fi
if "${COMPOSE[@]}" logs --tail 50 tunnel 2>&1 | grep -qiE 'Registered tunnel connection|Connection .* registered'; then
  echo "    tunnel connected"
else
  echo "    tunnel running, but no registered connection in the last 50 log lines yet."
  echo "    Give it a few seconds, then: ./scripts/logs.sh tunnel"
fi

PUBLIC_URL="$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || true)"
echo
echo "==> Up"
"${COMPOSE[@]}" ps
echo
echo "    Players  ${PUBLIC_URL:-http://localhost:3000}"
echo "    Host     ${PUBLIC_URL:-http://localhost:3000}/admin"
echo
echo "    build    $(docker exec "$name" printenv BUILD_SHA 2>/dev/null || echo unknown)  (compare with: git rev-parse --short HEAD)"
echo
echo "Logs:  ./scripts/logs.sh          Tunnel logs:  ./scripts/logs.sh tunnel"
echo "Stop:  docker compose down        Backup:       ./scripts/backup.sh"
