"""Export MBTN script references and source-rendered finite button timelines.

The manifest keeps source state numbers. In particular, the auxiliary rollover
script in MBTN word 10 must not be mislabeled as a generic pressed/selected frame.
"""

import argparse
from importlib import import_module
import json
from pathlib import Path
import struct


EASEL_NAMES = [
    "stickers", "animations", "backgrounds", "media", "mixer", "grab", "eraser",
    "text", "stamp", "draw", "paint", "fill", "paper-texture", "help", "print",
    "play", "stop", "slideshow", "save", "firehose", "exit", "new", "export",
    "flipbook", "undo", "redo", "button-26",
]


def button_records(data, names=()):
    if len(data) % 32:
        raise ValueError("MBTN table length must be a multiple of 32")
    records = []
    for index in range(len(data) // 32):
        words = list(struct.unpack_from(">16H", data, index * 32))
        records.append({
            "index": index,
            "name": names[index] if index < len(names) else f"button-{index}",
            "stateScripts": words[:4],
            "hotspotKind": words[4],
            "hotspotResource": words[5],
            "command": words[6],
            "rolloverScript": words[10],
            "rolloverParameters": words[11:14],
            "rolloverLoops": words[11] != 0,
            "rolloverCancelsOnLeave": words[12] == 0,
            "group": words[14],
            "rawWords": words,
        })
    return records


def export_button_animations(archive, table_id, output, sprite, names=(), source=""):
    from PIL import Image

    decode = import_module("mohawk-script").decode_script
    output = Path(output)
    folder = output / "button-animations"
    folder.mkdir(parents=True, exist_ok=True)
    buttons = button_records(archive[b"MBTN", table_id], names)
    scripts = {}
    unsupported = {}
    ids = sorted({number for button in buttons for number in [*button["stateScripts"], button["rolloverScript"]] if number})
    for resource in ids:
        try:
            parsed = decode(archive[b"tSCR", resource])
            collection = parsed["collection"]
            origin_x, origin_y = parsed["origin"]
            interval = None
            groups = []
            sounds = []
            tick = 0
            current = None
            for event in parsed["events"]:
                if event["op"] == "interval":
                    if interval is not None and interval != event["ms"]:
                        raise ValueError("Changing intervals require a variable-duration timeline")
                    interval = event["ms"]
                elif event["op"] == "draw":
                    parts = []
                    for image_id, x, y in event["images"]:
                        number = image_id & 0x7FFF
                        if image_id & 0x8000:
                            x -= struct.unpack_from(">h", archive[b"REGS", collection], number * 2)[0]
                            y -= struct.unpack_from(">h", archive[b"REGS", collection + 1], number * 2)[0]
                        image = sprite(archive[b"tBMH", collection], number - 1)
                        parts.append((origin_x + x, origin_y + y, image))
                    current = {"parts": parts, "ticks": 0}
                    groups.append(current)
                elif event["op"] == "wait":
                    if current is None:
                        raise ValueError("Wait before image group")
                    if not event.get("terminal"):
                        current["ticks"] += 1
                        tick += 1
                elif event["op"] == "sound":
                    sound_id = collection + event["cue"]
                    if (b"tWAV", sound_id) not in archive:
                        raise ValueError(f"Missing sound resource {sound_id}")
                    sounds.append({"tick": tick, "sound": sound_id, "channel": event["channel"]})
            if interval is None or not groups:
                raise ValueError("Missing interval or image groups")
            left = min(x for group in groups for x, y, image in group["parts"])
            top = min(y for group in groups for x, y, image in group["parts"])
            right = max(x + image.width for group in groups for x, y, image in group["parts"])
            bottom = max(y + image.height for group in groups for x, y, image in group["parts"])
            rect = [left, top, right - left, bottom - top]
            frames = []
            for index, group in enumerate(groups):
                frame = Image.new("RGBA", tuple(rect[2:]))
                for x, y, part in group["parts"]:
                    frame.alpha_composite(part, (x - left, y - top))
                path = f"button-animations/{resource}-{index}.png"
                frame.save(output / path)
                frames.append({"image": path, "ticks": group["ticks"]})
            scripts[str(resource)] = {
                "script": resource, "rect": rect, "frames": frames, "sounds": sounds,
                "tickMs": interval, "durationTicks": tick,
                "endCheckTick": tick + 1,
                "endBehavior": "creation flags choose finite playback or restart; sound completion can delay end processing",
            }
        except (KeyError, ValueError, struct.error) as error:
            unsupported[str(resource)] = str(error)

    for button in buttons:
        resource = archive.get((b"MRGN", button["hotspotResource"]))
        if button["hotspotKind"] == 2 and resource and resource[:4] == b"RGN ":
            left, top, right, bottom = struct.unpack_from(">4h", resource, 4)
            button["hotspotBounds"] = [left, top, right - left, bottom - top]

    manifest = {
        "version": 1, "source": source, "table": table_id,
        "stateMeaning": {
            "0": "rest/reset",
            "1": "pointer inside while tracking or explicit event 0x2000/0x2005",
            "2": "down/latched inside (depends on populated state slots)",
            "3": "disabled/off branch (event 0x2007 or special toggle mode)",
        },
        "buttons": buttons, "scripts": scripts, "unsupportedScripts": unsupported,
        "limitations": [
            "Auxiliary rollover word 10 is a separate overlay routine, not state slot 2.",
            "The caller chooses events and can replace state-script slots at runtime.",
            "Rollover loop and cancellation fields describe native creation/cleanup branches; state-script creation flags are caller supplied.",
            "endCheckTick is the earliest completion/restart tick; active native sound channels can delay it.",
            "Programs with unsupported commands or trailing alternate segments are retained as unsupported, not guessed.",
        ],
    }
    (output / "button-animations.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("volume", nargs="?", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/research/button-animation-export"))
    args = parser.parse_args()
    importer = import_module("import-ui")
    read = importer.app_resources(args.volume)
    archive = importer.mohawk(read("Data/Easel.MHK"))
    result = export_button_animations(archive, 75, args.output, importer.sprite, EASEL_NAMES, "Data/Easel.MHK")
    print(f"Exported {len(result['buttons'])} buttons and {len(result['scripts'])} scripts; {len(result['unsupportedScripts'])} unsupported scripts.")
