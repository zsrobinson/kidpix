import importlib
import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile
import unittest

from PIL import Image

module = importlib.import_module("native-cursor")
decode = module.decode_cursor


def ic_fixture(bitmaps, hotspot=(0, 0)):
    table_size = 8 + 4 * len(bitmaps)
    offsets, payload = [], bytearray()
    for width, height, stride, pixels in bitmaps:
        offsets.append(table_size + len(payload))
        payload.extend(struct.pack(">4H", width, height, stride, 0x2005) + pixels)
    return (b"IC" + struct.pack(">3H", *hotspot, 0)
            + struct.pack(">H4xH", len(bitmaps), 2)
            + struct.pack(f">{len(offsets)}I", *offsets) + payload)


def color_fixture(*, outside=(255, 255, 255), mask=0xe0):
    """Native-layout record, sparse ColorSpec values 0/35/253, not ordinals."""
    data = bytearray(402)
    struct.pack_into(">HII", data, 0, 0x8001, 96, 146)
    data[52] = mask
    struct.pack_into(">2h", data, 84, 9, 7)
    struct.pack_into(">IH4hHH", data, 96, 0, 0x8010, 0, 0, 16, 16, 0, 0)
    struct.pack_into(">4H", data, 126, 0, 8, 1, 8)
    struct.pack_into(">I", data, 138, 402)
    data[146:150] = bytes([35, 253, 0, 0])
    data.extend(struct.pack(">IHH", 123, 0, 2))
    for index, rgb in [(0, outside), (35, (255, 0, 0)), (253, (34, 34, 34))]:
        data.extend(struct.pack(">4H", index, *(c * 257 for c in rgb)))
    return bytes(data)


class CursorTests(unittest.TestCase):
    def test_ic_preserves_pixels_and_hotspot_without_applying_a_color_key(self):
        bank = struct.pack(">H4xHI", 1, 2, 12)
        bitmap = struct.pack(">4H", 2, 2, 8, 0x2005)
        pixels = bytes([255, 255, 0, 0, 255, 0, 255, 0,
                        255, 0, 0, 255, 0, 0, 0, 0])
        data = b"IC" + struct.pack(">HHH", 1, 1, 0) + bank + bitmap + pixels
        cursor = decode(data)
        self.assertEqual(cursor["hotspot"], [1, 1])
        self.assertEqual(cursor["images"][0].size, (2, 2))
        self.assertEqual(list(cursor["images"][0].getdata()), [
            (255, 0, 0, 255), (0, 255, 0, 255),
            (0, 0, 255, 255), (0, 0, 0, 0),
        ])

    def test_classic_mask_and_vertical_horizontal_hotspot_order(self):
        data = bytes([0x80]) + bytes(31)
        mask = bytes([0xC0]) + bytes(31)
        cursor = decode(data + mask + struct.pack(">HH", 3, 2))
        self.assertEqual(cursor["hotspot"], [2, 3])
        image = cursor["images"][0]
        self.assertEqual(image.getpixel((0, 0)), (0, 0, 0, 255))
        self.assertEqual(image.getpixel((1, 0)), (255, 255, 255, 255))
        self.assertEqual(image.getpixel((2, 0))[3], 0)

    def test_unknown_inverted_or_truncated_formats_are_rejected(self):
        samples = [b"\x80\x01" + bytes(440), b"IC", bytes([0x80]) + bytes(67)]
        for data in samples:
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                decode(data)

    def test_color_cursor_sparse_palette_mask_and_hotspot(self):
        cursor = decode(color_fixture())
        self.assertEqual(cursor["hotspot"], [7, 9])
        self.assertTrue(cursor["pngUsable"])
        self.assertEqual(cursor["images"][0].tobytes()[:16], bytes([
            255, 0, 0, 255, 34, 34, 34, 255, 255, 255, 255, 255, 255, 255, 255, 0]))
        self.assertEqual(cursor["images"][0].size, (16, 16))

    def test_color_cursor_inversion_and_undefined_xor_are_not_silently_transparent(self):
        for outside, operation in [((0, 0, 0), "invert"), ((187, 187, 187), "undefined-color-xor")]:
            with self.subTest(outside=outside), self.assertRaises(module.UnsupportedCursor) as caught:
                decode(color_fixture(outside=outside))
            self.assertEqual(caught.exception.details["hotspot"], [7, 9])
            first = caught.exception.details["pixelOperations"][0]
            self.assertEqual(first, {"x": 3, "y": 0, "rgb": list(outside), "operation": operation})

    def test_color_cursor_rejects_malformed_layouts_and_palette(self):
        for offset, replacement in [
            (2, struct.pack(">I", 98)), (6, struct.pack(">I", 148)),
            (84, struct.pack(">h", -1)), (100, struct.pack(">H", 0x800f)),
            (112, struct.pack(">H", 1)), (128, struct.pack(">H", 4)),
            (138, struct.pack(">I", 10000)), (406, struct.pack(">H", 0x8000)),
            (408, struct.pack(">H", 255)), (418, struct.pack(">H", 0)),
            (412, struct.pack(">H", 0x1234)), (146, bytes([99])),
        ]:
            data = bytearray(color_fixture())
            data[offset:offset + len(replacement)] = replacement
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                decode(bytes(data))
        for end in (2, 95, 145, 401, 409, 433):
            with self.subTest(truncated=end), self.assertRaises(ValueError):
                decode(color_fixture()[:end])

    def test_ic_components_are_not_animation_frames_or_green_key_images(self):
        # Transparent green has zero coverage despite its first byte being 255.
        # The second mask pixel has arbitrary byte zero; it is ignored, rather
        # than used as alpha to unpremultiply the three coefficients.
        data = ic_fixture([
            (2, 1, 8, bytes([255, 80, 90, 100, 255, 80, 90, 100])),
            (2, 1, 8, bytes([255, 0, 255, 0, 0, 5, 128, 255])),
        ])
        cursor = decode(data)
        self.assertFalse(cursor["pngUsable"])
        self.assertEqual(cursor["images"][1].getpixel((1, 0)), (5, 128, 255, 0))
        image = module.colorize_cursor(cursor, (255, 128, 0))
        self.assertEqual(image.getpixel((0, 0)), (80, 90, 100, 255))
        self.assertEqual(image.getpixel((1, 0)), (133, 69, 5, 255))

    def test_ic_transform_blends_clamps_and_keeps_destination_alpha(self):
        cursor = decode(ic_fixture([
            (2, 1, 8, bytes([128, 10, 20, 30, 255, 10, 20, 30])),
            (2, 1, 8, bytes([255, 0, 0, 128, 255, 255, 255, 255])),
        ]))
        image = module.colorize_cursor(cursor, (255, 128, 0))
        # Byte-level premultiplied results are (4,9,14,128), (255,255,255,255).
        expected = Image.frombytes("RGBa", (2, 1), bytes([4, 9, 14, 128, 255, 255, 255, 255])).convert("RGBA")
        self.assertEqual(image.tobytes(), expected.tobytes())
        for color in [(256, 0, 0), (-1, 0, 0), (True, 0, 0), (1, 2), (1.0, 2, 3)]:
            with self.subTest(color=color), self.assertRaises(ValueError):
                module.colorize_cursor(cursor, color)

    def test_ic_stride_padding_and_premultiplied_edges(self):
        data = ic_fixture([(1, 2, 8, bytes([128, 64, 32, 0, 1, 2, 3, 4,
                                                  255, 9, 8, 7, 5, 6, 7, 8]))])
        self.assertEqual(decode(data)["images"][0].tobytes(), bytes([127, 63, 0, 128, 9, 8, 7, 255]))

    def test_ic_invalid_tables_and_pixels_raise_value_error(self):
        valid = ic_fixture([(1, 1, 4, bytes([255, 1, 2, 3]))])
        for offset, value in [(8, struct.pack(">H", 3)), (16, struct.pack(">I", 0)),
                              (16, struct.pack(">I", 999)), (24, struct.pack(">H", 3))]:
            data = bytearray(valid)
            data[offset:offset + len(value)] = value
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                decode(bytes(data))
        with self.assertRaises(ValueError):
            decode(valid[:-1])

    def test_export_schema_keeps_unsupported_details_and_source_coefficients(self):
        archive = {(b'tCUR', 10018): color_fixture(),
                   (b'tCUR', 10024): color_fixture(outside=(187, 187, 187)),
                   (b'tCUR', 10000): ic_fixture([
                       (1, 1, 4, bytes([255, 20, 30, 40])),
                       (1, 1, 4, bytes([255, 7, 8, 9]))]),
                   (b'tBMH', 5): b'ignored'}
        with tempfile.TemporaryDirectory() as directory:
            manifest = module.export_cursors(archive, directory)
            self.assertEqual(json.loads((Path(directory) / 'cursors.json').read_text()), manifest)
            self.assertEqual(set(manifest['items']), {'10000', '10018'})
            self.assertEqual(manifest['unsupported'][0]['hotspot'], [7, 9])
            item = manifest['items']['10000']
            self.assertEqual(item['engineBindings'][0]['class'], 'RChalk')
            self.assertEqual(item['frames'][1]['role'], 'color-transform')
            self.assertFalse(item['pngUsable'])
            self.assertFalse(manifest['nativeRuntimeVerified'])
            image = Image.open(Path(directory) / item['frames'][1]['image'])
            self.assertEqual(image.tobytes(), bytes([7, 8, 9, 255]))


@unittest.skipUnless(os.environ.get('KIDPIX_CURSOR_FIXTURES'), 'Set KIDPIX_CURSOR_FIXTURES to extracted tCUR directory')
class SourceCursorTests(unittest.TestCase):
    def test_source_color_resources_match_pixel_fingerprints(self):
        # SHA-256 over 16x16 row-major RGBA, including RGB of transparent pixels.
        # Recorded after a separate sparse-palette/bit-plane corpus comparison.
        expected = {
            10012: ((7, 9), '77330c465ed5516bbbb93ebe0b09bbe792e5e8e522709daa3b8dc98ba2630649'),
            10016: ((2, 3), 'e1ef3f6237b8eea575513b7b5a09c263e0a20cc5757721a52e40b01a17c6ebe4'),
            10018: ((8, 8), '5ae829de361b64e3b6c621e3a29b3e2a2ed11ea774eb6cf6cd5c4bea7e602fe4'),
            10022: ((7, 7), '93de82d81b1b134cbc840a904e999b849f29b9b5921e56e0206a0d4ca44b08c5'),
            10026: ((6, 6), '1155499ee3cd141c68dc49beb42ee2dcc10ea63d6e927af066c078ab80fc7d29'),
        }
        for resource, (hotspot, digest) in expected.items():
            with self.subTest(resource=resource):
                cursor = decode((Path(os.environ['KIDPIX_CURSOR_FIXTURES']) / f'{resource}.tCUR').read_bytes())
                self.assertEqual(tuple(cursor['hotspot']), hotspot)
                self.assertEqual(hashlib.sha256(cursor['images'][0].tobytes()).hexdigest(), digest)

    def test_source_10024_preserves_unresolved_colored_xor_coordinates(self):
        data = (Path(os.environ['KIDPIX_CURSOR_FIXTURES']) / '10024.tCUR').read_bytes()
        with self.assertRaises(module.UnsupportedCursor) as caught:
            decode(data)
        self.assertEqual(caught.exception.details['hotspot'], [11, 11])
        self.assertEqual(caught.exception.details['monochromeFallbackInversionPixels'], 1)
        self.assertEqual(caught.exception.details['pixelOperations'], [
            {'x': 6, 'y': 1, 'rgb': [187, 187, 187], 'operation': 'undefined-color-xor'},
            {'x': 7, 'y': 2, 'rgb': [153, 102, 153], 'operation': 'undefined-color-xor'},
        ])


if __name__ == "__main__":
    unittest.main()
