#!/usr/bin/env bash
# AC: Dockerfile starts with FROM node:26-bookworm, npm ci, npm run build, node build, EXPOSE 8080.
cd "$ROOT"; f=Dockerfile; rc=0
first="$(grep -vE '^\s*(#|$)' $f | head -1)"
[[ "$first" =~ ^FROM[[:space:]]+node:26-bookworm[[:space:]]*$ ]] || { echo "first instruction is not 'FROM node:26-bookworm': $first" >&2; rc=1; }
grep -qE '^RUN[[:space:]]+npm ci\b' $f || { echo "missing RUN npm ci" >&2; rc=1; }
grep -qE '^RUN[[:space:]]+npm run build\b' $f || { echo "missing RUN npm run build" >&2; rc=1; }
grep -qE '^CMD[[:space:]]+(\["node",[[:space:]]*"build"\]|node[[:space:]]+build)[[:space:]]*$' $f || { echo "CMD is not node build" >&2; rc=1; }
grep -qE '^EXPOSE[[:space:]]+8080\b' $f || { echo "missing EXPOSE 8080" >&2; rc=1; }
exit $rc
