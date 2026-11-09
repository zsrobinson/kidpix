"""Decode the trial's known original cursor encodings without resampling.

IC cursors contain a normal uncompressed tBMH bank after an eight-byte header.
Classic 68-byte QuickDraw Cursor records contain data/mask planes and a Point
hotspot (vertical, horizontal). Color QuickDraw crsr resources are deliberately
left unsupported here; they use a different format.
"""

import json
from pathlib import Path
import struct

from PIL import Image


# Labels below are visual identifications, not recovered engine enum bindings.
# The four drawing material variants remain unnamed until their dispatch is
# established. In particular, do not infer tool IDs from resource order.
VISUAL_IDENTIFICATIONS = {
    10006: "eyedropper", 10007: "paint bucket", 10008: "grab hand",
    10009: "open hand", 10010: "mega mixer", 10011: "mixer wand",
    10013: "scissors", 10014: "yellow hand", 10015: "paint brush", 10017: "spray can",
    10019: "text", 10020: "speaker", 10021: "microphone",
    10023: "help", 10025: "invisible cursor",
    10028: "arrow pointer", 10029: "crosshair", 10030: "pointing hand",
    10031: "pointing hand",
}


def _bank_image(bank, index, count):
    if len(bank) < 8 + 4 * count:
        raise ValueError("Truncated IC cursor bitmap table")
    offset, = struct.unpack_from(">I", bank, 8 + 4 * index)
    if offset < 8 + 4 * count or offset + 8 > len(bank):
        raise ValueError("Invalid IC cursor bitmap offset")
    width, height, stride, flags = struct.unpack_from(">4H", bank, offset)
    if flags != 0x2005:
        raise ValueError(f"Unsupported IC cursor bitmap flags {flags:#x}")
    if not width or not height or stride < width * 4:
        raise ValueError("Invalid IC cursor bitmap dimensions")
    pixels = bank[offset + 8:offset + 8 + stride * height]
    if len(pixels) != stride * height:
        raise ValueError("Truncated IC cursor bitmap pixels")
    premultiplied = Image.frombytes("RGBA", (width, height), pixels, "raw", "ARGB", stride)
    # The source is premultiplied ARGB; this reverses premultiplication just as
    # the main UI bitmap importer does, preserving its alpha edges.
    return Image.frombytes("RGBa", premultiplied.size, premultiplied.tobytes()).convert("RGBA")


def decode_cursor(data):
    if data.startswith(b"IC"):
        if len(data) < 16:
            raise ValueError("Truncated IC cursor header")
        hot_x, hot_y = struct.unpack_from(">HH", data, 2)
        bank = data[8:]
        count, flags = struct.unpack_from(">H4xH", bank)
        if flags != 2 or count < 1:
            raise ValueError("Unsupported IC cursor bitmap bank")
        images = [_bank_image(bank, index, count) for index in range(count)]
        if any(hot_x >= image.width or hot_y >= image.height for image in images):
            raise ValueError("Cursor hotspot outside bitmap")
        return {"encoding": "IC", "hotspot": [hot_x, hot_y], "images": images}
    if len(data) == 68:
        hot_y, hot_x = struct.unpack_from(">HH", data, 64)
        if hot_x >= 16 or hot_y >= 16:
            raise ValueError("Classic cursor hotspot outside bitmap")
        image = Image.new("RGBA", (16, 16))
        pixels = []
        for index in range(256):
            mask = 1 << (7 - index % 8)
            black = bool(data[index // 8] & mask)
            opaque = bool(data[32 + index // 8] & mask)
            if black and not opaque:
                raise ValueError("Classic cursor uses destination inversion, unavailable in PNG")
            pixels.append((0 if black else 255,) * 3 + (255 if opaque else 0,))
        image.putdata(pixels)
        return {"encoding": "QuickDraw Cursor", "hotspot": [hot_x, hot_y], "images": [image]}
    raise ValueError(f"Unsupported cursor encoding {data[:2].hex()} ({len(data)} bytes)")


def export_cursors(archive, output, *, source="Data/General.MHK"):
    """Export supported tCUR entries from an already parsed Mohawk archive.

    ``output`` is the UI output directory, matching import-ui.py. Returned
    metadata is suitable for the UI manifest; all unknown resources are listed
    explicitly under ``unsupported``.
    """
    output = Path(output)
    (output / "cursors").mkdir(parents=True, exist_ok=True)
    manifest = {"source": source, "preferredFrame": 0, "items": {}, "unsupported": []}
    for (tag, resource_id), data in sorted(archive.items()):
        if tag != b"tCUR":
            continue
        try:
            cursor = decode_cursor(data)
        except ValueError as error:
            manifest["unsupported"].append({"id": resource_id, "reason": str(error)})
            continue
        frames = []
        for index, image in enumerate(cursor["images"]):
            filename = f"cursors/{resource_id}-{index}.png"
            image.save(output / filename)
            frames.append({"image": filename, "width": image.width, "height": image.height,
                           "greenPixels": sum(pixel[:3] == (0, 255, 0) and pixel[3] > 0
                                              for pixel in image.getdata())})
        manifest["items"][str(resource_id)] = {
            "hotspot": cursor["hotspot"], "encoding": cursor["encoding"], "frames": frames,
            "visualIdentification": VISUAL_IDENTIFICATIONS.get(resource_id),
            "mappingEvidence": "Visual glyph identification only; engine dispatch not yet established",
        }
    manifest["notes"] = [
        "Frame zero is preferred until multi-frame color/key semantics are established.",
        "All frames preserve source pixels. Pure-green source pixels are counted, not removed.",
        "Resource IDs are not automatically assigned to web tools by this exporter.",
    ]
    (output / "cursors.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
