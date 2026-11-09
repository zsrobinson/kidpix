#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
volume=${1:-"/Volumes/Kid Pix Deluxe 3D"}

if [[ ! -f "$volume/Kid Pix User Guide.pdf" || ! -d "$volume/Libraries" ]]; then
  printf 'Mount KPD3DMac.dmg read-only, then pass the mounted volume path.\n' >&2
  exit 2
fi

for command in python3 pdfimages magick ffmpeg img2webp; do
  if ! command -v "$command" >/dev/null; then
    printf 'Install %s before importing the trial.\n' "$command" >&2
    exit 2
  fi
done
python3 -c 'import Foundation, PIL' || {
  printf 'Install PyObjC and Pillow into the Python environment used for import.\n' >&2
  exit 2
}

python3 scripts/import-ui.py "$volume"
bash scripts/import-guide.sh "$volume"
python3 scripts/import-original.py --volume "$volume" --paint-tools --animate-3d
