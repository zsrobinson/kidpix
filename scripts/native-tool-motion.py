"""Export source-bound primary tool timelines, bundles and clean tray pages.

Writes only ui/tool-motion/. Does not regenerate the shared UI, drawing-motion,
or application configuration. Original application runtime remains unverified.
"""

import argparse
from copy import deepcopy
import gzip
import hashlib
from importlib import import_module
import io
import json
from pathlib import Path
import struct
import wave


drawing = import_module('native-drawing-motion')
buttons_module = import_module('button-animation')
decode_script = import_module('mohawk-script').decode_script
SOURCE = drawing.SOURCE
SPECS = {
    'draw': (18400, ('pencil', 'chalk', 'crayon', 'marker'), 18400, (18400,) * 4, 18060, 0, 'mode9'),
    'paint': (18000, ('brush', 'sound', 'spray'), 18000, (18000, 18001, 18002), 18072, 0, 'mode9'),
    'bucket': (18300, ('bucket', 'gradient', 'pattern'), 3, (18300, 18301, 18302), 18081, 0, 'mode9'),
    'mixer': (18600, ('mega', 'wand'), 18600, (18600, 18601), 18090, 0, 'ordinary'),
    'eraser': (18500, ('big', 'round'), 18500, (18500, 18501), None, 1, 'ordinary'),
}
VIEW_OWNERS = dict.fromkeys(('paint', 'wacky', 'sound', 'hands-free', 'spray', 'moving-spray'), 'paint')
VIEW_OWNERS.update(dict.fromkeys(('bucket', 'gradient', 'pattern'), 'bucket'))
VIEW_OWNERS.update({'mixer': 'mixer', 'mixer-wand': 'mixer', 'eraser': 'eraser'})
EVIDENCE = {
    'paint': {'ownerVtable': '0x0031f5a0', 'ownerLoad': '0x000f419f–0x000f41af: MBTN18000',
              'callbackRows': [0, 2], 'callbackRange': '0x000f3b0a / 0x000f3b12',
              'selectedRestore': '0x000f3d74–0x000f3dc6; default row0 at 0x000f3bbf'},
    'bucket': {'ownerVtable': '0x0031f268', 'ownerLoad': '0x000f12e8–0x000f12f5: MBTN18300',
               'callbackRows': [0, 2], 'callbackRange': '0x000f0b9c / 0x000f0ba4',
               'selectedRestore': '0x000f0c4d–0x000f0c53 default0; 0x000f0ce0–0x000f0d03 restore'},
    'mixer': {'ownerVtable': '0x0031f380', 'ownerLoad': '0x000f2786–0x000f2793: MBTN18600',
              'callbackRows': [], 'callbackRange': '0x000f71d2 / 0x000f71dc return -1',
              'loader': '0x000f1e42–0x000f1ed4 calls common loader, enables states0/1 owner notifications only',
              'selectedRestore': '0x000f1cc0 default0; 0x000f1d32–0x000f1d55 restore',
              'stateNotification': '0x000307a6 writes +0x8e flags, not +0x86 scripts; 0x000f2474–0x000f2564 sends studio0x122/0x123'},
    'eraser': {'ownerVtable': '0x0031f148', 'ownerLoad': '0x000f04f0–0x000f04fd: MBTN18500',
               'callbackRows': [], 'callbackRange': '0x000f71d2 / 0x000f71dc return -1',
               'selectedRestore': '0x000ef6b3 default command18501; 0x000ef753–0x000ef779 restore'},
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compile_tray(archive, owner):
    """Compile only these audited tables; unknown bytecode fails in shared decoder."""
    table, names, group, commands, first, selected, mode = SPECS[owner]
    if owner == 'draw':
        result = drawing.compile_drawing_motion(archive)
    else:
        buttons = buttons_module.button_records(archive[b'MBTN', table], names)[:len(names)]
        if len(buttons) != len(names):
            raise ValueError(f'Missing {owner} primary controls')
        scripts, sprites, sounds = {}, {}, {}
        for index, button in enumerate(buttons):
            start = (18137, 18134)[index] if owner == 'eraser' else first + index * 3
            argument = 1 if owner == 'bucket' else 0
            expected = [start, start + 1, 0, start + 1, 2, button['hotspotResource'],
                        commands[index], 3 if owner == 'bucket' else 1, argument, 0,
                        start + 2, 0, 0, 0, group, 0]
            if button['rawWords'] != expected:
                raise ValueError(f'Unsupported {owner} table dispatch')
            button.update(mode=2, commandArgument=argument,
                          region=buttons_module.region_rectangles(archive[b'MRGN', button['hotspotResource']]))
            button['auxiliaryClipRect'] = list(button['region']['boundsXYWH'])
        for resource in sorted({n for button in buttons for n in [*button['stateScripts'], button['rolloverScript']] if n}):
            raw = archive[b'tSCR', resource]
            parsed = decode_script(raw)
            bank = parsed['collection']
            if bank != 18000:
                raise ValueError('Primary tool collection changed')
            frames, cues, tick, interval = [], [], 0, None
            for event in parsed['events']:
                if event['op'] == 'interval':
                    if interval is not None and interval != event['ms']:
                        raise ValueError('Variable primary tool interval')
                    interval = event['ms']
                elif event['op'] == 'draw':
                    # Source callback bypasses mode9 when the second ID is zero.
                    if len(event['images']) not in ((1, 2) if mode == 'mode9' else (1,)):
                        raise ValueError('Unsupported primary tool callback composition')
                    parts = []
                    for part_index, (raw_id, x, y) in enumerate(event['images']):
                        if raw_id & 0xf000 != 0x8000:
                            raise ValueError('Unsupported primary tool registration flags')
                        number = raw_id & 0xfff
                        rx = struct.unpack_from('>h', archive[b'REGS', bank], number * 2)[0]
                        ry = struct.unpack_from('>h', archive[b'REGS', bank + 1], number * 2)[0]
                        parts.append(dict(sprite=number, rawImage=raw_id, sourceXY=[x, y], registrationXY=[rx, ry],
                                          x=parsed['origin'][0] + x - rx, y=parsed['origin'][1] + y - ry))
                        role = 'mode9-data' if mode == 'mode9' and part_index == 1 else 'ordinary-base'
                        if str(number) not in sprites:
                            width, height, pixels = drawing.argb_pixels(drawing.sprite_payload(archive[b'tBMH', bank], number))
                            sprites[str(number)] = dict(image=f'tool-motion/{owner}/{number}.png',
                                                       argb=f'tool-motion/{owner}/{number}.argb',
                                                       width=width, height=height, roles=[], argbSha256=sha(pixels))
                        if role not in sprites[str(number)]['roles']:
                            sprites[str(number)]['roles'].append(role)
                    frames.append(dict(tick=tick, parts=parts))
                elif event['op'] == 'sound':
                    sound = bank + event['cue']
                    if (b'tWAV', sound) not in archive:
                        raise ValueError(f'Missing primary tool sound {sound}')
                    sounds[str(sound)] = dict(src=f'tool-motion/{owner}/{sound}.wav')
                    cues.append(dict(tick=tick, cue=event['cue'], sound=sound, channel=event['channel']))
                elif event['op'] == 'wait' and not event.get('terminal'):
                    if not frames:
                        raise ValueError('Primary tool wait before first frame')
                    tick += 1
            if interval is None or not frames:
                raise ValueError('Missing primary tool timeline')
            parts = [part for frame in frames for part in frame['parts']]
            left, top = min(p['x'] for p in parts), min(p['y'] for p in parts)
            right = max(p['x'] + sprites[str(p['sprite'])]['width'] for p in parts)
            bottom = max(p['y'] + sprites[str(p['sprite'])]['height'] for p in parts)
            scripts[str(resource)] = dict(script=resource, collection=bank, originXY=list(parsed['origin']),
                                         headerBoundsLTRB=list(struct.unpack_from('>4h', raw, 16)),
                                         tickMs=interval, frames=frames, sounds=cues, endCheckTick=tick + 1,
                                         boundsXYWH=[left, top, right-left, bottom-top], sourceSha256=sha(raw))
        reference = drawing.compile_drawing_motion(archive)
        result = dict(version=1, source=SOURCE, table=table, collection=18000, buttons=buttons,
                      scripts=scripts, sprites=sprites, sounds=sounds, renderMode=mode,
                      rendering=deepcopy(reference['rendering']) if mode == 'mode9' else {'registrationBeforeCallback': True},
                      stateCreationFlags=reference['stateCreationFlags'], rolloverCreationFlags=reference['rolloverCreationFlags'],
                      nativeRuntimeVerified=False, verificationLimits=reference['verificationLimits'],
                      evidence={**EVIDENCE[owner], 'callbackInstall': '0x000f732e–0x000f7396',
                                'callback': '0x000f73b4–0x000f7651', 'ordinaryRender': '0x00158e1f–0x00158f97',
                                'singlePartFallback': '0x000f763f–0x000f7645'})
    result['defaultSelectedIndex'] = selected
    result['selectionMapping'] = [dict(index=b['index'], name=b['name'], command=b['command'],
                                       commandArgument=b['commandArgument']) for b in result['buttons']]
    result['sourceHashes'] = {f'{tag.decode()}/{n}': sha(archive[tag, n]) for tag, n in
                              [(b'MBTN', table), (b'tBMH', 18000), (b'REGS', 18000), (b'REGS', 18001)] +
                              [(b'MRGN', b['hotspotResource']) for b in result['buttons']]}
    return result


def write_bundle(tray, output, owner):
    """Exact fallback payloads, deterministic order and gzip header (mtime zero)."""
    payload = bytearray()
    for key in sorted(tray['sprites'], key=int):
        sprite = tray['sprites'][key]
        offsets = {}
        for kind, path_key in (('argb', 'argb'), ('png', 'image')):
            data = (output / sprite[path_key]).read_bytes()
            offsets[kind] = [len(payload), len(data)]
            payload.extend(data)
        sprite['bundleOffsets'] = offsets
    stream = io.BytesIO()
    with gzip.GzipFile(filename='', fileobj=stream, mode='wb', mtime=0, compresslevel=9) as compressed:
        compressed.write(payload)
    packed = stream.getvalue()
    # A .gz suffix makes Vite infer Content-Encoding:gzip and Fetch silently
    # decompress it. Keep the HTTP resource opaque; compression is in manifest.
    path = f'tool-motion/{owner}/sprites.bin'
    (output / path).parent.mkdir(parents=True, exist_ok=True)
    (output / path).write_bytes(packed)
    tray['bundle'] = dict(path=path, compression='gzip', sha256=sha(packed), byteLength=len(payload))


def export_backdrops(read, archive, trays, output):
    """Follow import-ui.TRAYS/export_trays composition, omitting audited actors only."""
    from PIL import Image
    ui = import_module('import-ui')
    easel = ui.mohawk(read('Data/Easel.MHK'))
    sources = {'Tp': archive}
    for name in ('Icons', 'Anims', 'Cyclic'):
        sources[name] = ui.mohawk(read(f'Data/Tools/{name}.MHK'))
    frames = {n: ui.sprite(archive[b'tBMH', 18000], n) for n in (738,)}
    result = {}
    for name, owner in VIEW_OWNERS.items():
        programs, source, ids, start, columns = ui.TRAYS[name]
        controlled = {s for b in trays[owner]['buttons'] for s in b['stateScripts'] if s}
        omitted = [s for s in programs if s in controlled]
        if len(omitted) != len(trays[owner]['buttons']):
            raise ValueError(f'{name}: expected exactly one primary state program per button')
        included = [s for s in programs if s not in controlled]
        base = Image.new('RGBA', (1024, 768))
        for script in included + [18034]:
            ui.render_script(base, archive, script, color_key=18072 <= script <= 18083)
        pages = []
        ids = list(ids)
        for row, first in enumerate(range(0, len(ids), columns or 1)):
            shown = base.copy()
            if row:
                ui.render_script(shown, archive, 18028)
            if first + columns < len(ids):
                ui.render_script(shown, archive, 18031)
            for offset, digit in enumerate(f'{row + 1:02}'):
                shown.alpha_composite(ui.sprite(easel[b'tBMH', 1000], 74 + int(digit)), (875 + offset * 17, 676))
            for column, resource in enumerate(ids[first:first+columns]):
                data = sources[source][b'tBMP', resource]
                width, height, stride, flags = struct.unpack_from('>4H', data)
                if flags == 2:
                    image = Image.new('RGBA', (width, height), '#0084f4')
                    image.putalpha(Image.frombytes('L', (width, height), data[8:], 'raw', 'L', stride))
                else:
                    image = ui.bitmap(data)
                x, y = start + column * 63, 660
                shown.alpha_composite(frames[738], (x, y))
                shown.alpha_composite(image, (x + (56-width)//2, y + (56-height)//2))
            path = f'tool-motion/backdrops/{name}{"-" + str(row+1) if row else ""}.png'
            target = output / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shown.crop((113, 608, 930, 776)).save(target)
            pages.append(dict(image=path, sha256=sha(target.read_bytes())))
        result[name] = dict(rect=[113, 608, 817, 168], pages=pages, owner=owner,
                            omittedPrimaryScripts=omitted, retainedScripts=included + [18034])
    return result


def export_tool_motion(archive, output, bitmap_decoder, sound_decoder, read):
    output = Path(output)
    index = dict(version=1, trays={})
    for owner in SPECS:
        tray = compile_tray(archive, owner)
        for key, sprite in tray['sprites'].items():
            payload = drawing.sprite_payload(archive[b'tBMH', 18000], int(key))
            width, height, pixels = drawing.argb_pixels(payload)
            extension, png, w, h = bitmap_decoder(payload)
            if extension != 'png' or (w, h) != (width, height):
                raise ValueError('Primary tool bitmap did not decode losslessly')
            # Keep existing drawing fallback paths; never write outside tool-motion.
            if owner != 'draw':
                for field, data in (('argb', pixels), ('image', png)):
                    target = output / sprite[field]
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
            elif (output / sprite['argb']).read_bytes() != pixels or (output / sprite['image']).read_bytes() != png:
                raise ValueError('Existing drawing fallback assets differ; run native-drawing-motion.py separately')
            sprite['pngSha256'] = sha(png)
        for key, sound in tray['sounds'].items():
            raw = archive[b'tWAV', int(key)]
            rate, channels, pcm = sound_decoder(raw)
            sound.update(sampleRate=rate, channels=channels, sampleFrames=len(pcm)//(2*channels),
                         durationMs=len(pcm)/(2*channels*rate)*1000, sourceSha256=sha(raw))
            if owner != 'draw':
                target = output / sound['src']
                target.parent.mkdir(parents=True, exist_ok=True)
                with wave.open(str(target), 'wb') as stream:
                    stream.setnchannels(channels)
                    stream.setsampwidth(2)
                    stream.setframerate(rate)
                    stream.writeframes(pcm)
            else:
                with wave.open(str(output / sound['src'])) as stream:
                    if ((stream.getframerate(), stream.getnchannels(), stream.getsampwidth()) != (rate, channels, 2)
                            or stream.readframes(stream.getnframes()) != pcm):
                        raise ValueError('Existing drawing sound differs; run native-drawing-motion.py separately')
        write_bundle(tray, output, owner)
        index['trays'][owner] = tray
    index['backdrops'] = export_backdrops(read, archive, index['trays'], output)
    # Publish index last, after all payloads exist.
    path = output / 'tool-motion/manifest.json'
    path.write_text(json.dumps(index, indent=2) + '\n')
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('volume', nargs='?', type=Path, default=Path('/Volumes/Kid Pix Deluxe 3D'))
    parser.add_argument('--output', type=Path, default=Path('public/original/ui'))
    args = parser.parse_args()
    ui, original = import_module('import-ui'), import_module('import-original')
    read = ui.app_resources(args.volume)
    result = export_tool_motion(ui.mohawk(read(SOURCE)), args.output, original.bitmap, original.decode_sound, read)
    print(f"Exported {len(result['trays'])} trays, {sum(len(t['scripts']) for t in result['trays'].values())} programs, "
          f"{sum(len(b['pages']) for b in result['backdrops'].values())} clean pages; native runtime unverified.")
