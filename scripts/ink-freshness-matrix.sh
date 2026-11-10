#!/bin/bash
# Sequential current-runtime controls, with reversed fault and studio order.
set -eu
root=artifacts/t3/ink-freshness
prefix=${INK_PREFIX:-final}
run() {
 local label="$prefix-$1" mode="$2" delay="$3" observe="$4" expected="$5"
 local status=0
 CONTROL_MODE="$mode" INK_DELAY="$delay" INK_OBSERVE="$observe" bash scripts/ink-freshness-webkit.sh "$label" > "$root/$label.log" 2>&1 || status=$?
 echo "$label exit=$status expected=$expected"
 test "$status" -eq "$expected"
}
# A red row must fail specifically for staleness, not missing capture coverage.
run full-green-a full 0 1 0
run full-red-a full 150 1 1
run full-red-b full 150 1 1
run full-green-b full 0 1 0
run minimal-green-a minimal 0 1 0
run minimal-off-a minimal 0 0 0
run full-off-a full 0 0 0
run full-off-b full 0 0 0
run minimal-off-b minimal 0 0 0
run minimal-green-b minimal 0 1 0
node scripts/ink-freshness-compare.mjs
