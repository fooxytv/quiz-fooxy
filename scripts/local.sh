#!/usr/bin/env bash
# Run the quiz locally in Docker, including the host portal.
#
#   ./scripts/local.sh [up]   build and start on http://localhost:8099
#   ./scripts/local.sh lan    start bound to all interfaces, for phone testing
#   ./scripts/local.sh test   run the end-to-end suite against the container
#   ./scripts/local.sh logs   follow the container log
#   ./scripts/local.sh down   stop and remove it
#   ./scripts/local.sh fresh  wipe the local database and restart clean
#   ./scripts/local.sh version is the running container actually your code?
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT="${LOCAL_PORT:-8099}"
FILE=docker-compose.local.yml
COMPOSE=(docker compose -f "$FILE")
docker compose version >/dev/null 2>&1 || COMPOSE=(docker-compose -f "$FILE")

lan_ip() {
  # First non-loopback IPv4 on this machine.
  if command -v ipconfig >/dev/null 2>&1; then
    for dev in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$dev" 2>/dev/null || true)"
      [[ -n "$ip" ]] && { echo "$ip"; return; }
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -n "$ip" ]] && { echo "$ip"; return; }
  fi
  echo ""
}

stamp() {
  BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)$(git diff --quiet 2>/dev/null || echo -dirty)"
  BUILD_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  export BUILD_SHA BUILD_AT
}

start() {
  local bind="$1" url="$2"
  stamp
  echo "==> Building the image from this working tree  (${BUILD_SHA})"
  LOCAL_BIND="$bind" LOCAL_PORT="$PORT" LOCAL_PUBLIC_URL="$url" "${COMPOSE[@]}" build --pull

  echo "==> Starting"
  LOCAL_BIND="$bind" LOCAL_PORT="$PORT" LOCAL_PUBLIC_URL="$url" "${COMPOSE[@]}" up -d

  echo "==> Waiting for health"
  local name status=starting
  name="$("${COMPOSE[@]}" ps -q quiz)"
  for i in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo starting)"
    [[ "$status" == healthy ]] && { echo "    healthy after ${i}s"; break; }
    if [[ "$status" == unhealthy ]]; then
      echo "!! Container is unhealthy. Recent logs:" >&2
      "${COMPOSE[@]}" logs --tail 40 quiz >&2
      exit 1
    fi
    sleep 1
  done
  if [[ "$status" != healthy ]]; then
    echo "!! Gave up waiting (last status: $status). Recent logs:" >&2
    "${COMPOSE[@]}" logs --tail 40 quiz >&2
    exit 1
  fi

  echo
  echo "    Running  $(curl -fsS "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | sed -n 's/.*"sha":"\([^"]*\)".*/build \1/p')"
  echo "    Players  $url"
  echo "    Host     $url/admin"
  echo
  if [[ "$bind" != "127.0.0.1" ]]; then
    echo "    Bound to all interfaces, so the QR code on the host screen will"
    echo "    work from a phone on the same network. Anyone on that network can"
    echo "    also open /admin -- it is a local test, not a deployment."
    echo
  fi
  echo "Test:  ./scripts/local.sh test     Logs:  ./scripts/local.sh logs"
  echo "Stop:  ./scripts/local.sh down     Wipe:  ./scripts/local.sh fresh"
}

case "${1:-up}" in
  up)
    start "127.0.0.1" "http://localhost:${PORT}"
    ;;
  lan)
    ip="$(lan_ip)"
    if [[ -z "$ip" ]]; then
      echo "!! Could not work out this machine's LAN address. Pass it yourself:" >&2
      echo "     LOCAL_PUBLIC_URL=http://192.168.1.50:${PORT} LOCAL_BIND=0.0.0.0 ./scripts/local.sh up" >&2
      exit 1
    fi
    start "0.0.0.0" "http://${ip}:${PORT}"
    ;;
  test)
    name="$("${COMPOSE[@]}" ps -q quiz 2>/dev/null || true)"
    if [[ -z "$name" ]]; then
      echo "!! Not running. Start it first: ./scripts/local.sh" >&2
      exit 1
    fi
    echo "==> Running the suite against the container on :${PORT}"
    BASE="http://127.0.0.1:${PORT}" node test/smoke.mjs
    ;;
  version)
    want="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)$(git diff --quiet 2>/dev/null || echo -dirty)"
    have="$(curl -fsS "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | sed -n 's/.*"sha":"\([^"]*\)".*/\1/p')"
    echo "working tree : ${want}"
    echo "container    : ${have:-not running}"
    if [[ -z "$have" ]]; then
      echo "=> Not running. Start it: ./scripts/local.sh"
    elif [[ "$have" == "$want" ]]; then
      echo "=> Up to date."
    else
      echo "=> BEHIND. The container is not running your current code:"
      echo "   ./scripts/local.sh"
    fi
    ;;
  logs)
    exec "${COMPOSE[@]}" logs -f --tail 100 quiz
    ;;
  down)
    "${COMPOSE[@]}" down
    echo "==> Stopped. The local database volume is kept; use 'fresh' to wipe it."
    ;;
  fresh)
    "${COMPOSE[@]}" down -v
    echo "==> Local data wiped"
    start "127.0.0.1" "http://localhost:${PORT}"
    ;;
  *)
    echo "Usage: ./scripts/local.sh [up|lan|test|logs|down|fresh]" >&2
    exit 2
    ;;
esac
