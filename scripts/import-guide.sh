#!/usr/bin/env bash
set -euo pipefail

volume=${1:-"/Volumes/Kid Pix Deluxe 3D"}
guide="$volume/Kid Pix User Guide.pdf"
output="$(cd "$(dirname "$0")/.." && pwd)/public/original/guide"
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
mkdir -p "$output"

pdfimages -f 11 -l 12 -png "$guide" "$temp/zone"
pdfimages -f 15 -l 37 -png "$guide" "$temp/control"

# Blank the sample drawing and label. The browser supplies the live canvas and title.
magick "$temp/zone-002.png" -fill white -draw 'rectangle 164,57 883,598' \
  "$temp/paint-base.png"
magick "$temp/paint-base.png" \( "$temp/zone-002.png" -crop 84x22+395+16 +repage \) \
  -geometry +480+16 -composite "$output/paint-zone.png"
cp "$temp/zone-005.png" "$output/slides.png"

# The manual plates have a white exterior. Clear just that exterior and keep
# interior whites such as brush thumbnails and specular highlights.
while read -r name number; do
  magick "$temp/control-$number.png" -alpha on -fuzz 3% -fill none \
    -draw 'alpha 0,0 floodfill' \
    "$output/$name.png"
done <<'TRAYS'
draw 003
paint 007
wacky 010
sound 011
spray 015
moving-spray 016
bucket 020
gradient 021
pattern 022
mixer 025
stamp 026
paper 036
eraser 043
text 057
grab 070
scissors 071
TRAYS
