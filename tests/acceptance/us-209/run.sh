#!/usr/bin/env bash
# Criteria (US-209) and where they are tested:
# (1) no src file reads the legacy French file; src/lib/srd/fr/ holds the 13 JSON-object files: files.test.mjs
# (2) the files hold 612 names, each on an element of its kind (Barde, Épée large, Arcanes examples): files.test.mjs
# (3) lang=fr GET /api/srd/weapons/core_weapon_broadsword: French name, rest English: api.test.mjs
# (4) lang=en / no cookie: English element exactly as before: api.test.mjs (+ srd.unit.ts)
# (5) lang=fr GET /api/srd/classes Barde nameLang fr; adversaries English nameLang en: api.test.mjs (+ srd.unit.ts)
# (6) 404 for weapons/nope and unknown kind: api.test.mjs
# (7) localizedSrd langs (name fr, untranslated field en) and wrong-shape fallback: srd.unit.ts, fallback.unit.ts
#     (fallback.unit.ts runs in a temporary copy of src/lib whose French files mutate.mjs edits)
# (8) searchSrd épée/broadsword in fr, not épée in en: srd.unit.ts
# (9) pickOptions('classes','fr') has {value:'Bard',label:'Barde'}; French tunnel with Barde creates the character: srd.unit.ts, api.test.mjs
# (10) TRANSLATED_FIELDS.adversaries / .domains exact (and the other kinds' rules): srd.unit.ts
# (11) srd-fr.test.ts passes, and fails once a French file gets an unknown id, a field outside TRANSLATED_FIELDS or a
#      list of the wrong length: mutation runs below, each in a temporary copy of src/lib (the repository is never edited)
# (12) make test passes: `npx vitest run` below
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-209"
[ -d node_modules ] || npm ci
if [ -z "${FORGE_PREBUILT:-}" ]; then
  npm run build || { echo "build failed" >&2; exit 1; }
fi
FAIL=0
TMPS=()
PID=""
cleanup() {
  [ -n "$PID" ] && { kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; }
  for d in "${TMPS[@]}"; do rm -rf "$d"; done
}
trap cleanup EXIT

echo "== srd.unit.ts"
npx vitest run --config "$HERE/vitest.config.ts" || FAIL=1

echo "== files.test.mjs"
node --test "$HERE/files.test.mjs" || FAIL=1

echo "== srd-fr.test.ts in the repository"
npx vitest run src/lib/server/features/srd-fr.test.ts || { echo "FAIL: srd-fr.test.ts does not pass"; FAIL=1; }

# A copy of src/lib with node_modules linked and a plain vitest config ($lib -> the copy).
copy_lib() {
  local d
  d="$(mktemp -d)"
  TMPS+=("$d")
  mkdir -p "$d/src"
  cp -r "$ROOT/src/lib" "$d/src/lib"
  ln -s "$ROOT/node_modules" "$d/node_modules"
  cat >"$d/vitest.config.mjs" <<CFG
import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: '$d',
  cacheDir: '$d/.vite',
  resolve: { alias: { \$lib: '$d/src/lib' } },
  test: { environment: 'node', include: ['fallback.unit.ts', 'src/**/*.test.ts'], testTimeout: 120000, hookTimeout: 120000 }
});
CFG
  echo "$d"
}
run_srd_fr() { (cd "$1" && npx vitest run --config "$1/vitest.config.mjs" src/lib/server/features/srd-fr.test.ts) >"$1/out.log" 2>&1; }

echo "== srd-fr.test.ts on an unmodified copy (must pass)"
D="$(copy_lib)"
if run_srd_fr "$D"; then
  for c in unknown-id unknown-id-adversary extra-field wrong-length; do
    echo "== srd-fr.test.ts with mutation '$c' (must fail)"
    D="$(copy_lib)"
    node "$HERE/mutate.mjs" "$D" "$c" || { echo "FAIL: mutation $c could not be applied"; FAIL=1; continue; }
    if run_srd_fr "$D"; then echo "FAIL: srd-fr.test.ts still passes with mutation $c"; FAIL=1; else echo "ok: fails with $c"; fi
  done
else
  echo "FAIL: srd-fr.test.ts does not pass on an unmodified copy of src/lib"; tail -30 "$D/out.log"; FAIL=1
fi

echo "== fallback.unit.ts (wrong-shape French fields fall back to English)"
D="$(copy_lib)"
node "$HERE/mutate.mjs" "$D" fallback && cp "$HERE/fallback.unit.ts" "$D/fallback.unit.ts" \
  && (cd "$D" && npx vitest run --config "$D/vitest.config.mjs" fallback.unit.ts) || FAIL=1

echo "== make test (vitest)"
npx vitest run || FAIL=1

echo "== API and tunnel"
LOG="$(mktemp)"
TMPS+=("$LOG")
PORT_N=$(node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()")
(unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="memory://"; exec node build) >"$LOG" 2>&1 &
PID=$!
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
  sleep 0.5
done
BASE_URL="http://localhost:$PORT_N" node --test "$HERE/api.test.mjs" || { FAIL=1; echo "--- server log ---"; tail -20 "$LOG"; }
exit $FAIL
