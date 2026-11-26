#!/usr/bin/env bash
# Criteria (US-413): home-cards.test.mjs, one test per criterion (card link + name + meta in en, no scene/no journal en+fr, 0 characters and no current scene,
# newest journal date only, no campaign-run-link on Home but still on the sheet, empty state, browser geometry/click at 3 viewports, muted smaller meta, docs/ui.md).
# Uses a temporary PostgreSQL (initdb/pg_ctl) so journal entries can be back-dated with psql: the API has no way to set a date.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-413"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
freeport() { node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()"; }
LOG="$(mktemp)"; PGDIR="$(mktemp -d)"
PG_PORT=$(freeport)
# initdb/pg_ctl refuse to run as root (CI): drop to an unprivileged user then.
asu() { "$@"; }
if [ "$(id -u)" = 0 ]; then
  PGUSER_OS=postgres; id postgres >/dev/null 2>&1 || PGUSER_OS=nobody
  chown "$PGUSER_OS" "$PGDIR"; chmod 755 "$PGDIR"
  asu() { setpriv --reuid="$PGUSER_OS" --regid="$(id -g "$PGUSER_OS")" --clear-groups env HOME="$PGDIR" "$@"; }
fi
asu initdb -D "$PGDIR/data" -U postgres -A trust >/dev/null || { echo "initdb failed"; exit 1; }
asu pg_ctl -D "$PGDIR/data" -o "-p $PG_PORT -k $PGDIR -c listen_addresses=127.0.0.1" -l "$PGDIR/pg.log" -w start >/dev/null || { cat "$PGDIR/pg.log"; exit 1; }
PORT_N=$(freeport)
PID=
cleanup() { [ -n "$PID" ] && kill $PID 2>/dev/null && wait $PID 2>/dev/null; asu pg_ctl -D "$PGDIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$PGDIR"; }
trap cleanup EXIT
export PG_URL="postgres://postgres@127.0.0.1:$PG_PORT/postgres"
(export DATABASE_URL="$PG_URL" PORT=$PORT_N; exec node build) >"$LOG" 2>&1 &
PID=$!
UP=0
for _ in $(seq 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && { UP=1; break; }
  sleep 0.5
done
[ $UP = 1 ] || { echo "server did not start"; cat "$LOG"; exit 1; }
BASE_URL="http://localhost:$PORT_N" node --test --test-timeout=300000 "$HERE/home-cards.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; tail -30 "$LOG"; }
exit $RC
