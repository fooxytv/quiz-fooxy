#!/usr/bin/env bash
# Collects everything needed to diagnose a build or start failure.
# Paste the whole output when something will not come up.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

line() { printf '\n--- %s ---\n' "$1"; }

echo "marvel-quiz doctor   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

line "host"
uname -srm
echo "shell: ${BASH_VERSION:-unknown}"
command -v node >/dev/null && echo "host node: $(node -v)" || echo "host node: not installed (fine, Docker does not need it)"

line "docker"
docker --version 2>&1 || echo "docker: NOT FOUND"
docker compose version 2>&1 | head -1 || echo "docker compose: NOT FOUND (try docker-compose)"
docker info --format 'server: {{.ServerVersion}}  arch: {{.Architecture}}  os: {{.OperatingSystem}}' 2>&1

line "base image"
docker image ls node --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}  {{.Size}}' 2>&1 | head -5
echo "(a node:24 tag older than the project is the usual cause of a node:sqlite failure)"

line "node inside the base image"
docker run --rm node:24-bookworm-slim node -e \
  'const v=process.version; let ok=false; try{ok=typeof require("node:sqlite").DatabaseSync==="function"}catch(e){}; console.log(v, "node:sqlite ->", ok?"available":"MISSING")' 2>&1 | tail -3

line "project images"
docker image ls marvel-quiz --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}  {{.Size}}' 2>&1 | head -6

line "containers"
docker ps -a --filter name=marvel-quiz --format '{{.Names}}  {{.Status}}  {{.Ports}}' 2>&1

line "app log (last 40 lines)"
docker logs --tail 40 marvel-quiz-local 2>&1 || echo "(local container not present)"

line "ports"
for p in 8099 3000; do
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:$p -sTCP:LISTEN 2>/dev/null | tail -2 || echo "$p: free"
  else
    echo "$p: cannot check (no lsof)"
  fi
done

line "disk"
df -h . 2>&1 | tail -2

line "files"
for f in Dockerfile docker-compose.local.yml package.json package-lock.json; do
  [[ -f $f ]] && echo "ok   $f" || echo "MISS $f"
done
grep -m1 '^FROM' Dockerfile 2>/dev/null
grep -c better-sqlite3 package-lock.json 2>/dev/null | sed 's/^/better-sqlite3 refs in lockfile: /'

echo
echo "done. If a build failed, re-run it capturing everything:"
echo "    ./scripts/local.sh 2>&1 | tee /tmp/quiz-build.log"
