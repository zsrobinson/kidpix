"""Export MBTN script references and source-rendered finite button timelines.

The manifest keeps source state numbers. In particular, the auxiliary rollover
script in MBTN word 10 must not be mislabeled as a generic pressed/selected frame.
"""

import argparse
import hashlib
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


def region_rectangles(data):
    """Decode one native RGN block, preserving its authored rectangle union.

    The native loader reads the rectangle count at byte 14 and entries at byte
    16. Byte 12 is retained without guessing a name for that source field.
    Other layouts are intentionally left to the caller's geometry fallback.
    """
    if len(data) < 16 or data[:4] != b"RGN ":
        raise ValueError("Unsupported or truncated MRGN header")
    left, top, right, bottom, word12, count = struct.unpack_from(">4h2H", data, 4)
    if not count or count > 4096 or len(data) != 16 + count * 8:
        raise ValueError("Unsupported or truncated MRGN rectangle list")
    if right <= left or bottom <= top:
        raise ValueError("Empty MRGN bounds")
    rects = [list(struct.unpack_from(">4h", data, 16 + index * 8)) for index in range(count)]
    for x0, y0, x1, y1 in rects:
        if x0 < left or y0 < top or x1 > right or y1 > bottom or x1 <= x0 or y1 <= y0:
            raise ValueError("MRGN rectangle falls outside its source bounds")
    return {"type": "rectangle-union", "status": "exact", "boundsXYWH": [left, top, right - left, bottom - top],
            "rectsLTRB": rects, "rawWord12": word12, "rectangleCount": count}


def initial_script_bounds(archive, resource, sprite):
    """Recover the initial animation rectangle used by kind-1 RButton loading.

    This reads the first image group, including registration and full bitmap
    dimensions. It deliberately does not inspect alpha, render later frames, or
    require that an alternate/trailing script segment be understood.
    """
    data = archive[b"tSCR", resource]
    if len(data) < 28:
        raise ValueError("Truncated tSCR header")
    collection, = struct.unpack_from(">H", data, 2)
    origin_x, origin_y = struct.unpack_from(">hh", data, 16)
    position = 26
    while position + 2 <= len(data):
        opcode, argument = data[position:position + 2]
        position += 2
        if opcode == 0x10:
            if not argument or argument > 48 or position + argument * 6 + 2 > len(data):
                raise ValueError("Truncated or unsupported initial tSCR image group")
            images = [struct.unpack_from(">Hhh", data, position + index * 6) for index in range(argument)]
            position += argument * 6
            if data[position:position + 2] not in (b"\x01\x02", b"\x00\x02"):
                raise ValueError("Initial image group has an unsupported continuation")
            break
        if (opcode, argument) == (0x04, 0x04):
            length = 2
        elif (opcode, argument) == (0x03, 0x06):
            length = 4
        else:
            raise ValueError(f"Unsupported command before initial tSCR image group: {opcode:02x}{argument:02x}")
        if position + length > len(data):
            raise ValueError("Truncated command before initial tSCR image group")
        position += length
    else:
        raise ValueError("Missing initial tSCR image group")

    bank = archive[b"tBMH", collection]
    count, = struct.unpack_from(">H", bank)
    registers_x = archive.get((b"REGS", collection))
    registers_y = archive.get((b"REGS", collection + 1))
    if (registers_x is None) != (registers_y is None):
        raise ValueError("Incomplete native image registration pair")
    parts = []
    for raw_image, raw_x, raw_y in images:
        # The native interpreter strips all four upper flag bits before it
        # resolves the one-based sub-bitmap number (0x0015a445–0x0015a456).
        number = raw_image & 0x0FFF
        if not number or number > count:
            raise ValueError("Unsupported initial tSCR sub-bitmap reference")
        registration_x = registration_y = 0
        if registers_x is not None:
            registration_x, = struct.unpack_from(">h", registers_x, number * 2)
            registration_y, = struct.unpack_from(">h", registers_y, number * 2)
        image = sprite(bank, number - 1)
        left = origin_x + raw_x - registration_x
        top = origin_y + raw_y - registration_y
        if image.width <= 0 or image.height <= 0:
            raise ValueError("Empty initial sub-bitmap bounds")
        parts.append({"rawImage": raw_image, "image": number, "sourceXY": [raw_x, raw_y],
                      "registrationXY": [registration_x, registration_y],
                      "rectLTRB": [left, top, left + image.width, top + image.height]})
    bounds = [min(part["rectLTRB"][0] for part in parts), min(part["rectLTRB"][1] for part in parts),
              max(part["rectLTRB"][2] for part in parts), max(part["rectLTRB"][3] for part in parts)]
    return {"script": resource, "collection": collection, "originXY": [origin_x, origin_y],
            "boundsLTRB": bounds, "parts": parts}


def image_button_region(button, archive, sprite):
    """RButton kind 1 creates a rectangular control, never an alpha silhouette."""
    inputs = []
    for role, resource in [("rest", button["stateScripts"][0]), ("state1", button["stateScripts"][1]),
                           ("rollover", button["rolloverScript"])]:
        if resource:
            entry = initial_script_bounds(archive, resource, sprite)
            inputs.append({"role": role, **entry})
    if not inputs or inputs[0]["role"] != "rest":
        raise ValueError("Missing rest script for image-derived button")
    if button["rolloverScript"]:
        # 0x000313b6–0x000313cb replaces the preceding rest/state1 union.
        bounds = inputs[-1]["boundsLTRB"]
        selection = "rollover-initial-group"
    else:
        bounds = [min(entry["boundsLTRB"][0] for entry in inputs), min(entry["boundsLTRB"][1] for entry in inputs),
                  max(entry["boundsLTRB"][2] for entry in inputs), max(entry["boundsLTRB"][3] for entry in inputs)]
        selection = "rest-state1-initial-group-union"
    left, top, right, bottom = bounds
    return {"type": "rectangle-union", "status": "exact", "sourceKind": 1,
            "resourceType": "tSCR", "resource": button["rolloverScript"] or button["stateScripts"][0],
            "boundsXYWH": [left, top, right - left, bottom - top], "rectsLTRB": [bounds],
            "rectangleCount": 1, "construction": "initial-script-bounds", "boundsSelection": selection,
            "initialScriptBounds": inputs}


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
            parsed = decode(archive[b"tSCR", resource], resource=(source, resource))
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
            clipped = resource == 1128 and "trailing" in parsed
            for index, group in enumerate(groups):
                frame = Image.new("RGBA", tuple(rect[2:]))
                for x, y, part in group["parts"]:
                    frame.alpha_composite(part, (x - left, y - top))
                path = f"button-animations/{resource}-{index}.png"
                if clipped:
                    # Reuse existing source-identical media; no new 1128 PNGs.
                    path = f"flipbook-{index}.png"
                else:
                    frame.save(output / path)
                frames.append({"image": path, "ticks": group["ticks"]})
            scripts[str(resource)] = {
                "script": resource, "rect": rect, "frames": frames, "sounds": sounds,
                "tickMs": interval, "durationTicks": tick,
                "endCheckTick": tick + 1,
                "endBehavior": "creation flags choose finite playback or restart; sound completion can delay end processing",
            }
            if clipped:
                scripts[str(resource)].update({
                    "resourceSha256": hashlib.sha256(archive[b"tSCR", resource]).hexdigest(),
                    "consumedBytes": parsed["consumedBytes"], "trailing": parsed["trailing"],
                    "clipRect": [933, 592, 79, 95],
                    "restore": {"image": "paint-empty.png", "size": [1024, 768]},
                })
        except (KeyError, ValueError, struct.error) as error:
            unsupported[str(resource)] = str(error)

    for button in buttons:
        kind = button["hotspotKind"]
        if kind == 2:
            resource = archive.get((b"MRGN", button["hotspotResource"]))
            try:
                if resource is None:
                    raise ValueError("Missing MRGN resource")
                region = region_rectangles(resource)
                region.update({"source": source, "resourceType": "MRGN", "resource": button["hotspotResource"],
                               "coordinateSpace": "native-master"})
                button["hotspotRegion"] = region
                button["hotspotBounds"] = region["boundsXYWH"]
            except ValueError as error:
                button["hotspotRegion"] = {"status": "unsupported", "sourceKind": kind,
                                           "resourceType": "MRGN", "resource": button["hotspotResource"], "reason": str(error)}
        elif kind == 1:
            try:
                region = image_button_region(button, archive, sprite)
                region.update({"source": source, "coordinateSpace": "native-master"})
                button["hotspotRegion"] = region
                button["hotspotBounds"] = region["boundsXYWH"]
            except (KeyError, ValueError, struct.error) as error:
                button["hotspotRegion"] = {"status": "unsupported", "sourceKind": kind,
                                           "reason": str(error)}
        else:
            button["hotspotRegion"] = {
                "status": "unresolved", "sourceKind": kind,
                "reason": "Native hotspot construction kind is not implemented",
            }

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
            "Explicit single-block MRGN regions preserve all source rectangles; kind-1 controls use the native initial-script rectangle rather than alpha silhouettes.",
            "Recovered button geometry does not establish a browser action mapping for every native record.",
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
