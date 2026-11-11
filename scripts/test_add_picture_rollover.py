from importlib import import_module
from pathlib import Path
import json
import struct
import tempfile
import unittest
from PIL import Image

fixture = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/add-picture-rollover-source.json').read_text())
raw = bytes.fromhex(fixture['resources']['tSCR/1128']['hex'])
decode = import_module('mohawk-script').decode_script
export = import_module('button-animation').export_button_animations

class AddPictureTests(unittest.TestCase):
    def test_exact_identity_required_and_every_byte_pinned(self):
        for identity in [None, ('Data/Easel.MHK', 1039), ('Other.MHK', 1128)]:
            with self.assertRaises(ValueError):
                decode(raw, resource=identity)
        for index in range(len(raw)):
            mutated = bytearray(raw)
            mutated[index] ^= 1
            with self.subTest(index=index), self.assertRaises(ValueError):
                decode(mutated, resource=('Data/Easel.MHK', 1128))
        for tail in [b'\0\2', raw[62:] + b'\0', b'']:
            if not tail: continue  # a complete strict prefix is independently valid
            with self.assertRaises(ValueError):
                decode(raw[:62] + tail, resource=('Data/Easel.MHK', 1128))

    def test_actual_1039_stays_unsupported_even_with_exception_identity(self):
        source = bytes.fromhex(fixture['resources']['tSCR/1039']['hex'])
        for identity in [None, ('Data/Easel.MHK',1039), ('Data/Easel.MHK',1128)]:
            with self.assertRaises(ValueError): decode(source,resource=identity)

    def test_reachable_timeline_and_opaque_suffix(self):
        parsed = decode(raw, resource=('Data/Easel.MHK', 1128))
        self.assertEqual(parsed['consumedBytes'], 62)
        self.assertEqual(parsed['trailing']['hex'], '800801ec011801020002')
        self.assertEqual([e['images'][0][0] & 0xfff for e in parsed['events'] if e['op'] == 'draw'], [109,211,113])
        self.assertFalse(any(e['op'] == 'sound' for e in parsed['events']))
        self.assertEqual(parsed['events'][-1], {'op':'wait','terminal':True})

    def test_export_reuses_media_and_matches_shipped_adapter(self):
        words = [0,0,0,0,2,1082,301,1,0,0,1128,1,0,0,0,0]
        archive = {(b'MBTN',75):struct.pack('>16H',*words), (b'tSCR',1128):raw,
                   (b'MRGN',1082):bytes.fromhex(fixture['resources']['MRGN/1082']['hex']),
                   (b'REGS',1000):bytes(524), (b'REGS',1001):bytes(524), (b'tBMH',1000):b''}
        with tempfile.TemporaryDirectory() as output:
            result = export(archive,75,output,lambda bank,index: Image.new('RGBA',(79,170)),['flipbook'],'Data/Easel.MHK')
            clip = result['scripts']['1128']
            adapter = json.loads((Path(__file__).resolve().parents[1] / 'src/add-picture-rollover.json').read_text())
            for key,value in adapter.items(): self.assertEqual(clip[key],value,key)
            self.assertEqual(list(Path(output).rglob('*.png')),[])
            self.assertEqual(result['unsupportedScripts'],{})
