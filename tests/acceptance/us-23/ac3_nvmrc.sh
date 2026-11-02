#!/usr/bin/env bash
cd "$ROOT"
[ -f .nvmrc ] || { echo ".nvmrc missing" >&2; exit 1; }
[ "$(tr -d ' \t\r\n' < .nvmrc)" = "26" ] || { echo ".nvmrc is not 26: $(cat .nvmrc)" >&2; exit 1; }
