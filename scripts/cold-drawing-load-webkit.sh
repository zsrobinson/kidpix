#!/bin/bash
# Read-only existing inputs, private output, pinned installed engine; no pull.
set -eu
output="$PWD/artifacts/t3/cold-drawing-load"
mkdir -p "$output"
container="cold-drawing-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run --pull never --rm --init --name "$container" --network host --cap-drop ALL --shm-size 512m --user "$(id -u):$(id -g)" --workdir /work \
 --mount "type=bind,src=$PWD,dst=/work,readonly" \
 --mount "type=bind,src=$output,dst=/work/artifacts/t3/cold-drawing-load" \
 --mount "type=bind,src=$(realpath node_modules),dst=$(realpath node_modules),readonly" \
 --mount "type=bind,src=$(realpath public),dst=$(realpath public),readonly" \
 --env "REVISION=$(git rev-parse HEAD)" --env ENGINE=webkit --env "INSTRUMENT=${INSTRUMENT:-0}" --env "BUILT=${BUILT:-0}" \
 --env "COLD_OUT=artifacts/t3/cold-drawing-load/${LABEL:-webkit}" \
 --env "SCENARIOS=${SCENARIOS:-warm,art,ui,trays}" --env "TRIALS=${TRIALS:-1}" \
 --env "DECODE_LIMIT=${DECODE_LIMIT:-}" --env "NEGATIVE=${NEGATIVE:-0}" \
 mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
 node scripts/cold-drawing-load.mjs
