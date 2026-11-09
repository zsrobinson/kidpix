"""Focused source-backed tests. Run with PYTHONPATH=scripts python3 this-file."""
from importlib import import_module
from pathlib import Path
import struct
import unittest

picker = import_module('native-color-picker')


class ColorPickerMaskTests(unittest.TestCase):
    def test_mask_preserves_runs_and_rejects_unproved_encoding(self):
        data = struct.pack('>4H', 5, 2, 6, 2) + bytes([0, 255, 255, 0, 255, 0, 255, 0, 0, 255, 0, 0])
        self.assertEqual(picker.mask_rows(data)['rows'], [[[1, 3], [4, 5]], [[0, 1], [3, 4]]])
        with self.assertRaises(ValueError):
            picker.mask_rows(struct.pack('>4H', 1, 1, 1, 2) + bytes([128]))
        with self.assertRaises(ValueError):
            picker.mask_rows(data[:-1])


class ColorPickerMountedSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        volume = Path('/Volumes/Kid Pix Deluxe 3D')
        if not volume.exists():
            raise unittest.SkipTest('Mounted original installer is required for source checks')
        ui = import_module('import-ui')
        read = ui.app_resources(volume)
        cls.big = ui.mohawk(read('Data/BigPicker.MHK'))
        cls.little = ui.mohawk(read('Data/LittlePicker.MHK'))
        cls.misc = ui.mohawk(read('Data/Misc.MHK'))
        cls.manifest = picker.compile_picker(cls.big, cls.little)
        cls.ui = ui

    def test_source_has_two_distinct_authored_timelines(self):
        clips = self.manifest['clips']
        self.assertEqual([f['parts'][0]['sprite'] for f in clips['opening']['frames']], list(range(1, 8)))
        self.assertEqual([f['parts'][0]['sprite'] for f in clips['closing']['frames']], list(range(7, 0, -1)))
        self.assertEqual(clips['opening']['tickMs'], 30)
        self.assertEqual(clips['closing']['tickMs'], 100)
        self.assertEqual(clips['opening']['endCheckTick'], 7)
        self.assertEqual(clips['closing']['endCheckTick'], 7)
        self.assertEqual([(p['x'], p['y']) for f in clips['opening']['frames'] for p in f['parts']],
                         [(-78, 559), (-46, 510), (-7, 470), (38, 426), (38, 426), (38, 426), (38, 426)])
        self.assertEqual(clips['opening']['clipRect'], [-80, 411, 427, 457])
        self.assertEqual([s['sound'] for s in clips['opening']['sounds']], [1501])
        self.assertEqual([s['sound'] for s in clips['closing']['sounds']], [1500])

    def test_geometry_and_bitmap_mask_align_to_actual_swatches(self):
        m = self.manifest['hitMask']
        self.assertEqual([m[k] for k in ['x', 'y', 'width', 'height']], [114, 509, 152, 146])
        self.assertEqual(sum(r - l for row in m['rows'] for l, r in row), 8939)
        self.assertEqual(self.manifest['retentionRegion']['rectsLTRB'],
                         [[85, 568, 170, 698], [40, 658, 125, 748], [110, 468, 290, 678]])
        self.assertEqual(self.manifest['dropperRegion']['rectsLTRB'], [[119, 462, 164, 507]])
        swatches = self.ui.sprite(self.big[b'tBMH', 1500], 11)
        self.assertEqual(swatches.size, (m['width'], m['height']))
        self.assertEqual(swatches.getpixel((76, 73))[3], 255)

    def test_all_exported_parts_have_proven_direct_color_encoding(self):
        payload = import_module('native-paper').sprite_payload
        for i in range(1, 13):
            data = payload(self.big[b'tBMH', 1500], i)
            self.assertIn(struct.unpack_from('>H', data, 6)[0], (0x2005, 0x2305))
            image = self.ui.sprite(self.big[b'tBMH', 1500], i - 1)
            self.assertEqual(image.mode, 'RGBA')

    def test_positional_color_change_cue_has_an_exact_primary_resource(self):
        rate, channels, pcm = import_module('import-original').decode_sound(self.misc[b'tWAV', 31504])
        self.assertEqual((rate, channels, len(pcm) // 2), (22050, 1, 1402))
        self.assertEqual(self.manifest['colorChangeCue']['sound'], 31504)

    def test_little_picker_is_static_and_registration_is_applied(self):
        small = self.manifest['smallPicker']
        self.assertIsNone(small['openingAnimation'])
        self.assertEqual([len(c['frames']) for c in small['clips'].values()], [1, 1, 1])
        self.assertEqual(small['clips']['1500']['frames'][0]['parts'], [{'sprite': 1, 'x': 15, 'y': 608}])
        for role in ['dropperRest', 'dropperTracking', 'dropperHover']:
            self.assertEqual(len(self.manifest['clips'][role]['frames']), 1)
        self.assertEqual(self.manifest['clips']['dropperTracking']['sounds'][0]['sound'], 1502)


if __name__ == '__main__':
    unittest.main()
