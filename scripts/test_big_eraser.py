from importlib import import_module
import json
from pathlib import Path
import struct
import unittest

eraser = import_module('native-big-eraser')


class BigEraserTests(unittest.TestCase):
    def test_rejects_unrecognized_executable_and_unmapped_addresses(self):
        with self.assertRaisesRegex(ValueError, 'universal'):
            eraser.I386Image(bytes(64))

    @unittest.skipUnless(Path('artifacts/research/kidpix-original').exists(), 'Original binary not available')
    def test_binary_paths_timing_and_panel_ids_are_read_from_primary_evidence(self):
        binary = eraser.I386Image(Path('artifacts/research/kidpix-original').read_bytes())
        config = Path('artifacts/research/KPD3.cfg').read_text()
        result = eraser.compile_engine(binary, config, set())
        firehose = result['firehose']
        self.assertEqual([firehose[key] for key in ['initialDelayMs', 'updateIntervalMs', 'maximumElapsedMs']], [200, 110, 2000])
        self.assertEqual(firehose['alpha'], struct.unpack('<f', bytes.fromhex('9a99993e'))[0])
        self.assertEqual(len(firehose['paths']), 10)
        self.assertEqual(firehose['paths'][0][:4], [0, 0, 0, .25])
        self.assertEqual(firehose['finalPath'], list(binary.unpack('<16f', 0x260b50)))
        self.assertEqual(result['panel']['bitmapIds'], list(range(3701, 3715)))
        self.assertEqual(result['effects'][-1]['name'], 'Vanish')
        self.assertIsNone(result['effects'][-1]['soundId'])
        self.assertEqual(result['effects'][10]['qfx']['path'], 'Data/Quicktimefx/Explode.qfx')
        self.assertFalse(result['nativeRuntimeVerified'])
        with self.assertRaisesRegex(ValueError, 'Unmapped'):
            binary.read(0xfffffff0, 8)

    @unittest.skipUnless(Path('public/original/ui/big-eraser/manifest.json').exists(), 'Optional DMG export not available')
    def test_export_has_no_invented_actor_placement_or_qfx_renderer(self):
        result = json.loads(Path('public/original/ui/big-eraser/manifest.json').read_text())
        self.assertFalse(result['firehose']['actor']['enabled'])
        self.assertEqual(result['firehose']['actor']['declaredCollection'], 3600)
        self.assertEqual(result['firehose']['actor']['loadedBank'], 3900)
        self.assertEqual(len(result['firehose']['actor']['frames']), 11)
        self.assertEqual(result['firehose']['actor']['lastDrawTick'], 10)
        self.assertEqual([effect['toolId'] for effect in result['effects'] if effect['supported']], [137])


if __name__ == '__main__':
    unittest.main()
