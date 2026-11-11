#!/usr/bin/env bash
# Run from this isolated checkout with existing read-only dependency/media links.
set -euo pipefail
sticker_root=$(pwd)
run_lane() {
  local lane_url=$1 lane_config=$2 lane_log=$3
  flock /var/tmp/kidpix-ui-validation.lock docker run --rm --pull=never --cap-drop=ALL \
    --user "$(id -u):$(id -g)" --network host --shm-size=512m \
    -e STICKER_URL="$lane_url" \
    -v "$sticker_root:/work:ro" \
    -v /home/zsrobinson/code/kidpix/node_modules:/home/zsrobinson/code/kidpix/node_modules:ro \
    -v /home/zsrobinson/code/kidpix/public/original:/home/zsrobinson/code/kidpix/public/original:ro \
    -v "$sticker_root/artifacts/t3/make-sticker:/work/artifacts/t3/make-sticker:rw" \
    -w /work mcr.microsoft.com/playwright@sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d \
    node node_modules/@playwright/test/cli.js test -c "$lane_config" "${@:4}" > "$lane_log" 2>&1
}
run_lane http://127.0.0.1:4741 playwright.make-sticker.config.js artifacts/t3/make-sticker/dev-expanded.log
mv artifacts/t3/make-sticker/browser artifacts/t3/make-sticker/browser-dev-expanded
run_lane http://127.0.0.1:4742 playwright.make-sticker.config.js artifacts/t3/make-sticker/built-final.log
mv artifacts/t3/make-sticker/browser artifacts/t3/make-sticker/browser-built-final
run_lane http://127.0.0.1:4741 playwright.make-sticker-regressions.config.js artifacts/t3/make-sticker/regressions.log
