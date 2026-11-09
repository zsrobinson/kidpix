from importlib import import_module
import struct
import unittest

button_records = import_module("button-animation").button_records


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


if __name__ == "__main__":
    unittest.main()
