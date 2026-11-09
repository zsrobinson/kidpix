from importlib import import_module
import json
import struct
import tempfile
import unittest

from PIL import Image

buttons_module = import_module("button-animation")
button_records = buttons_module.button_records
region_rectangles = buttons_module.region_rectangles


class ButtonRecordTests(unittest.TestCase):
    def test_preserves_all_state_scripts_and_separate_rollover_script(self):
        words = [14004, 14005, 0, 0, 1, 0, 19000, 1, 0, 0, 14006, 0, 0, 0, 1, 0]
        button = button_records(struct.pack(">16H", *words), ["pencil"])[0]
        self.assertEqual(button["stateScripts"], [14004, 14005, 0, 0])
        self.assertEqual(button["rolloverScript"], 14006)
        self.assertFalse(button["rolloverLoops"])
        self.assertTrue(button["rolloverCancelsOnLeave"])
        self.assertEqual(button["name"], "pencil")
        self.assertEqual(button["rawWords"], words)

    def test_easel_rollover_creation_flag_enables_repeat(self):
        words = [1000, 1001, 1001, 1001, 2, 375, 224, 1, 0, 0, 1002, 1, 0, 0, 1, 0]
        button = button_records(struct.pack(">16H", *words))[0]
        self.assertTrue(button["rolloverLoops"])
        self.assertTrue(button["rolloverCancelsOnLeave"])

    def test_partial_record_is_rejected(self):
        with self.assertRaises(ValueError):
            button_records(bytes(31))


class RegionTests(unittest.TestCase):
    def test_preserves_a_single_authored_rectangle(self):
        data = b"RGN " + struct.pack(">4h2H4h", 34, 18, 113, 61, 1, 1, 34, 18, 113, 61)
        region = region_rectangles(data)
        self.assertEqual(region["boundsXYWH"], [34, 18, 79, 43])
        self.assertEqual(region["rectsLTRB"], [[34, 18, 113, 61]])
        self.assertEqual(region["status"], "exact")

    def test_firehose_union_keeps_the_gap_beside_its_narrow_nozzle(self):
        data = b"RGN " + struct.pack(">4h2H8h", 910, 330, 1005, 455, 2, 2,
                                      910, 355, 1005, 455, 938, 330, 973, 356)
        region = region_rectangles(data)
        self.assertEqual(region["rectangleCount"], 2)
        self.assertEqual(region["rectsLTRB"], [[910, 355, 1005, 455], [938, 330, 973, 356]])
        self.assertFalse(any(left <= 920 < right and top <= 340 < bottom
                             for left, top, right, bottom in region["rectsLTRB"]))
        self.assertTrue(any(left <= 950 < right and top <= 340 < bottom
                            for left, top, right, bottom in region["rectsLTRB"]))

    def test_rectangle_count_uses_byte14_and_preserves_unknown_word12(self):
        data = b"RGN " + struct.pack(">4h2H4h", 0, 0, 10, 20, 17, 1, 0, 0, 10, 20)
        self.assertEqual(region_rectangles(data)["rawWord12"], 17)
        self.assertEqual(region_rectangles(data)["rectangleCount"], 1)

    def test_unsupported_and_malformed_geometry_is_not_turned_into_a_box(self):
        valid = b"RGN " + struct.pack(">4h2H4h", 0, 0, 10, 20, 1, 1, 0, 0, 10, 20)
        for data in [b"RGN ", b"WRNG" + valid[4:], valid[:-1], valid + bytes(16),
                     b"RGN " + struct.pack(">4h2H4h", 0, 0, 10, 20, 1, 1, 0, 0, 11, 20)]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                region_rectangles(data)


def initial_script(images, origin=(10, 20), tail=b"\x01\x02\x00\x02"):
    header = bytearray(26)
    struct.pack_into(">H", header, 2, 1000)
    struct.pack_into(">4h", header, 16, *origin, origin[0] + 100, origin[1] + 100)
    return bytes(header) + b"\x04\x04\x00\x64\x10" + bytes([len(images)]) + b"".join(
        struct.pack(">Hhh", *image) for image in images) + tail


class ImageRegionTests(unittest.TestCase):
    def setUp(self):
        # Pixel contents deliberately contain transparent borders and holes.
        # Native kind 1 uses full image dimensions, including these pixels.
        first = Image.new("RGBA", (4, 3))
        first.putpixel((2, 1), (255, 0, 0, 255))
        second = Image.new("RGBA", (2, 5))
        second.putpixel((0, 2), (0, 255, 0, 255))
        self.images = [first, second]
        self.archive = {
            (b"tBMH", 1000): struct.pack(">H", 2),
            (b"REGS", 1000): struct.pack(">3h", 0, 2, -1),
            (b"REGS", 1001): struct.pack(">3h", 0, 1, 2),
            (b"tSCR", 10): initial_script([(0x8001, 0, 0), (0x8002, 7, -4)]),
            (b"tSCR", 11): initial_script([(0x8001, -5, 5)]),
            (b"tSCR", 12): initial_script([(0x8002, 20, 10)], tail=b"\x01\x02\x10\x01\x80\x01\x00\x64\x00\x64\x01\x02\x00\x02"),
        }
        self.sprite = lambda bank, index: self.images[index]
        self.button = {"stateScripts": [10, 11, 0, 0], "rolloverScript": 0}

    def test_initial_bounds_use_full_registered_bitmap_rectangles_including_gaps(self):
        data = buttons_module.initial_script_bounds(self.archive, 10, self.sprite)
        self.assertEqual(data["boundsLTRB"], [8, 14, 20, 22])
        self.assertEqual(data["parts"][0], {"rawImage": 0x8001, "image": 1, "sourceXY": [0, 0],
                         "registrationXY": [2, 1], "rectLTRB": [8, 19, 12, 22]})
        self.assertEqual(data["parts"][1]["rectLTRB"], [18, 14, 20, 19])
        region = buttons_module.image_button_region({**self.button, "stateScripts": [10, 0, 0, 0]}, self.archive, self.sprite)
        self.assertEqual(region["rectsLTRB"], [[8, 14, 20, 22]])
        # Neither part paints the gap (14,17), but its rectangular control hits it.
        self.assertFalse(any(x0 <= 14 < x1 and y0 <= 17 < y1 for x0, y0, x1, y1 in
                             [part["rectLTRB"] for part in data["parts"]]))

    def test_without_rollover_native_control_is_rest_state1_rectangle_union(self):
        region = buttons_module.image_button_region(self.button, self.archive, self.sprite)
        self.assertEqual(region["boundsXYWH"], [3, 14, 17, 13])
        self.assertEqual(region["rectsLTRB"], [[3, 14, 20, 27]])
        self.assertEqual(region["boundsSelection"], "rest-state1-initial-group-union")

    def test_fully_transparent_bitmap_still_has_the_full_native_hit_rectangle(self):
        self.images[0] = Image.new("RGBA", (4, 3))
        self.archive[b"tSCR", 10] = initial_script([(0x8001, 0, 0)])
        region = buttons_module.image_button_region({**self.button, "stateScripts": [10, 0, 0, 0]}, self.archive, self.sprite)
        self.assertIsNone(self.images[0].getbbox())
        self.assertEqual(region["rectsLTRB"], [[8, 19, 12, 22]])

    def test_rollover_initial_bounds_replace_union_and_do_not_include_later_frames(self):
        region = buttons_module.image_button_region({**self.button, "rolloverScript": 12}, self.archive, self.sprite)
        self.assertEqual(region["boundsXYWH"], [31, 28, 2, 5])
        self.assertEqual(region["rectsLTRB"], [[31, 28, 33, 33]])
        self.assertEqual(region["resource"], 12)
        self.assertEqual(region["boundsSelection"], "rollover-initial-group")
        self.assertEqual([entry["role"] for entry in region["initialScriptBounds"]], ["rest", "state1", "rollover"])

    def test_alternate_tail_does_not_block_independently_known_initial_geometry(self):
        self.archive[b"tSCR", 11] = initial_script([(0x8001, -5, 5)]) + b"\x10\x01\x00\x00"
        words = [10, 11, 0, 0, 1, 0, 200, 1, 0, 0, 12, 1, 0, 0, 1, 0]
        self.archive[b"MBTN", 75] = struct.pack(">16H", *words)
        with tempfile.TemporaryDirectory() as output:
            manifest = buttons_module.export_button_animations(self.archive, 75, output, self.sprite, ["fixture"], "Fixture.MHK")
            region = manifest["buttons"][0]["hotspotRegion"]
            self.assertEqual(region["status"], "exact")
            self.assertEqual(region["boundsXYWH"], [31, 28, 2, 5])
            self.assertIn("11", manifest["unsupportedScripts"])
            with open(f"{output}/button-animations.json") as exported:
                self.assertEqual(json.load(exported)["buttons"][0]["hotspotRegion"], region)

    def test_missing_registration_and_unknown_initial_program_keep_explicit_fallback(self):
        del self.archive[b"REGS", 1001]
        with self.assertRaisesRegex(ValueError, "registration pair"):
            buttons_module.image_button_region(self.button, self.archive, self.sprite)
        self.archive[b"REGS", 1001] = struct.pack(">3h", 0, 1, 2)
        self.archive[b"tSCR", 10] = bytes(26) + b"\x0f\x02\x00\x02"
        with self.assertRaisesRegex(ValueError, "Unsupported command"):
            buttons_module.image_button_region(self.button, self.archive, self.sprite)


if __name__ == "__main__":
    unittest.main()
