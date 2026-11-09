import importlib
import struct
import unittest

decode = importlib.import_module("native-cursor").decode_cursor


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


if __name__ == "__main__":
    unittest.main()
