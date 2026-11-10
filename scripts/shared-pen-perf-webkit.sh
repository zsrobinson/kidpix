#!/bin/bash
# Existing local dependencies/media and pinned image only; never pull/install.
set -eu
label="${1:-webkit}"
case "$label" in *[!a-zA-Z0-9_-]*|'') echo 'Use a simple output label' >&2; exit 2;; esac
repository="$PWD"
output="$repository/${PERF_ROOT:-artifacts/t3/shared-pen-performance}"
mkdir -p "$output"
dependencies="$(realpath node_modules)"
media="$(realpath public)"
image='mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d'
docker image inspect "$image" >/dev/null
git_mount=()
if [ -n "${MOTION_REVISION:-}" ]; then
 git_common="$(realpath "$(git rev-parse --git-common-dir)")"
 git_mount=(--mount "type=bind,src=$git_common,dst=$git_common,readonly")
fi
container="shared-pen-$$"
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker run --pull never --rm --init --name "$container" --network host --cap-drop ALL --shm-size 512m --user "$(id -u):$(id -g)" --workdir /work \
 --mount "type=bind,src=$repository,dst=/work,readonly" \
 --mount "type=bind,src=$output,dst=/work/${PERF_ROOT:-artifacts/t3/shared-pen-performance}" \
 "${git_mount[@]}" \
 --mount "type=bind,src=$dependencies,dst=$dependencies,readonly" \
 --mount "type=bind,src=$media,dst=$media,readonly" \
 --env "MOTION_REVISION=${MOTION_REVISION:-}" --env "MAX_MOTION_RGBA_BYTES=${MAX_MOTION_RGBA_BYTES:-}" \
 --env "REVISION=$(git rev-parse HEAD)" --env "PORT=${PORT:-4251}" --env ENGINE=webkit \
 --env XDG_CACHE_HOME=/tmp/shared-pen --env "SCENE=${SCENE:-blank}" \
 --env "DISPLAY_READ_FREQUENTLY=${DISPLAY_READ_FREQUENTLY:-1}" \
 --env "TOOLS=${TOOLS:-pencil,chalk,crayon,marker}" --env "PATTERNS=${PATTERNS:-60x1,120x1,240x1,60x2,60x4}" \
 --env "DRIVERS=${DRIVERS:-inpage,protocol}" --env "TRIALS=${TRIALS:-3}" --env "INSTRUMENT=${INSTRUMENT:-1}" \
 --env "MIN_CALLBACK_HZ=${MIN_CALLBACK_HZ:-}" --env "MIN_DELIVERY_HZ=${MIN_DELIVERY_HZ:-}" --env "MAX_FRAME_P95=${MAX_FRAME_P95:-}" \
 --env "PERF_OUT=${PERF_ROOT:-artifacts/t3/shared-pen-performance}/$label" \
 "$image" node scripts/shared-pen-perf.mjs
