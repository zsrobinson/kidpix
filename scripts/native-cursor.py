"""Decode source cursor pixels; see docs/audits/cursor-behavior.md for evidence.

IC banks are components, not animation frames. Color QuickDraw records are
exportable only when pixels outside their mask are white (destination unchanged).
No PNG stands in for destination inversion or undefined colored XOR behavior.
"""

import json
from pathlib import Path
import struct

from PIL import Image


# Each binding follows a constructor-installed vtable, RTTI and activation call
# through slot +0x98 to 0x135ea8's tCUR lookup. These are native class names,
# not an assertion that an entire web tool has the same event/state behavior.
ENGINE_BINDINGS = {
    10000: [("RChalk", "0x0011c4d0", "0x003214e0", "0x0011c468")],
    10001: [("RCrayon", "0x0011d016", "0x00321740", "0x0011cfae")],
    10002: [("RMarker", "0x0012193e", "0x00323cd8", "0x001218d6")],
    10003: [("RCircle", "0x00115ba0", "0x00320478", "0x00115ad8")],
    10005: [("REraserTool", "0x00127f4e", "0x003253a0", "0x00127eec")],
    10007: [("RFill", "0x00127fb0", "0x00325480", "0x00128d3d")],
    10013: [("RCutFree", "0x00116cd1", "0x00320728", "0x00116ddb")],
    10015: [("RRealBrush", "0x001220e6", "0x00323e08", "0x0011d088")],
    10017: [("RSprayGun", "0x00134643", "0x00326e38", "0x00134cac")],
}


class UnsupportedCursor(ValueError):
    """Recognized resource whose display cannot be faithfully exported as PNG."""

    def __init__(self, reason, **details):
        super().__init__(reason)
        self.details = details


# Labels below remain visual identifications; ENGINE_BINDINGS records the
# independently established class mappings. Never infer tool IDs from order.
VISUAL_IDENTIFICATIONS = {
    10006: "eyedropper", 10007: "paint bucket", 10008: "grab hand",
    10009: "open hand", 10010: "mega mixer", 10011: "mixer wand",
    10013: "scissors", 10014: "yellow hand", 10015: "paint brush", 10017: "spray can",
    10019: "text", 10020: "speaker", 10021: "microphone",
    10023: "help", 10025: "invisible cursor",
    10028: "arrow pointer", 10029: "crosshair", 10030: "pointing hand",
    10031: "pointing hand",
}


def _bank_image(bank, index, count, *, unpremultiply=True):
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
    if not unpremultiply:
        return premultiplied
    return Image.frombytes("RGBa", premultiplied.size, premultiplied.tobytes()).convert("RGBA")


def _bit(plane, index):
    return bool(plane[index // 8] & (1 << (7 - index % 8)))


def _f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def colorize_cursor(cursor, rgb):
    """Reconstruct IC channel arithmetic; native CoreGraphics output is unverified.

    The native loop retains destination alpha and uses single-precision SSE,
    truncating each final channel to an integer. A green mask pixel has zero
    coverage; it is neither visible green nor a conventional color key.
    """
    if len(rgb) != 3 or any(type(c) is not int or not 0 <= c <= 255 for c in rgb):
        raise ValueError("Cursor color must contain three integer bytes")
    if "colorTransform" not in cursor:
        return cursor["images"][0].copy()
    base = cursor["premultipliedBase"]
    mask = cursor["images"][1]
    pixels = bytearray(base.tobytes())
    coefficients = mask.tobytes()
    inverse = _f32(1 / 255)
    color = [_f32(c * inverse) for c in rgb]
    for offset in range(0, len(pixels), 4):
        add, weight, coverage = coefficients[offset:offset + 3]
        if not coverage:
            continue
        alpha = _f32(coverage * inverse)
        for channel in range(3):
            destination = pixels[offset + channel]
            target = _f32(_f32(color[channel] * weight) + add)
            delta = _f32(target - destination)
            value = _f32(_f32(delta * alpha) + destination)
            pixels[offset + channel] = min(255, int(value))
    return Image.frombytes("RGBa", base.size, bytes(pixels)).convert("RGBA")


def _color_cursor(data):
    if len(data) < 146:
        raise ValueError("Truncated QuickDraw color cursor header/PixMap")
    map_offset, pixel_offset = struct.unpack_from(">II", data, 2)
    hot_y, hot_x = struct.unpack_from(">hh", data, 84)
    if not (0 <= hot_x < 16 and 0 <= hot_y < 16):
        raise ValueError("QuickDraw color cursor hotspot outside bitmap")
    # Native 0x1cd060 uses fixed +0x60/+0x92, not the serialized pointers.
    if (map_offset, pixel_offset) != (96, 146):
        raise ValueError("Unsupported QuickDraw color cursor layout")
    stride, top, left, bottom, right, version, packing = struct.unpack_from(">H4hHH", data, map_offset + 4)
    pixel_type, depth, components, component_size = struct.unpack_from(">4H", data, map_offset + 30)
    if ((top, left, bottom, right) != (0, 0, 16, 16)
            or stride != 0x8010 or version != 0 or packing != 0
            or (pixel_type, depth, components, component_size) != (0, 8, 1, 8)):
        raise ValueError("Unsupported QuickDraw color cursor PixMap (expected native 16x16 indexed-8)")
    table_offset, = struct.unpack_from(">I", data, map_offset + 42)
    if table_offset < pixel_offset + 256 or table_offset + 8 > len(data):
        raise ValueError("Invalid QuickDraw color cursor color table offset")
    table_flags, last_index = struct.unpack_from(">HH", data, table_offset + 4)
    if table_flags != 0 or last_index > 255:
        raise ValueError("Unsupported QuickDraw color cursor color table")
    if table_offset + 8 + 8 * (last_index + 1) > len(data):
        raise ValueError("Truncated QuickDraw color cursor color table")
    palette = {}
    for index in range(last_index + 1):
        value, red, green, blue = struct.unpack_from(">4H", data, table_offset + 8 + index * 8)
        if value > 255 or value in palette:
            raise ValueError("Invalid QuickDraw color cursor palette index")
        # Every source component repeats its byte (e.g. 0xcccc -> 0xcc).
        # Reject other values until native 16-to-8-bit quantization is verified.
        if any(channel % 257 for channel in (red, green, blue)):
            raise ValueError("Unsupported QuickDraw color cursor 16-bit color quantization")
        palette[value] = (red // 257, green // 257, blue // 257)
    pixels, operations = [], []
    for index, value in enumerate(data[pixel_offset:pixel_offset + 256]):
        if value not in palette:
            raise ValueError(f"Missing QuickDraw color cursor palette index {value}")
        rgb = palette[value]
        opaque = _bit(data[52:84], index)
        if not opaque and rgb != (255, 255, 255):
            operations.append({"x": index % 16, "y": index // 16, "rgb": list(rgb),
                               "operation": "invert" if rgb == (0, 0, 0) else "undefined-color-xor"})
        pixels.append(rgb + (255 if opaque else 0,))
    details = {"encoding": "QuickDraw color cursor", "hotspot": [hot_x, hot_y],
               "monochromeFallbackInversionPixels": sum(
                   _bit(data[20:52], i) and not _bit(data[52:84], i) for i in range(256))}
    if operations:
        raise UnsupportedCursor("QuickDraw color cursor uses destination-dependent pixels, unavailable in PNG",
                                **details, pixelOperations=operations)
    image = Image.new("RGBA", (16, 16))
    image.putdata(pixels)
    return {**details, "images": [image], "pngUsable": True}


def decode_cursor(data):
    if data.startswith(b"IC"):
        if len(data) < 16:
            raise ValueError("Truncated IC cursor header")
        hot_x, hot_y = struct.unpack_from(">HH", data, 2)
        bank = data[8:]
        count, flags = struct.unpack_from(">H4xH", bank)
        if flags != 2 or count not in (1, 2):
            raise ValueError("Unsupported IC cursor bitmap bank")
        images = [_bank_image(bank, index, count, unpremultiply=index == 0) for index in range(count)]
        if count == 2 and images[0].size != images[1].size:
            raise ValueError("Unsupported IC cursor component size mismatch")
        if any(hot_x >= image.width or hot_y >= image.height for image in images):
            raise ValueError("Cursor hotspot outside bitmap")
        result = {"encoding": "IC", "hotspot": [hot_x, hot_y], "images": images,
                  "pngUsable": count == 1}
        if count == 2:
            premultiplied = _bank_image(bank, 0, count, unpremultiply=False)
            result["premultipliedBase"] = Image.frombytes("RGBa", premultiplied.size, premultiplied.tobytes())
            result["colorTransform"] = {
                "kind": "native-channel-transform", "baseFrame": 0, "maskFrame": 1,
                "maskChannels": {"red": "add", "green": "colorWeight", "blue": "coverage", "alpha": "ignored"},
                "evidence": ["0x001cd4c7-0x001cd508", "0x001ca94d-0x001caa39"],
                "nativeRuntimeVerified": False,
            }
        return result
    if data.startswith(b"\x80\x01"):
        return _color_cursor(data)
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
        return {"encoding": "QuickDraw Cursor", "hotspot": [hot_x, hot_y], "images": [image], "pngUsable": True}
    raise ValueError(f"Unsupported cursor encoding {data[:2].hex()} ({len(data)} bytes)")


def export_cursors(archive, output, *, source="Data/General.MHK"):
    """Export supported tCUR entries from an already parsed Mohawk archive.

    ``output`` is the UI output directory, matching import-ui.py. Returned
    metadata is suitable for the UI manifest; all unknown resources are listed
    explicitly under ``unsupported``.
    """
    output = Path(output)
    (output / "cursors").mkdir(parents=True, exist_ok=True)
    manifest = {"source": source, "schemaVersion": 2, "preferredFrame": 0,
                "nativeRuntimeVerified": False, "items": {}, "unsupported": []}
    for (tag, resource_id), data in sorted(archive.items()):
        if tag != b"tCUR":
            continue
        try:
            cursor = decode_cursor(data)
        except ValueError as error:
            manifest["unsupported"].append({"id": resource_id, "reason": str(error),
                                            **getattr(error, "details", {})})
            continue
        frames = []
        for index, image in enumerate(cursor["images"]):
            filename = f"cursors/{resource_id}-{index}.png"
            image.save(output / filename)
            frames.append({"image": filename, "width": image.width, "height": image.height,
                           "role": "color-transform" if index else "base",
                           "greenPixels": sum(pixel[:3] == (0, 255, 0) and pixel[3] > 0
                                              for pixel in image.getdata())})
        bindings = [{"class": name, "constructorVtableStore": constructor, "vtable": vtable,
                     "cursorIdStore": call, "setter": "0x00135ea8", "vtableSlot": "0x98"}
                    for name, constructor, vtable, call in ENGINE_BINDINGS.get(resource_id, [])]
        manifest["items"][str(resource_id)] = {
            "hotspot": cursor["hotspot"], "encoding": cursor["encoding"], "frames": frames,
            "pngUsable": cursor["pngUsable"], "engineBindings": bindings,
            "animation": {"kind": "none-in-decoder", "nativeRuntimeVerified": False},
            "visualIdentification": VISUAL_IDENTIFICATIONS.get(resource_id),
            "mappingEvidence": ("Constructor-installed vtable, RTTI, activation routine and tCUR setter"
                                if bindings else "Visual glyph identification only; engine dispatch not yet established"),
            **{key: cursor[key] for key in ("colorTransform", "monochromeFallbackInversionPixels") if key in cursor},
        }
    manifest["notes"] = [
        "IC entries with two components require the color transform; frames are not an animation.",
        "pngUsable=false means frame zero alone is incomplete; use a fallback until composition is implemented.",
        "Color-transform RGB stores raw add/colorWeight/coverage coefficients, without unpremultiplication or green keying.",
        "QuickDraw color entries with destination-dependent pixels remain explicitly unsupported.",
        "Resource IDs are not automatically assigned to web tools by this exporter.",
    ]
    (output / "cursors.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
