#!/usr/bin/env python3
"""Compact read-only raw Tp oracle; never uses production manifest as expected data."""
import hashlib
import json
import struct
import sys
from importlib import import_module
from pathlib import Path
from portable_source import ROOT, load_ui
sys.path.insert(0, str(ROOT / 'scripts'))

def check(archive_path, output):
    pin = json.loads((ROOT / 'tests/fixtures/make-sticker-source.json').read_text())
    sha = lambda data: hashlib.sha256(data).hexdigest()
    raw = Path(archive_path).read_bytes()
    assert sha(raw) == pin['archiveSha256']
    ui = load_ui()
    archive = ui.mohawk(raw)
    decode = import_module('mohawk-script').decode_script
    records = import_module('button-animation').button_records
    assert records(archive[b'MBTN', 926])[11]['rawWords'] == pin['row']['rawWords']
    groups = 0
    for key, program in pin['programs'].items():
        data = archive[b'tSCR', int(key)]
        assert sha(data) == program['sourceSha256']
        decoded = decode(data)
        assert json.loads(json.dumps(decoded['events'])) == program['events']
        assert list(decoded['origin']) == program['originXY']
        assert decoded['collection'] == 18000
        for frame in program['frames']:
            for part in frame['parts']:
                groups += 1
                n = part['rawImage'] & 0x7fff
                rx = struct.unpack_from('>h', archive[b'REGS', 18000], n * 2)[0]
                ry = struct.unpack_from('>h', archive[b'REGS', 18001], n * 2)[0]
                assert [rx, ry] == part['registrationXY']
                assert [program['originXY'][i] + part['sourceXY'][i] - [rx, ry][i] for i in range(2)] == [part['x'], part['y']]
                codec = import_module('native-drawing-motion')
                payload = codec.sprite_payload(archive[b'tBMH', 18000], n)
                width, height, argb = codec.argb_pixels(payload)
                expected = pin['sprites'][f'18000:{n}']
                assert [width, height] == [expected['width'], expected['height']]
                assert sha(argb) == expected['argbSha256']
                extension, png, pw, ph = import_module('import-original').bitmap(payload)
                assert (extension, pw, ph) == ('png', width, height)
                assert png == (ROOT / 'public/original/ui' / expected['image']).read_bytes()
        for cut in [0, 25, len(data)-1, len(data)-2]:
            try: decode(data[:cut])
            except (ValueError, struct.error): pass
            else: raise AssertionError(('truncation accepted', key, cut))
    assert groups == 4
    region = import_module('button-animation').image_button_region(pin['row'], archive, ui.sprite)
    assert region == pin['row']['region']
    media = ROOT / 'public/original/ui'
    hashes = {}
    for sprite in pin['sprites'].values():
        for key in ['image','argb']:
            path = media / sprite[key]
            hashes[sprite[key]] = sha(path.read_bytes())
        assert hashes[sprite['argb']] == sprite['argbSha256']
    assert sha(archive[b'tWAV', 18066]) == 'b21e8cf4fc0dfce6bad7de1647c8c6a3e573ba835d02718b9e5b37b6841a84cf'
    for name in ['secondary-motion/sounds/18066.wav', *[f'secondary-motion/backdrops/scissors-{i}.png' for i in range(1,4)], 'secondary-motion/manifest.json']:
        hashes[name] = sha((media / name).read_bytes())
    Path(output).write_text(json.dumps(dict(archiveSha256=sha(raw), row=11, programs=list(pin['programs']), drawGroups=groups, media=hashes), indent=2)+'\n')

if __name__ == '__main__': check(sys.argv[1], sys.argv[2])
