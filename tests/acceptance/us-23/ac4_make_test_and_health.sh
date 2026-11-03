#!/usr/bin/env bash
# AC: make test exits 0; node build answers GET /health 200 {"status":"ok"} on 8080.
cd "$ROOT"
make test || { echo "make test failed" >&2; exit 1; }
[ -n "${FORGE_PREBUILT:-}" ] || npm run build || { echo "build failed" >&2; exit 1; }
LOG="$(mktemp)"
(unset DATABASE_URL PORT PGLITE_DATA_DIR; exec node build) >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8080/health)"
  [ "$code" = 200 ] && break; sleep 0.5
done
[ "$code" = 200 ] || { echo "health not 200 ($code)"; cat "$LOG"; exit 1; }
body="$(curl -s --max-time 5 http://localhost:8080/health)"
node -e 'const b=JSON.parse(process.argv[1]);const k=Object.keys(b);process.exit(k.length==1&&b.status==="ok"?0:1)' "$body" \
  || { echo "unexpected body: $body" >&2; exit 1; }
