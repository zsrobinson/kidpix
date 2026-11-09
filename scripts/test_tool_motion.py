"""Asset-free fixtures always run; mounted installer tests are explicitly optional."""
import gzip
from importlib import import_module
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import wave

motion = import_module('native-tool-motion')
VOLUME = Path('/Volumes/Kid Pix Deluxe 3D')


def fixture():
    pixel = struct.pack('>4H', 1, 1, 4, 0x2005) + bytes([255, 4, 176, 255])
    archive = {(b'tBMH', 18000): struct.pack('>4H2I', 2, 0, 0, 2, 16, 16+len(pixel)) + pixel * 2,
               (b'REGS', 18000): struct.pack('>3h', 0, 5, 7),
               (b'REGS', 18001): struct.pack('>3h', 0, 9, 11),
               (b'tWAV', 18004): b'sound source'}
    for owner, (table, names, group, commands, first, _, mode) in motion.SPECS.items():
        records = []
        for i in range(len(names)):
            start = (18137, 18134)[i] if owner == 'eraser' else first + i * 3
            region = table + i
            argument = i if owner == 'draw' else 1 if owner == 'bucket' else 0
            records += [struct.pack('>16H', start, start+1, 0, start+1, 2, region,
                                   commands[i], 3 if owner == 'bucket' else 1, argument, 0,
                                   start+2, 0, 0, 0, group, 0)]
            archive[b'MRGN', region] = b'RGN ' + struct.pack('>4h2H4h', 10, 20, 40, 60, 1, 1, 10, 20, 40, 60)
            for resource in range(start, start+3):
                header = bytearray(26)
                struct.pack_into('>H', header, 2, 18000)
                struct.pack_into('>4h', header, 16, 100, 200, 300, 400)
                images = [(0x8001, 20, 30)] + ([(0x8002, 21, 31)] if mode == 'mode9' else [])
                draw = bytes([0x10, len(images)]) + b''.join(struct.pack('>Hhh', *p) for p in images)
                archive[b'tSCR', resource] = bytes(header) + b'\x04\x04\x00\x64' + draw + b'\x03\x06\x00\x04\x00\x01\x01\x02\x00\x02'
        archive[b'MBTN', table] = b''.join(records)
    return archive


class ToolMotionTests(unittest.TestCase):
    def test_reuses_existing_strict_pixel_and_script_decoders(self):
        self.assertIs(motion.drawing.argb_pixels, import_module('native-drawing-motion').argb_pixels)
        self.assertIs(motion.decode_script, import_module('mohawk-script').decode_script)

    def test_each_owner_keeps_native_dispatch_and_source_registration(self):
        archive = fixture()
        for owner, spec in motion.SPECS.items():
            tray = motion.compile_tray(archive, owner)
            self.assertEqual(len(tray['buttons']), len(spec[1]))
            self.assertEqual(tray['defaultSelectedIndex'], spec[5])
            self.assertFalse(tray['nativeRuntimeVerified'])
            self.assertEqual(tray.get('renderMode', 'mode9'), spec[6])
            for button in tray['buttons']:
                self.assertEqual(button['region']['rectsLTRB'], [[10, 20, 40, 60]])
                self.assertEqual(button['auxiliaryClipRect'], [10, 20, 30, 40])
                self.assertEqual(button['mode'], 2)
                self.assertEqual(button['commandArgument'], button['rawWords'][8])
                self.assertFalse(button['rolloverLoops'])
                self.assertTrue(button['rolloverCancelsOnLeave'])
            for clip in tray['scripts'].values():
                self.assertEqual(clip['endCheckTick'], 1)
                self.assertEqual(clip['sounds'], [dict(tick=0, cue=4, sound=18004, channel=1)])
                self.assertEqual(clip['frames'][0]['parts'][0]['x'], 115)
                self.assertEqual(clip['frames'][0]['parts'][0]['y'], 221)
                self.assertEqual(clip['sourceSha256'], motion.sha(archive[b'tSCR', clip['script']]))

    def test_single_pose_is_finite_and_callback_single_part_is_ordinary(self):
        archive = fixture()
        raw = archive[b'tSCR', 18078]
        # First draw: retain exactly the first image, leave sound/wait/end intact.
        archive[b'tSCR', 18078] = raw[:30] + b'\x10\x01' + raw[32:38] + raw[44:]
        tray = motion.compile_tray(archive, 'paint')
        clip = tray['scripts']['18078']
        self.assertEqual(len(clip['frames']), 1)
        self.assertEqual(len(clip['frames'][0]['parts']), 1)
        self.assertEqual(tray['sprites']['1']['roles'], ['ordinary-base'])
        self.assertFalse(tray['buttons'][2]['rolloverLoops'])

    def test_changed_dispatch_or_bytecode_fails_closed(self):
        for owner in ('paint', 'bucket', 'mixer', 'eraser'):
            archive = fixture()
            table = motion.SPECS[owner][0]
            data = bytearray(archive[b'MBTN', table])
            struct.pack_into('>H', data, 4, 99)
            archive[b'MBTN', table] = bytes(data)
            with self.assertRaisesRegex(ValueError, 'table dispatch'):
                motion.compile_tray(archive, owner)
        archive = fixture()
        archive[b'tSCR', 18072] = archive[b'tSCR', 18072][:-2] + b'\x05\x01\x00\x02'
        with self.assertRaisesRegex(ValueError, 'Unsupported tSCR'):
            motion.compile_tray(archive, 'paint')

    def test_bundle_is_deterministic_exact_and_sorted_numerically(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            tray = {'sprites': {key: dict(argb=f'{key}.argb', image=f'{key}.png') for key in ('10', '2')}}
            for key in tray['sprites']:
                (root / f'{key}.argb').write_bytes(bytes([0, 255, int(key), 0]))
                (root / f'{key}.png').write_bytes(b'PNG\x00\xff' + key.encode())
            motion.write_bundle(tray, root, 'fixture')
            path = root / tray['bundle']['path']
            first = path.read_bytes()
            payload = gzip.decompress(first)
            self.assertEqual(tray['sprites']['2']['bundleOffsets']['argb'], [0, 4])
            self.assertEqual(tray['bundle']['byteLength'], len(payload))
            self.assertEqual(tray['bundle']['sha256'], motion.sha(first))
            self.assertEqual(first[4:8], bytes(4))
            for sprite in tray['sprites'].values():
                for kind, field in [('argb', 'argb'), ('png', 'image')]:
                    offset, length = sprite['bundleOffsets'][kind]
                    self.assertEqual(payload[offset:offset+length], (root / sprite[field]).read_bytes())
            motion.write_bundle(tray, root, 'fixture')
            self.assertEqual(path.read_bytes(), first)


@unittest.skipUnless(VOLUME.exists(), 'Mounted installer source tests; asset-free fixtures run without media')
class ToolMotionSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ui, cls.original = import_module('import-ui'), import_module('import-original')
        cls.read = staticmethod(cls.ui.app_resources(VOLUME))
        cls.archive = cls.ui.mohawk(cls.read(motion.SOURCE))
        cls.temporary = tempfile.TemporaryDirectory(prefix='tool-motion-source-')
        cls.root = Path(cls.temporary.name)
        # Drawing fallback remains independently owned and is reproduced only in temp.
        motion.drawing.export_drawing_motion(cls.archive, cls.root, cls.original.bitmap, cls.original.decode_sound)
        cls.before = {p.relative_to(cls.root): motion.sha(p.read_bytes()) for p in cls.root.rglob('*') if p.is_file()}
        (cls.root / 'ui.json').write_text('untouched')
        cls.index = motion.export_tool_motion(cls.archive, cls.root, cls.original.bitmap, cls.original.decode_sound, cls.read)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_isolated_write_set_and_complete_index(self):
        self.assertEqual((self.root / 'ui.json').read_text(), 'untouched')
        self.assertEqual({p.name for p in self.root.iterdir()}, {'ui.json', 'drawing-motion', 'tool-motion'})
        for path, digest in self.before.items():
            self.assertEqual(motion.sha((self.root/path).read_bytes()), digest)
        self.assertEqual(json.loads((self.root/'tool-motion/manifest.json').read_text()), self.index)
        self.assertEqual(list(self.index['trays']), list(motion.SPECS))
        self.assertEqual(sum(len(t['scripts']) for t in self.index['trays'].values()), 42)
        self.assertEqual(sum(len(t['sprites']) for t in self.index['trays'].values()), 377)
        self.assertEqual(sum(len(b['pages']) for b in self.index['backdrops'].values()), 53)

    def test_every_source_pose_registration_and_cue_not_sprite_order(self):
        counts = {'draw': [11,11,6,16,16,6,16,16,6,14,14,5],
                  'paint': [4,11,4,6,13,9,11,11,5], 'bucket': [13,13,8,7,11,5,11,11,5],
                  'mixer': [11,11,7,11,11,7], 'eraser': [10,10,8,7,7,9]}
        for owner, tray in self.index['trays'].items():
            self.assertEqual([len(c['frames']) for c in tray['scripts'].values()], counts[owner])
            for button in tray['buttons']:
                words = list(struct.unpack_from('>16H', self.archive[b'MBTN',tray['table']], button['index']*32))
                self.assertEqual(button['rawWords'], words)
                raw = self.archive[b'MRGN', words[5]]
                left, top, right, bottom, _, count = struct.unpack_from('>4h2H', raw, 4)
                self.assertEqual(button['auxiliaryClipRect'], [left,top,right-left,bottom-top])
                self.assertEqual(button['region']['rectsLTRB'],
                                 [list(struct.unpack_from('>4h',raw,16+i*8)) for i in range(count)])
            for clip in tray['scripts'].values():
                raw = self.archive[b'tSCR', clip['script']]
                parsed = motion.decode_script(raw)
                groups = [e['images'] for e in parsed['events'] if e['op'] == 'draw']
                self.assertEqual(clip['sourceSha256'], motion.sha(raw))
                self.assertEqual(clip['tickMs'], 100)
                tick, cues, draw_ticks = 0, [], []
                for event in parsed['events']:
                    if event['op'] == 'draw':
                        draw_ticks.append(tick)
                    if event['op'] == 'wait' and not event.get('terminal'):
                        tick += 1
                    if event['op'] == 'sound':
                        cues.append(dict(tick=tick, cue=event['cue'], sound=18000+event['cue'], channel=event['channel']))
                self.assertEqual(clip['sounds'], cues)
                self.assertEqual(clip['endCheckTick'], tick+1)
                self.assertEqual([f['tick'] for f in clip['frames']], draw_ticks)
                for frame, images in zip(clip['frames'], groups):
                    self.assertEqual(len(frame['parts']), len(images))
                    for part, (raw_id, x, y) in zip(frame['parts'], images):
                        n = raw_id & 0xfff
                        rx = struct.unpack_from('>h', self.archive[b'REGS', 18000], n*2)[0]
                        ry = struct.unpack_from('>h', self.archive[b'REGS', 18001], n*2)[0]
                        self.assertEqual(part, dict(sprite=n, rawImage=raw_id, sourceXY=[x,y], registrationXY=[rx,ry],
                                                    x=parsed['origin'][0]+x-rx, y=parsed['origin'][1]+y-ry))

    def test_all_sprite_and_sound_payloads_match_installer_bytes(self):
        for tray in self.index['trays'].values():
            for key, sprite in tray['sprites'].items():
                payload = motion.drawing.sprite_payload(self.archive[b'tBMH', 18000], int(key))
                width, height, raw = motion.drawing.argb_pixels(payload)
                _, png, w, h = self.original.bitmap(payload)
                self.assertEqual((width, height), (w,h))
                self.assertEqual((self.root/sprite['argb']).read_bytes(), raw)
                self.assertEqual((self.root/sprite['image']).read_bytes(), png)
                self.assertEqual(motion.sha(raw), sprite['argbSha256'])
                self.assertEqual(motion.sha(png), sprite['pngSha256'])
            for key, sound in tray['sounds'].items():
                raw = self.archive[b'tWAV', int(key)]
                rate, channels, pcm = self.original.decode_sound(raw)
                with wave.open(str(self.root/sound['src'])) as stream:
                    self.assertEqual((stream.getframerate(),stream.getnchannels(),stream.getsampwidth()), (rate,channels,2))
                    self.assertEqual(stream.readframes(stream.getnframes()), pcm)
                self.assertEqual(sound['sourceSha256'], motion.sha(raw))

    def test_each_bundle_roundtrips_independently(self):
        for tray in self.index['trays'].values():
            packed = (self.root/tray['bundle']['path']).read_bytes()
            payload = gzip.decompress(packed)
            self.assertEqual(len(payload), tray['bundle']['byteLength'])
            self.assertEqual(motion.sha(packed), tray['bundle']['sha256'])
            cursor = 0
            for key in sorted(tray['sprites'], key=int):
                sprite = tray['sprites'][key]
                for kind, field in [('argb','argb'), ('png','image')]:
                    offset, size = sprite['bundleOffsets'][kind]
                    self.assertEqual(offset, cursor)
                    self.assertEqual(payload[offset:offset+size], (self.root/sprite[field]).read_bytes())
                    cursor += size
            self.assertEqual(cursor, len(payload))

    def test_clean_pages_equal_independent_existing_compositor(self):
        from PIL import Image
        controlled = {s for tray in self.index['trays'].values() for b in tray['buttons'] for s in b['stateScripts'] if s}
        render = self.ui.render_script
        observed = []
        def omit(frame, archive, resource, color_key=False):
            if resource not in controlled:
                observed.append(resource)
                return render(frame, archive, resource, color_key)
        with tempfile.TemporaryDirectory(prefix='tool-motion-composition-') as temporary:
            root = Path(temporary)
            # Replay the existing, independently implemented tray compositor only
            # for the 12 applicable views; suppress exactly source actor programs.
            with patch.object(self.ui, 'TRAYS', {n:self.ui.TRAYS[n] for n in motion.VIEW_OWNERS}), patch.object(self.ui, 'render_script', omit):
                self.ui.export_trays(self.read, self.archive, self.ui.mohawk(self.read('Data/Easel.MHK')), root)
            reference = json.loads((root/'trays.json').read_text())
            self.assertFalse(controlled.intersection(observed))
            for name, backdrop in self.index['backdrops'].items():
                self.assertEqual(len(backdrop['pages']), len(reference['trays'][name]['pages']))
                self.assertEqual(len(backdrop['omittedPrimaryScripts']), len(self.index['trays'][backdrop['owner']]['buttons']))
                for page, expected in zip(backdrop['pages'], reference['trays'][name]['pages']):
                    actual = Image.open(self.root/page['image']).convert('RGBA')
                    oracle = Image.open(root/'trays'/expected['image']).convert('RGBA')
                    self.assertEqual(actual.size, (817,168))
                    self.assertEqual(actual.tobytes(), oracle.tobytes(), f'{name}: {page["image"]}')

    def test_binary_owner_callback_ranges_are_source_bound(self):
        binary = self.read('Contents/MacOS/Kid Pix')
        self.assertEqual(motion.sha(binary), 'a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5')
        for i in range(struct.unpack_from('>I', binary, 4)[0]):
            cpu, _, offset, size, _ = struct.unpack_from('>5I', binary, 8+i*20)
            if cpu == 7:
                binary = binary[offset:offset+size]
                break
        # __TEXT/__DATA in this identified i386 slice map VA to file VA-0x1000.
        slots = [(0x31f148,0xf72f8,0xf71d2,0xf71dc), (0x31f268,0xf72f8,0xf0b9c,0xf0ba4),
                 (0x31f380,0xf1e42,0xf71d2,0xf71dc), (0x31f4a0,0xf72f8,0xf2c84,0xf2c8c),
                 (0x31f5a0,0xf72f8,0xf3b0a,0xf3b12)]
        for vtable, loader, first, last in slots:
            self.assertEqual([struct.unpack_from('<I',binary,vtable-0x1000+s)[0] for s in (0x48,0x6c,0x70)], [loader,first,last])


if __name__ == '__main__':
    unittest.main()
