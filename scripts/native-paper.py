"""Export RTexturePicker's authored Easel paper-canister opening.

The source callback substitutes page/texture bitmap IDs AFTER registration.
Lookup scripts 1119/1122 are data tables, not motion or independent layers.
"""

import argparse
from importlib import import_module
import json
from pathlib import Path
import struct
import zlib


def palette_entries(data):
    """Mohawk tPAL: BE16 first index/count, followed by RGBx records.

    This is independently documented by Mohawk GraphicsManager::setPalette:
    https://github.com/scummvm/scummvm/blob/master/engines/mohawk/graphics.cpp
    Native Mac installation of the archive palette remains a separate question.
    """
    if len(data) < 4:
        raise ValueError("Truncated native paper palette")
    start, count = struct.unpack_from(">2H", data)
    if not count or start + count > 256 or len(data) != 4 + count * 4:
        raise ValueError("Unsupported native paper palette range")
    return start, [tuple(data[4 + index * 4:7 + index * 4]) for index in range(count)]


def indexed_paper_pixels(data, palette):
    width, height, stride, flags = struct.unpack_from(">4H", data)
    if flags != 2 or stride < width or len(data) < 8 + stride * height:
        raise ValueError("Unsupported indexed native paper bitmap")
    start, colors = palette_entries(palette)
    # Index0 is transparent in Mohawk animation blits. Reserved255 is black
    # in both Apple's standard8-bit color and inverse-grayscale CLUTs.
    entries = {0: (0, 0, 0, 0), 255: (0, 0, 0, 255)}
    entries.update({start + index: (*color, 255) for index, color in enumerate(colors)})
    pixels = bytearray()
    for y in range(height):
        for value in data[8 + stride * y:8 + stride * y + width]:
            if value not in entries:
                raise ValueError(f"Native paper bitmap references undeclared palette index {value}")
            pixels.extend(entries[value])
    return width, height, bytes(pixels)


def sprite_payload(collection, number):
    count, _, _, flags = struct.unpack_from(">4H", collection)
    if not 1 <= number <= count:
        raise ValueError(f"Missing native paper sprite {number}")
    if flags == 0x302:
        size, packed = struct.unpack_from(">II", collection, 8)
        pixels = zlib.decompress(collection[16:16 + packed])
        if len(pixels) != size:
            raise ValueError("Native paper bank decompression size mismatch")
        offset = struct.unpack_from(">I", pixels, (number - 1) * 4)[0] - 8
    elif flags == 2:
        pixels = collection
        offset = struct.unpack_from(">I", pixels, 8 + (number - 1) * 4)[0]
    else:
        raise ValueError(f"Unsupported native paper bank flags {flags:#x}")
    if offset < 0 or offset + 8 > len(pixels):
        raise ValueError("Invalid native paper bitmap offset")
    return memoryview(pixels)[offset:]


def compile_paper(archive):
    decode = import_module("mohawk-script").decode_script
    script = decode(archive[b"tSCR", 1055])
    bank = script["collection"]
    origin_x, origin_y = script["origin"]
    left, top, right, bottom = struct.unpack_from(">4h", archive[b"tSCR", 1055], 16)

    def lookup(resource):
        parsed = decode(archive[b"tSCR", resource])
        groups = [event for event in parsed["events"] if event["op"] == "draw"]
        if parsed["collection"] != bank or len(groups) != 1:
            raise ValueError(f"Unsupported native paper lookup script {resource}")
        return [part[0] & 0x7fff for part in groups[0]["images"]]

    textures = lookup(1119)
    page_lookup = lookup(1122)
    if len(textures) != 21 or len(page_lookup) != 4:
        raise ValueError("Native paper substitution table dimensions changed")
    pages = page_lookup[:3]  # Fourth entry is the canister part, not a page.
    frames = []
    interval = None
    tick = 0
    for event in script["events"]:
        if event["op"] == "interval":
            if interval is not None and interval != event["ms"]:
                raise ValueError("Variable native paper interval is unsupported")
            interval = event["ms"]
        elif event["op"] == "draw":
            if len(event["images"]) != 3:
                raise ValueError("Native paper callback expects exactly three image parts")
            parts = []
            for image_id, x, y in event["images"]:
                number = image_id & 0x7fff
                if image_id & 0x8000:
                    x -= struct.unpack_from(">h", archive[b"REGS", bank], number * 2)[0]
                    y -= struct.unpack_from(">h", archive[b"REGS", bank + 1], number * 2)[0]
                parts.append({"sprite": number, "x": origin_x + x, "y": origin_y + y})
            frames.append({"tick": tick, "parts": parts})
        elif event["op"] == "wait":
            if not frames:
                raise ValueError("Native paper wait before first draw")
            if not event.get("terminal"):
                tick += 1
        else:
            raise ValueError(f"Unsupported native paper event {event['op']}")
    if interval is None or not frames:
        raise ValueError("Missing native paper timing or image groups")
    states = {}
    for name, resource in [("rest", 1052), ("tracking", 1053), ("hover", 1054)]:
        parsed = decode(archive[b"tSCR", resource])
        state_frames, sounds = [], []
        state_tick = 0
        for event in parsed["events"]:
            if event["op"] == "interval":
                if event["ms"] != interval:
                    raise ValueError("Native paper state interval changed")
            elif event["op"] == "draw":
                parts = []
                for image_id, x, y in event["images"]:
                    number = image_id & 0x7fff
                    if image_id & 0x8000:
                        x -= struct.unpack_from(">h", archive[b"REGS", bank], number * 2)[0]
                        y -= struct.unpack_from(">h", archive[b"REGS", bank + 1], number * 2)[0]
                    parts.append({"sprite": number, "x": parsed["origin"][0] + x, "y": parsed["origin"][1] + y})
                state_frames.append({"tick": state_tick, "parts": parts})
            elif event["op"] == "sound":
                sounds.append({"tick": state_tick, "sound": bank + event["cue"], "channel": event["channel"]})
            elif event["op"] == "wait" and not event.get("terminal"):
                state_tick += 1
        states[name] = {"script": resource, "frames": state_frames, "sounds": sounds,
                        "endCheckTick": state_tick + 1, "texturePart": 1, "loop": name == "hover"}
    return {"version": 1, "source": "Data/Easel.MHK", "script": 1055, "collection": bank,
            "clipRect": [left, top, right - left, bottom - top], "tickMs": interval,
            "endCheckTick": tick + 1, "frames": frames, "pageSprites": pages,
            "textureSprites": textures, "substitutionParts": {"page": 0, "texture": 2},
            "sounds": [], "states": states, "creationFlags": 0x800031,
            "evidence": {"begin": "i386 0x8ec16–0x8edac", "drawCallback": "i386 0x8e89c–0x8e8bf",
                         "completion": "i386 0x8eb3a–0x8ec0d", "pageIndex": "trunc(selectedTextureIndex / 7)"}}


def export_paper(archive, output, bitmap_decoder):
    result = compile_paper(archive)
    output = Path(output)
    folder = output / "paper-canister"
    folder.mkdir(parents=True, exist_ok=True)
    fixed = {frame["parts"][1]["sprite"] for frame in result["frames"]}
    for state in result["states"].values():
        fixed.update(part["sprite"] for frame in state["frames"] for index, part in enumerate(frame["parts"])
                     if index != state["texturePart"])
    ids = sorted(fixed | set(result["pageSprites"]) | set(result["textureSprites"]))
    result["sprites"] = {}
    start, colors = palette_entries(archive[b"tPAL", result["collection"]])
    result["palette"] = {"resource": result["collection"], "start": start, "count": len(colors),
                         "transparentIndex": 0, "reservedBlackIndex": 255,
                         "source": "archive tPAL RGBx; original indexed bytes preserved without resampling",
                         "formatEvidence": "https://github.com/scummvm/scummvm/blob/master/engines/mohawk/graphics.cpp",
                         "nativeMacPortStatus": "Archive colors recovered; installation of this palette into the Mac drawing port is not yet established"}
    for number in ids:
        payload = sprite_payload(archive[b"tBMH", result["collection"]], number)
        indexed = struct.unpack_from(">H", payload, 6)[0] == 2
        if indexed:
            from io import BytesIO
            from PIL import Image
            width, height, rgba = indexed_paper_pixels(payload, archive[b"tPAL", result["collection"]])
            stream = BytesIO()
            Image.frombytes("RGBA", (width, height), rgba).save(stream, format="PNG")
            extension, pixels = "png", stream.getvalue()
        else:
            extension, pixels, width, height = bitmap_decoder(payload)
        if extension != "png":
            raise ValueError("Native paper sprites must decode losslessly to PNG")
        path = f"paper-canister/{number}.png"
        (output / path).write_bytes(pixels)
        result["sprites"][str(number)] = {"image": path, "width": width, "height": height,
                                          "sourceEncoding": "indexed8-tPAL" if indexed else "direct-RGBA"}
    (output / "paper-canister.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("volume", nargs="?", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/research/native-paper"))
    args = parser.parse_args()
    ui = import_module("import-ui")
    archive = ui.mohawk(ui.app_resources(args.volume)("Data/Easel.MHK"))
    result = export_paper(archive, args.output, import_module("import-original").bitmap)
    print(f"Exported {len(result['frames'])} frames and {len(result['sprites'])} unique native paper sprites.")
