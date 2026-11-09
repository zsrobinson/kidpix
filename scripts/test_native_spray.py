import importlib
from pathlib import Path
from io import BytesIO
import json
import struct
import tempfile
import unittest
import zlib

module = importlib.import_module("native-spray")


def fixture():
    bitmap = struct.pack(">4H", 1, 1, 4, 0x2005) + bytes([255, 50, 100, 150])
    # Two frames; storage stride is padded to four, but the offset table is not.
    unpacked = struct.pack(">2I", 16, 28) + bitmap + bitmap
    packed = zlib.compress(unpacked)
    bank = struct.pack(">4HII", 2, 0, 4, 0x0302, len(unpacked), len(packed)) + packed
    header = bytearray(26)
    struct.pack_into(">H", header, 2, 24000)
    struct.pack_into(">4h", header, 16, 300, 100, 340, 160)
    commands = bytes.fromhex(
        "04040064"             # interval 100 ms
        "10018001000a0014"     # registered image 1 at (10, 20)
        "01020102"             # retain it for two intervals
        "030600020001"         # sound resource base+2 on channel 1
        "04040042"             # interval 66 ms
        "10010002fff90008"     # unregistered image 2 at (-7, 8)
        "0102"                 # retain it for 66 ms
        "1001800100010002"     # final image group to retain on completion
        "01020002"             # terminal wait does not add 66 ms
    )
    return {
        (b"tBMH", 24000): bank,
        (b"REGS", 24000): struct.pack(">3h", 0, 3, 9),
        (b"REGS", 24001): struct.pack(">3h", 0, 4, 10),
        (b"tSCR", 24000): bytes(header) + commands,
        (b"tWAV", 24002): b"sound-fixture",
    }


class SprayTests(unittest.TestCase):
    def test_preserves_registered_layers_holds_terminal_frame_and_sound_onset(self):
        manifest = module.analyze_native_spray(fixture(), "moving-spray")
        bank = manifest["banks"]["24000"]
        self.assertEqual(bank["frameCount"], 2)
        self.assertEqual(bank["storageStride"], 4)
        self.assertEqual(bank["frames"][1]["registration"], [9, 10])
        clip = manifest["clips"]["24000"]
        self.assertEqual(clip["sourceOrigin"], [300, 100])
        self.assertEqual(clip["firstDrawRawPosition"], [10, 20])
        self.assertEqual(clip["sourceBounds"], [300, 100, 40, 60])
        self.assertEqual([frame["durationMs"] for frame in clip["frames"]], [200, 66, 0])
        self.assertEqual([frame["atMs"] for frame in clip["frames"]], [0, 200, 266])
        self.assertEqual(clip["frames"][0]["parts"][0], {"frame": 0, "x": 7, "y": 16, "registered": True})
        self.assertEqual(clip["frames"][1]["parts"][0]["x"], -7)
        self.assertEqual(clip["sounds"][0]["atMs"], 200)
        self.assertEqual(clip["sounds"][0]["id"], 24002)
        self.assertEqual(clip["durationMs"], 266)
        self.assertEqual(clip["minimumCompletionMs"], 332)
        self.assertEqual(clip["terminalFrame"], 2)
        self.assertFalse(clip["loop"])

    def test_static_bank_keeps_all_real_entries_and_excludes_padding(self):
        archive = {key: value for key, value in fixture().items() if key[0] not in (b"tSCR", b"tWAV")}
        manifest = module.analyze_native_spray(archive, "spray")
        self.assertEqual(len(manifest["banks"]["24000"]["frames"]), 2)
        self.assertEqual(manifest["clips"], {})

    def test_unknown_commands_or_missing_source_references_fail_explicitly(self):
        for mutate in [
            lambda archive: archive.__setitem__((b"tSCR", 24000), archive[b"tSCR", 24000][:-2] + bytes.fromhex("ffff0002")),
            lambda archive: archive.pop((b"REGS", 24001)),
            lambda archive: archive.pop((b"tWAV", 24002)),
        ]:
            archive = fixture()
            mutate(archive)
            with self.assertRaises(ValueError):
                module.analyze_native_spray(archive, "moving-spray")

    def test_export_writes_complete_frame_assets_and_requires_audio_decoder(self):
        archive = module.NativeSprayArchive(fixture(), "moving-spray")
        with tempfile.TemporaryDirectory() as output:
            with self.assertRaisesRegex(ValueError, "sound decoder"):
                archive.export(output, lambda data: ("png", b"image", 1, 1))
            manifest = archive.export(output, lambda data: ("png", b"image", 1, 1),
                                      lambda data: (8000, 1, bytes(8)))
            for frame in manifest["banks"]["24000"]["frames"]:
                self.assertEqual((Path(output) / frame["image"]).read_bytes(), b"image")
            self.assertTrue((Path(output) / "tools/moving-spray/native/sounds/24002.wav").is_file())
            self.assertTrue((Path(output) / "tools/moving-spray-native.json").is_file())

    def test_atlas_roundtrip_preserves_translucent_and_green_pixels_and_shards_banks(self):
        from PIL import Image

        expected = []
        def decode_bitmap(data):
            # Translucent source pixels catch accidental alpha-mask pasting.
            pixel = (80, 120, 160, 128) if not expected else (0, 255, 0, 255)
            image = Image.new("RGBA", (1, 1), pixel)
            expected.append(image.copy())
            encoded = BytesIO()
            image.save(encoded, format="PNG")
            return "png", encoded.getvalue(), 1, 1

        with tempfile.TemporaryDirectory() as output:
            index = module.export_native_spray(fixture(), output, mode="moving-spray", bitmap_decoder=decode_bitmap,
                                                sound_decoder=lambda data: (8000, 1, bytes(8)), layout="atlas", shard=True)
            self.assertTrue(index["sharded"])
            self.assertNotIn("clips", index)
            shard = json.loads((Path(output) / index["banks"]["24000"]["manifest"]).read_text())
            frames = shard["banks"]["24000"]["frames"]
            self.assertEqual(frames[0]["image"], frames[1]["image"])
            self.assertEqual(shard["clips"]["24000"]["firstDrawRawPosition"], [10, 20])
            for frame, source in zip(frames, expected):
                with Image.open(Path(output) / frame["image"]) as atlas:
                    x, y, width, height = frame["sourceRect"]
                    self.assertLessEqual(atlas.width, 2048)
                    self.assertLessEqual(atlas.height, 2048)
                    self.assertEqual(atlas.crop((x, y, x + width, y + height)).tobytes(), source.tobytes())

    def test_atlas_packing_never_overlaps_resizes_or_exceeds_limit(self):
        frames = [{"index": index, "width": width, "height": height} for index, (width, height) in enumerate([(3, 4), (3, 4), (4, 2), (2, 2)])]
        pages = module.pack_atlases(frames, 6)
        self.assertEqual(sum(len(page["placements"]) for page in pages), len(frames))
        for page in pages:
            occupied = set()
            self.assertLessEqual(page["width"], 6)
            self.assertLessEqual(page["height"], 6)
            for rect in page["placements"]:
                source = frames[rect["index"]]
                self.assertEqual([rect["width"], rect["height"]], [source["width"], source["height"]])
                pixels = {(x, y) for y in range(rect["y"], rect["y"] + rect["height"]) for x in range(rect["x"], rect["x"] + rect["width"])}
                self.assertFalse(occupied & pixels)
                occupied |= pixels
        with self.assertRaisesRegex(ValueError, "resizing"):
            module.pack_atlases(frames, 2)


if __name__ == "__main__":
    unittest.main()
