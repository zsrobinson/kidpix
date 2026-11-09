from importlib import import_module
import struct
import unittest

paper = import_module('native-paper')


def script(images, *, origin=(0, 0), bounds=(0, 0, 100, 100), waits=0):
    data = bytearray(26)
    struct.pack_into('>H', data, 2, 1000)
    struct.pack_into('>4h', data, 16, origin[0], origin[1], bounds[2], bounds[3])
    data.extend(b'\x04\x04\x00\x64')
    for index, group in enumerate(images):
        data.extend(bytes([0x10, len(group)]))
        for part in group:
            data.extend(struct.pack('>Hhh', *part))
        data.extend(b'\x01\x02')
    data.extend(b'\x00\x02')
    return bytes(data)


def archive():
    result = {(b'REGS', 1000): bytes(600), (b'REGS', 1001): bytes(600)}
    x = bytearray(result[b'REGS', 1000]); y = bytearray(result[b'REGS', 1001])
    for number, rx, ry in [(201, 121, -125), (68, -399, -125), (217, -399, -130)]:
        struct.pack_into('>h', x, number * 2, rx)
        struct.pack_into('>h', y, number * 2, ry)
    result[b'REGS', 1000] = x; result[b'REGS', 1001] = y
    result[b'tSCR', 1055] = script([[(0x8000 | 201, xx, -84), (0x8000 | 68, 90, -100), (0x8000 | 217, 90, -96)]
                                          for xx in [526, 445, 364, 283, 202, 121]], origin=(394, 499), bounds=(394, 499, 933, 633))
    result[b'tSCR', 1119] = script([[(number, 0, 0) for number in range(218, 239)]])
    result[b'tSCR', 1122] = script([[(number, 0, 0) for number in [242, 243, 244, 67]]])
    for number in [1052, 1053, 1054]:
        result[b'tSCR', number] = script([[(68, 10, 10), (217, 10, 10), (71, 20, 20)]])
    return result


class PaperTests(unittest.TestCase):
    def test_preserves_registration_before_runtime_sprite_substitution(self):
        result = paper.compile_paper(archive())
        self.assertEqual(result['frames'][0]['parts'], [dict(sprite=201, x=799, y=540), dict(sprite=68, x=883, y=524), dict(sprite=217, x=883, y=533)])
        self.assertEqual([frame['parts'][0]['x'] for frame in result['frames']], [799, 718, 637, 556, 475, 394])
        self.assertEqual(result['clipRect'], [394, 499, 539, 134])
        self.assertEqual(result['endCheckTick'] * result['tickMs'], 600)
        self.assertEqual(result['pageSprites'], [242, 243, 244])
        self.assertEqual(result['textureSprites'], list(range(218, 239)))
        self.assertTrue(result['states']['hover']['loop'])
        self.assertFalse(result['states']['tracking']['loop'])

    def test_rejects_unknown_commands_and_incomplete_substitution_tables(self):
        source = archive()
        source[b'tSCR', 1055] = source[b'tSCR', 1055][:-2] + b'\x05\x01\x00\x02'
        with self.assertRaisesRegex(ValueError, 'Unsupported tSCR command'):
            paper.compile_paper(source)
        source = archive()
        source[b'tSCR', 1119] = script([[(218, 0, 0)]])
        with self.assertRaisesRegex(ValueError, 'substitution table dimensions'):
            paper.compile_paper(source)

    def test_indexed_source_payload_preserves_native_stride_and_unscaled_pixels(self):
        bitmap = struct.pack('>4H', 2, 1, 4, 2) + bytes([0, 255, 99, 99])
        bank = struct.pack('>4HI', 1, 0, 1, 2, 12) + bitmap
        self.assertEqual(bytes(paper.sprite_payload(bank, 1)), bitmap)
        with self.assertRaisesRegex(ValueError, 'Missing native paper sprite'):
            paper.sprite_payload(bank, 2)

    def test_uses_declared_palette_start_and_rgb_instead_of_treating_index_as_gray(self):
        palette = struct.pack('>2H', 2, 2) + bytes([10, 20, 30, 0, 50, 60, 70, 0])
        bitmap = struct.pack('>4H', 4, 1, 6, 2) + bytes([0, 2, 3, 255, 111, 111])
        width, height, rgba = paper.indexed_paper_pixels(bitmap, palette)
        self.assertEqual((width, height), (4, 1))
        self.assertEqual(rgba, bytes([0, 0, 0, 0, 10, 20, 30, 255, 50, 60, 70, 255, 0, 0, 0, 255]))
        with self.assertRaisesRegex(ValueError, 'undeclared palette index 1'):
            paper.indexed_paper_pixels(struct.pack('>4H', 1, 1, 1, 2) + b'\x01', palette)


if __name__ == '__main__':
    unittest.main()
