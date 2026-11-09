#!/usr/bin/env python3
"""Read-only source/backdrop audit. Outputs evidence only to the supplied path."""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image
from portable_source import ROOT, load_ui
sys.path.insert(0, str(ROOT / 'scripts'))
from importlib import import_module


def check(archive_path, evidence_path, output):
    ui = load_ui()
    raw = archive_path.read_bytes()
    sha = lambda value: hashlib.sha256(value).hexdigest()
    assert sha(raw) == '00e92bdce3a7aaf3b72b18a38928f163ba096e7a6c5a3371b5345a3df4482ae5'
    archive = ui.mohawk(raw)
    rows = json.loads(evidence_path.read_text())
    if isinstance(rows, dict):
        rows = rows['rows']
    manifest = json.loads((ROOT / 'public/original/ui/secondary-motion/manifest.json').read_text())
    buttons = import_module('button-animation').button_records(archive[b'MBTN', 9383])
    decode = import_module('mohawk-script').decode_script
    programs = []
    for row in range(2, 6):
        source = buttons[row]
        pin = next(b for b in rows if b['table'] == 9383 and b['index'] == row)
        assert source['rawWords'] == pin['rawWords']
        assert source['stateScripts'] == manifest['tables']['9383']['buttons'][row]['stateScripts']
        for number in filter(None, [*source['stateScripts'], source['rolloverScript']]):
            clip = decode(archive[b'tSCR', number])
            assert json.loads(json.dumps(clip['events'])) == pin['programs'][str(number)]['events']
            assert sha(archive[b'tSCR', number]) == pin['programs'][str(number)]['sourceSha256']
            for field in ['collection', 'frames', 'sounds', 'tickMs', 'endCheckTick', 'sourceSha256']:
                assert manifest['scripts'][str(number)][field] == pin['programs'][str(number)][field], (number, field)
            programs.append(number)
    # Independent, fixed source recipe. No actor is allowed in this backdrop.
    base = Image.new('RGBA', (1024, 768))
    for number in [18049, 18034]:
        ui.render_script(base, archive, number)
    crop = base.crop((113, 608, 930, 776))
    staged = Image.open(ROOT / 'public/original/ui/secondary-motion/backdrops/text-1.png').convert('RGBA')
    assert crop.tobytes() == staged.tobytes()
    output.mkdir(parents=True, exist_ok=True)
    crop.save(output / 'source-text-clean.png')
    (output / 'source-check.json').write_text(json.dumps(dict(
        rows=[2, 3, 4, 5], programs=programs, cleanRecipe=[18049, 18034],
        cleanPixelsSha256=sha(crop.tobytes()), stagedMediaDelta=[], nativeReferences='0/17'), indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    check(args.archive, args.evidence, args.output)
