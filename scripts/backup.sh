#!/usr/bin/env bash
# Copy the SQLite database and word list out of the volume, for keeping results.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="${1:-backups}"
mkdir -p "$OUT"
stamp="$(date +%Y%m%d-%H%M%S)"
name="$(docker compose ps -q quiz)"

if [[ -z "$name" ]]; then
  echo "!! The quiz container is not running." >&2
  exit 1
fi

# .backup gives a consistent copy even while the server is writing.
docker exec "$name" node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.env.DATA_DIR + "/quiz.sqlite");
  db.exec("VACUUM INTO '"'"'/tmp/snapshot.sqlite'"'"'");
'
docker cp "$name:/tmp/snapshot.sqlite" "$OUT/quiz-$stamp.sqlite"
docker exec "$name" sh -c 'rm -f /tmp/snapshot.sqlite'
docker cp "$name:/data/words.json" "$OUT/words-$stamp.json" 2>/dev/null || true

echo "==> Wrote $OUT/quiz-$stamp.sqlite"
ls -la "$OUT" | tail -5
