#!/usr/bin/env bash
cd "$ROOT"
node -e '
const e=require("./package.json").engines;
if(!e||e.node!==">=26"){console.error("engines.node is",JSON.stringify(e));process.exit(1)}'
