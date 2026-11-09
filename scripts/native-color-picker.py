"""Recover BigPicker color-palette timelines, hit data and direct-color parts.

Picker.MHK is Slide Show. It must never supply this palette's animations.
No installer extraction or shared ui.json mutation is performed by this exporter.
"""
import argparse
from importlib import import_module
import json
import hashlib
from pathlib import Path
import struct


def compile_clip(archive, resource):
    parsed = import_module('mohawk-script').decode_script(archive[b'tSCR', resource])
    bank = parsed['collection']
    frames, sounds, tick, interval = [], [], 0, None
    for event in parsed['events']:
        if event['op'] == 'interval':
            if interval is not None:
                raise ValueError('Multiple color-picker intervals are unsupported')
            interval = event['ms']
        elif event['op'] == 'draw':
            parts = []
            for raw, x, y in event['images']:
                number = raw & 0x0fff
                # Native REGS are indexed by one-based sprite ID, including slot0.
                x -= struct.unpack_from('>h', archive[b'REGS', bank], number * 2)[0]
                y -= struct.unpack_from('>h', archive[b'REGS', bank + 1], number * 2)[0]
                parts.append({'sprite': number, 'x': parsed['origin'][0] + x,
                              'y': parsed['origin'][1] + y})
            frames.append({'tick': tick, 'parts': parts})
        elif event['op'] == 'sound':
            sounds.append({'tick': tick, 'sound': bank + event['cue'], 'channel': event['channel']})
        elif event['op'] == 'wait' and not event.get('terminal'):
            tick += 1
        elif event['op'] != 'wait':
            raise ValueError(f"Unsupported color-picker event {event['op']}")
    if not frames or interval is None:
        raise ValueError('Missing color-picker frames or interval')
    l, t, r, b = struct.unpack_from('>4h', archive[b'tSCR', resource], 16)
    return {'script': resource, 'collection': bank, 'tickMs': interval,
            'clipRect': [l, t, r - l, b - t], 'frames': frames,
            'endCheckTick': tick + 1, 'sounds': sounds}


def mask_rows(data):
    width, height, stride, flags = struct.unpack_from('>4H', data)
    if flags != 2 or stride < width or len(data) != 8 + height * stride:
        raise ValueError('Unsupported color-picker hit bitmap')
    rows = []
    for y in range(height):
        row = data[8 + y * stride:8 + y * stride + width]
        if set(row) - {0, 255}:
            raise ValueError('Color-picker hit mask has non-binary pixels')
        runs, start = [], None
        for x in range(width + 1):
            black = x < width and row[x] == 255
            if black and start is None:
                start = x
            elif not black and start is not None:
                runs.append([start, x])
                start = None
        rows.append(runs)
    return {'width': width, 'height': height, 'rows': rows, 'blackIndex': 255}


def compile_picker(big, little=None):
    clips = {name: compile_clip(big, resource) for name, resource in
             [('opening', 1500), ('closing', 1501), ('geometry', 1502),
              ('dropperRest', 1503), ('dropperTracking', 1504), ('dropperHover', 1505)]}
    region = import_module('button-animation').region_rectangles
    swatches = clips['geometry']['frames'][0]['parts'][1]
    mask = mask_rows(big[b'tBMP', 1500])
    return {'version': 1, 'source': 'Data/BigPicker.MHK', 'collection': 1500,
            'nativeRuntimeVerified': False, 'creationFlags': 0x4800031,
            'clips': clips, 'retentionRegion': region(big[b'MRGN', 1501]),
            'dropperRegion': region(big[b'MRGN', 1500]),
            'hitMask': {'x': swatches['x'], 'y': swatches['y'], **mask},
            'hitSearch': {'radii': [1, 2, 3], 'offsetOrder': [[1, 0], [-1, 0], [0, 1], [0, -1],
                           [1, 1], [-1, -1], [1, -1], [-1, 1]], 'testsCenter': False},
            'smallPicker': None if little is None else {
                'source': 'Data/LittlePicker.MHK', 'openingAnimation': None,
                'clips': {str(i): compile_clip(little, i) for i in range(1500, 1503)}},
            'colorChangeCue': {'sound': 31504, 'exported': False, 'evidence': 'i386 0x3d4bf–0x3d537'},
            'resourceSha256': {f'{tag.decode()}:{number}': hashlib.sha256(data).hexdigest()
                               for (tag, number), data in big.items() if tag in (b'tSCR', b'REGS', b'MRGN', b'tBMP', b'tBMH', b'tWAV')},
            'evidence': {'class': 'i386 RTTI 0x31b7d0; vtable 0x31b748',
                         'open': '0x3dd74–0x3df10', 'opened': '0x3dd48–0x3dd73; 0x3dcf2–0x3dd34',
                         'close': '0x3ccf6–0x3cef4', 'closed': '0x3c94e–0x3c9de',
                         'pointerMove': '0x3d270–0x3d3a3', 'hitSearch': '0x3cf00–0x3d0db; table0x25d770',
                         'selection': '0x3d10e–0x3d239; 0x3c8b2–0x3c945',
                         'hoverPreview': '0x3d3ea–0x3d690', 'dropper': '0x3d6c2–0x3d8b7',
                         'smallPicker': '0x85838–0x858e2; 0x85a5c–0x85b99',
                         'soundGate': '0x15a304–0x15a374', 'drawCallback': '0x3cce0–0x3ccf0'}}


def export_picker(big, little, output, misc=None):
    ui = import_module('import-ui')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    result = compile_picker(big, little)
    result['sprites'] = {}
    for number in range(1, 13):
        # import-ui.sprite accepts ONLY the proven direct-color encodings;
        # do not apply paper's unverified Mac indexed palette assumptions here.
        image = ui.sprite(big[b'tBMH', 1500], number - 1)
        filename = f'big-{number}.png'
        image.save(output / filename)
        result['sprites'][str(number)] = {'image': filename, 'width': image.width, 'height': image.height}
    result['sounds'] = {}
    decoder = import_module('import-original').decode_sound
    for number in (1500, 1501, 1502):
        data = big[b'tWAV', number]
        rate, channels, pcm = decoder(data)
        filename = f'big-{number}.wav'
        ui.pcm_sound(data, output / filename)
        result['sounds'][str(number)] = {'audio': filename, 'sampleRate': rate, 'channels': channels,
                                         'samples': len(pcm) // (2 * channels),
                                         'durationMs': len(pcm) * 1000 / (2 * channels * rate)}
    if misc is not None:
        data = misc[b'tWAV', 31504]
        rate, channels, pcm = decoder(data)
        filename = 'misc-31504.wav'
        ui.pcm_sound(data, output / filename)
        result['sounds']['31504'] = {'audio': filename, 'source': 'Data/Misc.MHK',
                                    'sampleRate': rate, 'channels': channels,
                                    'samples': len(pcm) // (2 * channels),
                                    'durationMs': len(pcm) * 1000 / (2 * channels * rate)}
        result['colorChangeCue'].update({'exported': True, 'audio': filename, 'source': 'Data/Misc.MHK'})
        result['resourceSha256']['Misc:tWAV:31504'] = hashlib.sha256(data).hexdigest()
    (output / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('volume', nargs='?', type=Path, default=Path('/Volumes/Kid Pix Deluxe 3D'))
    parser.add_argument('--output', type=Path, default=Path('artifacts/t3/color-picker-motion/export'))
    args = parser.parse_args()
    ui = import_module('import-ui')
    read = ui.app_resources(args.volume)
    result = export_picker(ui.mohawk(read('Data/BigPicker.MHK')),
                           ui.mohawk(read('Data/LittlePicker.MHK')), args.output, ui.mohawk(read('Data/Misc.MHK')))
    print(f"Exported {len(result['sprites'])} direct-color parts and {len(result['sounds'])} source sounds to {args.output}")
