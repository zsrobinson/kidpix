#!/bin/bash
set -eu
mkdir -p artifacts/t3/pencil-prediction-preview
exec 9>/var/tmp/kidpix-ui-validation.lock
flock 9
container="pencil-prediction-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run --pull never --rm --init --name "$container" --network host --cap-drop ALL --shm-size 512m --user "$(id -u):$(id -g)" --workdir /work \
 --mount "type=bind,src=$PWD,dst=/work,readonly" \
 --mount "type=bind,src=$PWD/artifacts/t3/pencil-prediction-preview,dst=/work/artifacts/t3/pencil-prediction-preview" \
 --mount "type=bind,src=$(realpath node_modules),dst=$(realpath node_modules),readonly" \
 --mount "type=bind,src=$(realpath public),dst=$(realpath public),readonly" \
 --env "PENCIL_CHECKS=${PENCIL_CHECKS:-}" --env "PENCIL_PREVIEW_FAULT=${PENCIL_PREVIEW_FAULT:-}" --env XDG_CACHE_HOME=/tmp/pencil-prediction \
 mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
 node scripts/pencil-prediction-preview.mjs
