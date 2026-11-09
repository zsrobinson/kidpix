from importlib import import_module
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

motion = import_module('native-drawing-motion')


class DrawingMotionTests(unittest.TestCase):
    def test_raw_channels_are_not_unpremultiplied_and_stride_is_removed(self):
        row = bytes([58, 0, 4, 0, 255, 4, 176, 255])
        payload = struct.pack('>4H', 2, 1, 12, 0x2005) + row + b'PAD!'
        self.assertEqual(motion.argb_pixels(payload), (2, 1, row))
        packed = zlib.compress(row + b'PAD!')
        compressed = struct.pack('>4H2I', 2, 1, 12, 0x2305, 12, len(packed)) + packed
        self.assertEqual(motion.argb_pixels(compressed), (2, 1, row))

    def test_rejects_truncated_or_unsupported_raw_pixels(self):
        with self.assertRaisesRegex(ValueError, 'Truncated'):
            motion.argb_pixels(struct.pack('>4H', 2, 1, 8, 0x2005) + bytes(4))
        with self.assertRaisesRegex(ValueError, 'flags'):
            motion.argb_pixels(struct.pack('>4H', 2, 1, 8, 2) + bytes(8))

    def test_one_based_bank_references_and_outer_compression(self):
        payload = struct.pack('>4H', 1, 1, 4, 0x2005) + bytes([255, 4, 176, 255])
        bank = struct.pack('>4HI', 1, 0, 0, 2, 12) + payload
        self.assertEqual(bytes(motion.sprite_payload(bank, 1)), payload)
        with self.assertRaisesRegex(ValueError, 'Missing'):
            motion.sprite_payload(bank, 0)
        unpacked = struct.pack('>I', 12) + payload
        compressed = zlib.compress(unpacked)
        bank = struct.pack('>4H2I', 1, 0, 0, 0x302, len(unpacked), len(compressed)) + compressed
        self.assertEqual(bytes(motion.sprite_payload(bank, 1)), payload)


@unittest.skipUnless(Path('/Volumes/Kid Pix Deluxe 3D').exists(), 'Source DMG is not mounted')
class DrawingMotionSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ui = import_module('import-ui')
        cls.archive = ui.mohawk(ui.app_resources(Path('/Volumes/Kid Pix Deluxe 3D'))(motion.SOURCE))
        cls.result = motion.compile_drawing_motion(cls.archive)

    def test_complete_source_dispatch_not_numbered_sprite_semantics(self):
        result = self.result
        self.assertEqual(len(result['scripts']), 12)
        for index, (button, first) in enumerate(zip(result['buttons'], range(18060, 18072, 3))):
            self.assertEqual(button['stateScripts'], [first, first + 1, 0, first + 1])
            self.assertEqual(button['rolloverScript'], first + 2)
            self.assertEqual(button['commandArgument'], index)
            self.assertEqual(button['mode'], 2)
            self.assertFalse(button['rolloverLoops'])
            self.assertTrue(button['rolloverCancelsOnLeave'])
            self.assertEqual(button['region']['rectsLTRB'], [[160 + 57 * index, 648, 213 + 57 * index, 757]])

    def test_full_group_counts_cue_offsets_and_end_boundaries(self):
        counts = [11, 11, 6, 16, 16, 6, 16, 16, 6, 14, 14, 5]
        sound_ticks = [2, 1, 0, 5, 0, 1, 0, 0, 0, 2, 0, 0]
        for resource, count, sound_tick in zip(range(18060, 18072), counts, sound_ticks):
            clip = self.result['scripts'][str(resource)]
            self.assertEqual(len(clip['frames']), count)
            self.assertEqual([frame['tick'] for frame in clip['frames']], list(range(count)))
            self.assertEqual(clip['endCheckTick'], count)
            self.assertEqual(clip['tickMs'], 100)
            self.assertEqual(clip['sounds'], [dict(tick=sound_tick, cue=resource - 18056,
                                                    sound=resource - 56, channel=1)])
        first = self.result['scripts']['18060']['frames'][0]['parts']
        self.assertEqual([p['sprite'] for p in first], [151, 11])
        self.assertEqual(self.result['scripts']['18060']['boundsXYWH'], [132, 635, 95, 120])
        for part in first:
            self.assertEqual([part['x'], part['y']], [130 + part['sourceXY'][0] - part['registrationXY'][0],
                                                     620 + part['sourceXY'][1] - part['registrationXY'][1]])

    def test_unknown_opcodes_or_changed_table_fail_closed(self):
        source = dict(self.archive)
        source[b'tSCR', 18060] = source[b'tSCR', 18060][:-2] + b'\x05\x01\x00\x02'
        with self.assertRaisesRegex(ValueError, 'Unsupported tSCR command'):
            motion.compile_drawing_motion(source)
        source = dict(self.archive)
        table = bytearray(source[b'MBTN', 18400])
        struct.pack_into('>H', table, 4, 18061)  # Would change mode2 to mode1.
        source[b'MBTN', 18400] = table
        with self.assertRaisesRegex(ValueError, 'table dispatch'):
            motion.compile_drawing_motion(source)

    def test_standalone_export_preserves_raw_bytes_and_only_owned_subdirectory(self):
        original = import_module('import-original')
        with tempfile.TemporaryDirectory(prefix='drawing-motion-') as temporary:
            root = Path(temporary)
            (root / 'ui.json').write_text('do not change')
            result = motion.export_drawing_motion(self.archive, root, original.bitmap, original.decode_sound)
            self.assertEqual((root / 'ui.json').read_text(), 'do not change')
            self.assertEqual({p.name for p in root.iterdir()}, {'ui.json', 'drawing-motion'})
            self.assertEqual(json.loads((root / 'drawing-motion/manifest.json').read_text()), result)
            for sprite in result['sprites'].values():
                raw = (root / sprite['argb']).read_bytes()
                self.assertEqual(len(raw), sprite['width'] * sprite['height'] * 4)
                self.assertEqual(hashlib.sha256(raw).hexdigest(), sprite['argbSha256'])
            self.assertEqual(len(result['sounds']), 12)
            self.assertFalse(result['nativeRuntimeVerified'])


if __name__ == '__main__':
    unittest.main()
