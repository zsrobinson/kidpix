"""Export Big Eraser evidence and RBubbleCleaner's authored Firehose paths.

Reads the installer and the original i386 image; never edits shared ui.json.
The 3900 actor is exported for research, with placement explicitly unresolved.
"""

import argparse
from configparser import ConfigParser
from hashlib import sha256
from importlib import import_module
import json
from pathlib import Path
import struct


class I386Image:
    def __init__(self, data):
        if data[:4] != b"\xca\xfe\xba\xbe":
            raise ValueError("Expected the original universal Mach-O")
        self.digest = sha256(data).hexdigest()
        for index in range(struct.unpack_from(">I", data, 4)[0]):
            cpu, _, offset, size, _ = struct.unpack_from(">5I", data, 8 + index * 20)
            if cpu == 7:
                self.data = data[offset:offset + size]
                break
        else:
            raise ValueError("Original executable has no i386 image")
        if self.data[:4] != b"\xce\xfa\xed\xfe":
            raise ValueError("Unsupported i386 Mach-O")
        self.segments = []
        position = 28
        for _ in range(struct.unpack_from("<I", self.data, 16)[0]):
            command, length = struct.unpack_from("<2I", self.data, position)
            if command == 1:
                address, _, offset, size = struct.unpack_from("<4I", self.data, position + 24)
                if size:
                    self.segments.append((address, offset, size))
            position += length

    def read(self, address, size):
        for start, offset, length in self.segments:
            if start <= address and address + size <= start + length:
                return self.data[offset + address - start:offset + address - start + size]
        raise ValueError(f"Unmapped i386 address {address:#x}")

    def unpack(self, format, address):
        return struct.unpack(format, self.read(address, struct.calcsize(format)))

    def string(self, address, limit=256):
        return self.read(address, limit).split(b"\0", 1)[0].decode("ascii")


def compile_engine(image, config, available_paths):
    cfg = ConfigParser(strict=False, allow_no_value=True, inline_comment_prefixes=(";",))
    cfg.read_string(config)
    # RTTI anchors establish the association independently of guessed labels.
    for address, name in [(0x24f461, "Vanish"), (0x24e9a0, "N9Rembrandt14RFullCutEraserE")]:
        if image.string(address) != name:
            raise ValueError(f"Unexpected original binary at {address:#x}")
    constants = [image.unpack("<d", address)[0] for address in (0x2608b8, 0x2608c0, 0x2608c8)]
    if constants != [2.0, 0.2, 0.11]:
        raise ValueError("Unrecognized RBubbleCleaner timing constants")
    paths = [list(image.unpack("<16f", 0x2608d0 + index * 64)) for index in range(11)]
    names = {}
    for tool in range(123, 138):
        address, = image.unpack("<I", 0x3273c0 + tool * 4)
        names[tool] = image.string(address)
    qfx = {}
    for index in range(13):
        address = 0x33e730 + index * 0x204
        stored_id, = image.unpack("<h", address)
        tool = stored_id - 1  # Caller compares the table entry with tool ID + 1.
        name = image.string(address + 4)
        path = f"Data/Quicktimefx/{name}.qfx"
        qfx[tool] = {"path": path, "present": path in available_paths,
                     "tableAddress": f"i386 0x{address:08x}"}
    effects = []
    for tool, name in names.items():
        section = name + "Snd"
        sound = cfg.get(section, "startSoundID", fallback="").strip()
        effects.append({"toolId": tool, "name": name, "bitmapId": tool + 3577,
                        "panelIndex": tool - 124 if tool >= 124 else None,
                        "engine": "RDFirecracker" if tool == 123 else "RFullCutEraser" if tool == 137 else "RQuickTimeEraser",
                        "supported": tool == 137, "soundId": int(sound) if sound else None,
                        **({"qfx": qfx[tool]} if tool in qfx else {})})
    return {"version": 1, "originalExecutableSha256": image.digest, "nativeRuntimeVerified": False,
            "effects": effects, "panel": {"toolIds": list(range(124, 138)), "bitmapIds": list(range(3701, 3715)),
                "evidence": "i386 0x000efeb8–0x000eff05; factory 0x000ef80e–0x000ef8d3"},
            "firehose": {"toolId": 139, "engine": "RBubbleCleaner", "actionEvent": 266,
                "initialDelayMs": constants[1] * 1000, "updateIntervalMs": constants[2] * 1000,
                "maximumElapsedMs": constants[0] * 1000, "comparisons": "strictly-greater-than",
                "alpha": image.unpack("<f", 0x163005)[0],
                "paths": paths[:10], "finalPath": paths[10],
                "sound": {"soundId": cfg.getint("WaterCleanerSnd", "startSoundID"), "image": "water-cleaner-7433.wav"},
                "coordinates": "normalized x-right/y-up; cumulative white fills clipped to picture rectangle",
                "evidence": {"classVtable": "i386 0x003280b0; RTTI 0x00328130",
                    "begin": "i386 0x0016309c–0x00163149", "update": "i386 0x00163036–0x0016309a",
                    "advance": "i386 0x00162fca–0x00163033", "draw": "i386 0x00162de0–0x00162fc9",
                    "pathTable": "i386 0x002608d0–0x00260b8f", "complete": "i386 0x00162d42–0x00162dd7"}}}


def compile_actor(archive):
    script = import_module("mohawk-script").decode_script(archive[b"tSCR", 3900])
    frames, tick = [], 0
    for event in script["events"]:
        if event["op"] == "interval":
            if event["ms"] != 100:
                raise ValueError("Unexpected Firehose actor interval")
        elif event["op"] == "draw":
            frames.append({"tick": tick, "images": [list(part) for part in event["images"]]})
        elif event["op"] == "wait":
            if not event.get("terminal"):
                tick += 1
        else:
            raise ValueError(f"Unexpected Firehose actor operation {event['op']}")
    if len(frames) != 11:
        raise ValueError("Unexpected Firehose actor frame count")
    return {"source": "Data/Eraser.MHK", "script": 3900, "declaredCollection": script["collection"],
            "loadedBank": 3900, "tickMs": 100, "lastDrawTick": tick, "frames": frames,
            "rawHeaderBounds": list(struct.unpack_from(">4h", archive[b"tSCR", 3900], 16)),
            "soundCues": [], "enabled": False,
            "placementStatus": "Unresolved owner transform/placement; research export only, not a page wipe",
            "evidence": "i386 0x0005ad51–0x0005ae18 loads bank3900 separately and replaces script3900"}


def export(volume, binary, output):
    ui = import_module("import-ui")
    read, paths = ui.app_resources(volume, include_paths=True)
    manifest = compile_engine(I386Image(binary.read_bytes()), read("KPD3.cfg").decode("mac_roman"), set(paths))
    output.mkdir(parents=True, exist_ok=True)
    archive = ui.mohawk(read("Data/Eraser.MHK"))
    actor = compile_actor(archive)
    actor["sprites"] = {}
    for number in range(1, 12):
        path = f"firehose-{number}.png"
        image = ui.sprite(archive[b"tBMH", 3900], number - 1)
        image.save(output / path)
        actor["sprites"][str(number)] = {"image": path, "width": image.width, "height": image.height,
            "registration": [struct.unpack_from(">h", archive[b"REGS", 3900 + axis], number * 2)[0] for axis in range(2)]}
    manifest["firehose"]["actor"] = actor
    sounds = ui.mohawk(read("Data/Tools/WackyBrushSounds.MHK"))
    ui.pcm_sound(sounds[b"tWAV", 7433], output / "water-cleaner-7433.wav")
    # Preserve undecoded QuickTime parameters and their hashes as evidence only.
    for effect in manifest["effects"]:
        if effect.get("qfx", {}).get("present"):
            data = read(effect["qfx"]["path"])
            path = f"effect-{effect['toolId']}.qfx"
            (output / path).write_bytes(data)
            effect["qfx"].update(asset=path, sha256=sha256(data).hexdigest(), bytes=len(data))
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--volume", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--binary", type=Path, default=Path("artifacts/research/kidpix-original"))
    parser.add_argument("--output", type=Path, default=Path("public/original/ui/big-eraser"))
    args = parser.parse_args()
    result = export(args.volume, args.binary, args.output)
    print(f"Exported {len(result['firehose']['paths'])} Firehose paths, 11 actor poses, and {len(result['effects'])} engine mappings.")
