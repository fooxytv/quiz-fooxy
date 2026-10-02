#!/usr/bin/env bash
# Collects everything needed to diagnose a deploy that is up but unreachable,
# or will not start. Paste the whole output when something is wrong.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

line() { printf '\n--- %s ---\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "marvel-quiz doctor   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

line "host"
uname -srm
have node && echo "host node: $(node -v)" || echo "host node: not installed (fine, Docker does not need it)"
have docker && docker --version || echo "docker: NOT FOUND"
docker compose version 2>/dev/null | head -1 || echo "docker compose: NOT FOUND"

line "which stack is running"
docker ps -a --filter name=marvel-quiz --format '{{.Names}}  {{.Status}}  {{.Ports}}' 2>&1

# Deployed stack uses these names; the local one appends -local.
APP=marvel-quiz
TUN=marvel-quiz-tunnel
docker inspect "$APP" >/dev/null 2>&1 || APP=marvel-quiz-local

line "config (.env)"
if [[ -f .env ]]; then
  # Never print secrets: show only whether each is set and how long it is.
  while IFS='=' read -r k v; do
    [[ -z "${k// }" || "$k" == \#* ]] && continue
    case "$k" in
      TUNNEL_TOKEN|ADMIN_PASSWORD|CF_ACCESS_AUD)
        if [[ -n "$v" ]]; then echo "$k: set (${#v} chars)"; else echo "$k: EMPTY"; fi ;;
      *) echo "$k=$v" ;;
    esac
  done < .env
else
  echo ".env: MISSING"
fi

PUBLIC_URL="$(grep -E '^PUBLIC_URL=' .env 2>/dev/null | cut -d= -f2- || true)"
HOSTNAME_ONLY="$(printf '%s' "${PUBLIC_URL:-}" | sed -E 's#^https?://##; s#/.*$##')"

line "does the public hostname resolve?"
if [[ -z "$HOSTNAME_ONLY" ]]; then
  echo "PUBLIC_URL is not set, so there is nothing to check."
elif have dig; then
  rec="$(dig +short "$HOSTNAME_ONLY" | tr '\n' ' ')"
  if [[ -n "$rec" ]]; then
    echo "$HOSTNAME_ONLY -> $rec"
  else
    echo "$HOSTNAME_ONLY -> NO DNS RECORD"
    echo
    echo "   That is almost always the problem. A healthy connector only means"
    echo "   cloudflared is talking to Cloudflare; it does not route anything."
    echo "   Add it in Zero Trust > Networks > Tunnels > your tunnel >"
    echo "   Public Hostname > Add a public hostname:"
    echo "       Subdomain  ${HOSTNAME_ONLY%%.*}"
    echo "       Domain     ${HOSTNAME_ONLY#*.}"
    echo "       Type       HTTP"
    echo "       URL        quiz:3000        <- service name and container port"
    echo "   Cloudflare creates the DNS record itself when you add it."
  fi
else
  echo "(no dig installed; try: curl -sS -o /dev/null -w '%{http_code}\n' ${PUBLIC_URL})"
fi

line "the app, from inside its own container"
if docker inspect "$APP" >/dev/null 2>&1; then
  echo "container: $APP"
  echo "health:   $(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "$APP" 2>&1)"
  echo "build:    $(docker exec "$APP" printenv BUILD_SHA 2>/dev/null || echo unknown)"
  docker exec "$APP" node -e \
    'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/healthz").then(r=>r.text()).then(t=>console.log("healthz:  "+t)).catch(e=>console.log("healthz:  FAILED "+e.message))' 2>&1 | tail -2
else
  echo "no app container found"
fi

line "the tunnel"
if docker inspect "$TUN" >/dev/null 2>&1; then
  echo "status: $(docker inspect -f '{{.State.Status}}' "$TUN" 2>&1)"
  if docker logs --tail 80 "$TUN" 2>&1 | grep -qiE 'Registered tunnel connection|Connection .* registered'; then
    echo "connector: registered with Cloudflare"
  else
    echo "connector: NO registered connection in the last 80 lines"
  fi
  if docker logs --tail 120 "$TUN" 2>&1 | grep -qiE 'Unable to reach the origin|dial tcp|connection refused'; then
    echo "origin:    the tunnel CANNOT reach the app -- check the Public Hostname URL is quiz:3000"
  fi
  echo "last 15 tunnel log lines:"
  docker logs --tail 15 "$TUN" 2>&1 | sed 's/^/    /'
else
  echo "no tunnel container found (fine for the local stack)"
fi

line "app log (last 30 lines)"
docker logs --tail 30 "$APP" 2>&1 | sed 's/^/    /' || echo "(none)"

line "disk"
df -h . 2>&1 | tail -2

echo
echo "done."
