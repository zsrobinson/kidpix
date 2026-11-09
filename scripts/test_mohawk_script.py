import importlib
import struct
import unittest

decode = importlib.import_module("mohawk-script").decode_script


class ScriptTests(unittest.TestCase):
    def test_preserves_order_positions_repeated_waits_and_sound_cues(self):
        header = bytearray(26)
        struct.pack_into(">H", header, 2, 1000)
        struct.pack_into(">hh", header, 16, 18, 306)
        data = header + bytes.fromhex("04040064100180950200004f010201020306000800010002")
        script = decode(data)
        self.assertEqual(script["collection"], 1000)
        self.assertEqual(script["origin"], (18, 306))
        self.assertEqual(script["events"], [
            {"op": "interval", "ms": 100},
            {"op": "draw", "images": [(0x8095, 512, 79)]},
            {"op": "wait"}, {"op": "wait"},
            {"op": "sound", "cue": 8, "channel": 1},
        ])

    def test_refuses_unknown_truncated_or_unterminated_scripts(self):
        for suffix in ["ffff0002", "10028095", "03060008", "0102", "00020002", "0404", "04040000"]:
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                decode(bytes(26) + bytes.fromhex(suffix))

    def test_terminal_wait_finishes_without_an_extra_interval(self):
        script = decode(bytes(26) + bytes.fromhex("04040064100180950200004f01020002"))
        self.assertEqual(script["events"][-1], {"op": "wait", "terminal": True})


if __name__ == "__main__":
    unittest.main()
