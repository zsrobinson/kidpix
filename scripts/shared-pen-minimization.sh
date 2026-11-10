#!/bin/bash
# Lab callback red/green, not physical Safari latency or replacement-UI acceptance.
set -eu
root=${PERF_ROOT:-artifacts/t3/studio-minimization}
label=${LABEL:-budget}
for mode in full minimal; do
 mkdir -p "$root/$label-$mode/source"
 cp scripts/shared-pen-{perf.mjs,minimize.mjs,perf-webkit.sh} "$root/$label-$mode/source/"
 status=0
 PORT=${PORT:-4351} PERF_ROOT=$root CONTROL_MODE=$mode MINIMIZE=none \
  UI_SCENARIO=quiescent TOOLS=pencil DRIVERS=inpage PATTERNS=60x1 \
  TRIALS=3 INSTRUMENT=0 MIN_CALLBACK_HZ=45 \
  bash scripts/shared-pen-perf-webkit.sh "$label-$mode" > "$root/$label-$mode.log" 2>&1 || status=$?
 echo "$label-$mode exit=$status"
done
node scripts/shared-pen-minimization-compare.mjs "$root/$label-full/results.json" "$root/$label-minimal/results.json"
