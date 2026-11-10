#!/bin/bash
set -eu
label="${1:?output label required}"
case "$label" in *[!a-zA-Z0-9_-]*|'') exit 2;; esac
output="$PWD/artifacts/t3/ink-freshness"
mkdir -p "$output"
if [ -e "$output/$label" ]; then echo "Refusing to overwrite evidence: $output/$label" >&2; exit 2; fi
container="ink-freshness-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run --pull never --rm --init --name "$container" --network host --cap-drop ALL --shm-size 512m --user "$(id -u):$(id -g)" --workdir /work \
 --mount "type=bind,src=$PWD,dst=/work,readonly" \
 --mount "type=bind,src=$output,dst=/work/artifacts/t3/ink-freshness" \
 --mount "type=bind,src=$(realpath node_modules),dst=$(realpath node_modules),readonly" \
 --mount "type=bind,src=$(realpath public),dst=$(realpath public),readonly" \
 --env "REVISION=$(git rev-parse HEAD)" --env ENGINE=webkit --env PORT=4541 \
 --env XDG_CACHE_HOME=/tmp/ink-freshness --env INK_FRESHNESS=1 --env "INK_DELAY=${INK_DELAY:-0}" --env "INK_OBSERVE=${INK_OBSERVE:-1}" \
 --env TOOLS=pencil --env "PATTERNS=${PATTERNS:-60x1}" --env DRIVERS=inpage --env TRIALS=1 --env INSTRUMENT=0 --env UI_SCENARIO=quiescent \
 --env "CONTROL_MODE=${CONTROL_MODE:-full}" --env "PERF_OUT=artifacts/t3/ink-freshness/$label" \
 mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
 node scripts/shared-pen-perf.mjs
