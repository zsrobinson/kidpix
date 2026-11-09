"""Extract only Tp.MHK MBTN18400's four drawing-control motion programs.

Standalone manifest; never updates ui.json. Raw ARGB data is retained because
the SECOND part is mode-9 data, not an ordinary premultiplied-alpha picture.
"""

import argparse
import hashlib
from importlib import import_module
import json
from pathlib import Path
import struct
import wave
import zlib


SOURCE = "Data/Tools/Tp.MHK"
NAMES = ("pencil", "chalk", "crayon", "marker")


def sprite_payload(bank, number):
    count, _, _, flags = struct.unpack_from(">4H", bank)
    if not 1 <= number <= count:
        raise ValueError(f"Missing drawing sprite {number}")
    if flags == 0x302:
        expected, packed = struct.unpack_from(">2I", bank, 8)
        bank = zlib.decompress(bank[16:16 + packed])
        if len(bank) != expected:
            raise ValueError("Drawing bank decompression size mismatch")
        offset = struct.unpack_from(">I", bank, (number - 1) * 4)[0] - 8
    elif flags == 2:
        offset = struct.unpack_from(">I", bank, 8 + (number - 1) * 4)[0]
    else:
        raise ValueError(f"Unsupported drawing bank flags {flags:#x}")
    if offset < 0 or offset + 8 > len(bank):
        raise ValueError("Invalid drawing sprite offset")
    return memoryview(bank)[offset:]


def argb_pixels(payload):
    """Tightly packed, unmodified source channels (no unpremultiplication)."""
    width, height, stride, flags = struct.unpack_from(">4H", payload)
    if not width or not height or stride < width * 4:
        raise ValueError("Invalid drawing bitmap dimensions")
    if flags == 0x2305:
        expected, packed = struct.unpack_from(">2I", payload, 8)
        pixels = zlib.decompress(payload[16:16 + packed])
        if len(pixels) != expected or expected != stride * height:
            raise ValueError("Drawing bitmap decompression size mismatch")
    elif flags == 0x2005:
        pixels = payload[8:8 + stride * height]
    else:
        raise ValueError(f"Unsupported drawing bitmap flags {flags:#x}")
    if len(pixels) != stride * height:
        raise ValueError("Truncated drawing bitmap pixels")
    return width, height, b"".join(bytes(pixels[y * stride:y * stride + width * 4]) for y in range(height))


def compile_drawing_motion(archive):
    buttons_module = import_module("button-animation")
    decode = import_module("mohawk-script").decode_script
    buttons = buttons_module.button_records(archive[b"MBTN", 18400], NAMES)
    if len(buttons) < 4:
        raise ValueError("Missing drawing-control records")
    buttons = buttons[:4]
    # This callback is installed for rows0–3 by RPencilPanel, not inferred
    # from the image or program numbers. Reject a changed table explicitly.
    for index, button in enumerate(buttons):
        if (button["command"] != 18400 or button["group"] != 18400
                or button["stateScripts"][2] != 0
                or not button["stateScripts"][3]
                or button["rawWords"][8] != index
                or button["hotspotKind"] != 2
                or button["rolloverParameters"] != [0, 0, 0]):
            raise ValueError("Unsupported drawing-control table dispatch")
        button["mode"] = 2
        button["commandArgument"] = button["rawWords"][8]
        button["region"] = buttons_module.region_rectangles(archive[b"MRGN", button["hotspotResource"]])
        button["auxiliaryClipRect"] = list(button["region"]["boundsXYWH"])
    scripts = {}
    sprite_ids = set()
    for resource in sorted({n for button in buttons for n in [*button["stateScripts"], button["rolloverScript"]] if n}):
        raw = archive[b"tSCR", resource]
        parsed = decode(raw)
        bank = parsed["collection"]
        if bank != 18000:
            raise ValueError("Drawing callback bank changed")
        tick, interval = 0, None
        frames, sounds = [], []
        for event in parsed["events"]:
            if event["op"] == "interval":
                if interval is not None and interval != event["ms"]:
                    raise ValueError("Variable drawing interval is unsupported")
                interval = event["ms"]
            elif event["op"] == "draw":
                if len(event["images"]) != 2:
                    raise ValueError("Drawing callback requires exactly two parts")
                parts = []
                for raw_id, x, y in event["images"]:
                    number = raw_id & 0x0FFF
                    if raw_id & 0xF000 != 0x8000:
                        raise ValueError("Unsupported drawing registration flags")
                    rx = struct.unpack_from(">h", archive[b"REGS", bank], number * 2)[0]
                    ry = struct.unpack_from(">h", archive[b"REGS", bank + 1], number * 2)[0]
                    sprite_ids.add(number)
                    parts.append({"sprite": number, "rawImage": raw_id,
                                  "sourceXY": [x, y], "registrationXY": [rx, ry],
                                  "x": parsed["origin"][0] + x - rx,
                                  "y": parsed["origin"][1] + y - ry})
                frames.append({"tick": tick, "parts": parts})
            elif event["op"] == "sound":
                number = bank + event["cue"]
                if (b"tWAV", number) not in archive:
                    raise ValueError(f"Missing drawing sound {number}")
                sounds.append({"tick": tick, "cue": event["cue"], "sound": number, "channel": event["channel"]})
            elif event["op"] == "wait" and not event.get("terminal"):
                if not frames:
                    raise ValueError("Drawing wait before first image group")
                tick += 1
        if interval is None or not frames:
            raise ValueError("Missing drawing timeline")
        scripts[str(resource)] = {"script": resource, "collection": bank,
                                  "originXY": list(parsed["origin"]),
                                  "headerBoundsLTRB": list(struct.unpack_from(">4h", raw, 16)),
                                  "tickMs": interval, "frames": frames, "sounds": sounds,
                                  "endCheckTick": tick + 1,
                                  "sourceSha256": hashlib.sha256(raw).hexdigest()}
    sprites = {}
    roles = {}
    for clip in scripts.values():
        for frame in clip["frames"]:
            for index, part in enumerate(frame["parts"]):
                roles.setdefault(part["sprite"], set()).add("ordinary-base" if index == 0 else "mode9-data")
    for number in sorted(sprite_ids):
        payload = sprite_payload(archive[b"tBMH", 18000], number)
        width, height, pixels = argb_pixels(payload)
        sprites[str(number)] = {"image": f"drawing-motion/{number}.png",
                                "argb": f"drawing-motion/{number}.argb",
                                "width": width, "height": height,
                                "roles": sorted(roles[number]),
                                "argbSha256": hashlib.sha256(pixels).hexdigest()}
    for clip in scripts.values():
        parts = [part for frame in clip["frames"] for part in frame["parts"]]
        left = min(part["x"] for part in parts)
        top = min(part["y"] for part in parts)
        right = max(part["x"] + sprites[str(part["sprite"])]["width"] for part in parts)
        bottom = max(part["y"] + sprites[str(part["sprite"])]["height"] for part in parts)
        clip["boundsXYWH"] = [left, top, right - left, bottom - top]
    return {"version": 1, "source": SOURCE, "table": 18400, "collection": 18000,
            "buttons": buttons, "scripts": scripts, "sprites": sprites,
            "sounds": {str(n): {"src": f"drawing-motion/{n}.wav"}
                       for n in sorted({sound["sound"] for clip in scripts.values() for sound in clip["sounds"]})},
            "rendering": {"basePart": 0, "colorPart": 1, "colorMode": 9,
                          "colorChannelsARGB": ["ignored", "shade", "tintWeight", "coverage"],
                          "replacementSprites": [], "registrationBeforeCallback": True,
                          "destinationAlpha": "preserve", "colorMultiplierFloat32": 0.003921568859368563},
            "stateCreationFlags": 0xC08000, "rolloverCreationFlags": 0x800031,
            "nativeRuntimeVerified": False,
            "verificationLimits": ["Original app has not run on this host",
                                   "Canvas ordinary base-image alpha compositing is not a proven native pixel oracle",
                                   "Native event ordering, audio latency and full studio stacking require runtime verification"],
            "evidence": {"ownerLoad": "i386 0x000f33ae–0x000f3445; vtable0x0031f4a0+0x48 -> 0x000f72f8",
                         "selectedRestore": "i386 0x000f2f80–0x000f2fd2",
                         "command": "i386 0x000f3578–0x000f35aa",
                         "callbackInstall": "i386 0x000f732e–0x000f7396; rows0–3",
                         "callback": "i386 0x000f73b4–0x000f7650",
                         "mode9": "i386 0x00149571–0x00149596 -> 0x00149a02–0x00149a2c -> 0x001ca702",
                         "blend": "i386 0x001ca7cd–0x001ca806; 0x001ca94d–0x001caa39; float@0x002603a0",
                         "registration": "i386 0x00158b4e–0x00158bcd",
                         "backingPauseSound": "i386 0x00072519–0x00072536 -> 0x00159280–0x00159293",
                         "backingResume": "i386 0x001591c2–0x00159274; no deadline mutation",
                         "auxiliaryClip": "i386 0x00030fb6–0x00030fb9; 0x00072c40–0x00072c43; 0x00072e0f–0x00072e46; 0x000724b4–0x000724ec",
                         "stateDispatch": "i386 0x00030ce0–0x00030e9b",
                         "sourceIdentity": "a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5"}}


def export_drawing_motion(archive, output, bitmap_decoder, sound_decoder):
    result = compile_drawing_motion(archive)
    output = Path(output)
    (output / "drawing-motion").mkdir(parents=True, exist_ok=True)
    for key, sprite in result["sprites"].items():
        payload = sprite_payload(archive[b"tBMH", 18000], int(key))
        width, height, pixels = argb_pixels(payload)
        (output / sprite["argb"]).write_bytes(pixels)
        extension, png, w, h = bitmap_decoder(payload)
        if extension != "png" or (w, h) != (width, height):
            raise ValueError("Drawing sprite did not decode losslessly")
        # This PNG is an ordinary visual only for basePart0. For colorPart1,
        # runtime MUST use the raw .argb channels, not PNG unpremultiplication.
        (output / sprite["image"]).write_bytes(png)
    for key, sound in result["sounds"].items():
        rate, channels, pcm = sound_decoder(archive[b"tWAV", int(key)])
        sound.update({"sampleRate": rate, "channels": channels, "sampleFrames": len(pcm) // (2 * channels),
                      "durationMs": len(pcm) / (2 * channels * rate) * 1000,
                      "sourceSha256": hashlib.sha256(archive[b"tWAV", int(key)]).hexdigest()})
        with wave.open(str(output / sound["src"]), "wb") as stream:
            stream.setnchannels(channels)
            stream.setsampwidth(2)
            stream.setframerate(rate)
            stream.writeframes(pcm)
    path = output / "drawing-motion/manifest.json"
    path.write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("volume", nargs="?", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path("public/original/ui"),
                        help="UI output root; writes only its drawing-motion/ subdirectory")
    args = parser.parse_args()
    ui = import_module("import-ui")
    original = import_module("import-original")
    archive = ui.mohawk(ui.app_resources(args.volume)(SOURCE))
    result = export_drawing_motion(archive, args.output, original.bitmap, original.decode_sound)
    print(f"Exported {len(result['scripts'])} programs, {len(result['sprites'])} sprites, {len(result['sounds'])} sounds; native runtime unverified.")
