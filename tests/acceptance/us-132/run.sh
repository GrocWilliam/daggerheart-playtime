#!/usr/bin/env bash
set -uo pipefail
# Criteria (US-132), tests in sheet-selects.test.mjs, one per criterion:
# (1) class/subclass/ancestry/community on the sheet edit form are selects with SRD options; French labels, English/id values;
# (2) Wizard: subclass select lists only Wizard subclasses;
# (3) choosing another class, saving, reloading shows the new class and its subclass list;
# (4) legacy ancestry "Homebrew" is the selected option and saving keeps it (also community);
# (5) domain card picker is a select grouped by domain (optgroups) with SRD cards.
# (6) frozen tests: none needed changes (they already use selects); i18n/hardcoded tests run by make test.
# Starts node build with in-memory PGlite (no Docker).
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../.."
ROOT="$PWD"
HERE="$ROOT/tests/acceptance/us-132"
if [ -z "${FORGE_PREBUILT:-}" ]; then
  [ -d node_modules ] || npm ci
  npm run build || { echo "build failed" >&2; exit 1; }
fi
LOG="$(mktemp)"
DATA="$(mktemp -d)"
free_port() { node -e "const net=require('net');(function t(){const p=10000+Math.floor(Math.random()*22000),s=net.createServer().once('error',t).listen(p,()=>{console.log(p);s.close()})})()"; }
PID=""
start() {
  PORT_N=$(free_port)
  (unset DATABASE_URL; export PORT=$PORT_N PGLITE_DATA_DIR="$DATA"; exec node build) >>"$LOG" 2>&1 &
  PID=$!
  for _ in $(seq 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT_N/health")" = 200 ] && break
    sleep 0.5
  done
}
stop() { [ -n "$PID" ] && { kill $PID 2>/dev/null; wait $PID 2>/dev/null; PID=""; }; }
trap 'stop; rm -rf "$DATA"' EXIT
# The API refuses non-SRD ancestry values, so the legacy row is written straight into the database:
# create a character, stop the server, update the row with PGlite, restart.
start
SEED=$(BASE_URL="http://localhost:$PORT_N" node -e "
(async()=>{const B=process.env.BASE_URL,h={'content-type':'application/json'};
const c=await (await fetch(B+'/api/campaigns',{method:'POST',headers:h,body:JSON.stringify({name:'Legacy'})})).json();
const r=await (await fetch(B+'/api/campaigns/'+c.id+'/characters',{method:'POST',headers:h,body:JSON.stringify({name:'Old',class:'Wizard',level:1,evasion:10,majorThreshold:5,severeThreshold:10,maxHp:6,maxStress:6,armorSlots:3})})).json();
console.log(r.id)})()")
stop
node --input-type=module -e "
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite(process.argv[1]);
await db.query(\"UPDATE characters SET ancestry='Homebrew', community='Wanderers of old' WHERE id=\$1\", [process.argv[2]]);
await db.close();" "$DATA" "$SEED" || { echo "seeding failed" >&2; exit 1; }
start
BASE_URL="http://localhost:$PORT_N" PW_DIR="$PLAYWRIGHT_DIR" LEGACY_ID="$SEED" node --test "$HERE/sheet-selects.test.mjs"
RC=$?
[ $RC -ne 0 ] && { echo "--- server log ---"; cat "$LOG"; }
exit $RC
