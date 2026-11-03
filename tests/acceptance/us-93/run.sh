#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-93), tests in zod-srd-language.test.mjs:
# (1) srd.ts exports Zod schemas; isSrdKind/isLang manual checks are gone from src/routes;
# (2) /api/srd unknown kind -> 404 "unknown SRD kind"; unknown id -> 404 "unknown SRD element"; valid ones still work;
# (3) POST /api/language: cookie set + 204; bad lang -> 400 'lang must be "en" or "fr"'; malformed JSON -> 400;
# (4) /reference kind/q query and form-data inputs keep their behavior.
# Per-schema unit tests (valid, rejections, boundaries) live next to the code and run in `make test`; so do
# `make build` and the other stories' scripts in CI.
# Starts `node build` on a free port with PGLITE_DATA_DIR=memory:// (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-93"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" ROOT="$ROOT" node --test "$HERE/zod-srd-language.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
