"""Extract Paint Zone artwork and effects from a mounted Kid Pix Deluxe 3D disc.

Run on macOS with PyObjC and Pillow. The installer payload is read directly.
"""

import argparse
from collections import defaultdict
from functools import lru_cache
from importlib import import_module
import json
from pathlib import Path
import re
import struct
import wave
import zlib

from Foundation import NSData, NSUnarchiver
from PIL import Image


def app_resources(volume, *, include_paths=False, include_app_paths=False):
    """Read the file list and the independently compressed payload segments."""
    installer = volume / "Kid Pix Installer.app/Contents/Resources"
    index = zlib.decompress((installer / "Archive.zplist").read_bytes())
    archive = NSUnarchiver.unarchiveObjectWithData_(
        NSData.dataWithBytes_length_(index, len(index))
    )
    tasks = archive["YAAllTasksRepresentationsKey"]
    app = next(task for task in tasks if task["kInstallSubpathKey"] == "Kid Pix Deluxe 3D.app")
    key = app["PluginClassProperties"]["YAPluginClassUniquieKey"]
    files = archive["YAAllObjectsPropertiesKey"][key]["FilesList"]
    by_path = {str(file["EntryPath"]): file for file in files}

    @lru_cache
    def read(path):
        file = by_path[path if path.startswith("Contents/") else f"Contents/Resources/{path}"]
        fork = next(fork for fork in file["Forks"] if not str(fork["ForkName"]))
        chunks = []
        with (installer / "Archive.zp").open("rb") as payload:
            for segment in fork["Segments"]:
                payload.seek(int(segment["OffsLO"]))
                packed = payload.read(int(segment["Length"]))
                chunks.append(zlib.decompress(packed) if packed[-9] else packed[:-9])
        data = b"".join(chunks)
        if len(data) != file["Attributes"]["NSFileSize"]:
            raise ValueError(f"Incorrect uncompressed size for {path}")
        return data

    if include_paths:
        if include_app_paths:
            return read, list(by_path)
        prefix = "Contents/Resources/"
        return read, [path.removeprefix(prefix) for path in by_path if path.startswith(prefix)]
    return read


def mohawk(data):
    if data[:4] != b"MHWK" or data[8:12] != b"RSRC":
        raise ValueError("Expected a Mohawk resource archive")

    directory, file_table_offset = struct.unpack_from(">IH", data, 20)
    table = directory + file_table_offset
    count, = struct.unpack_from(">I", data, table)
    files = []
    for index in range(count):
        offset, low, middle, high, _ = struct.unpack_from(">IHBBH", data, table + 4 + index * 10)
        size = low | middle << 16 | (high & 7) << 24
        files.append((offset, size))

    types, = struct.unpack_from(">H", data, directory + 2)
    result = {}
    for index in range(types):
        tag, entries, _ = struct.unpack_from(">4sHH", data, directory + 4 + index * 8)
        entries += directory
        count, = struct.unpack_from(">H", data, entries)
        for entry in range(count):
            resource, index = struct.unpack_from(">HH", data, entries + 2 + entry * 4)
            offset, size = files[index - 1]
            result[tag, resource] = data[offset:offset + size]
    return result


def bitmap(data):
    width, height, stride, flags = struct.unpack_from(">4H", data)
    if flags == 0x2305:
        pixels = zlib.decompress(data[16:])
    elif flags == 0x2005:
        pixels = data[8:]
    else:
        raise ValueError(f"Unsupported direct-color bitmap flags {flags:#x}")
    image = Image.frombytes("RGBA", (width, height), pixels, "raw", "ARGB", stride)
    return Image.frombytes("RGBa", image.size, image.tobytes()).convert("RGBA")


def sprite(collection, index):
    count, flags = struct.unpack_from(">H4xH", collection)
    if index >= count:
        raise ValueError(f"Missing sub-bitmap {index}")
    if flags == 0x302:
        collection = zlib.decompress(collection[16:])
        offset, = struct.unpack_from(">I", collection, index * 4)
        offset -= 8
    elif flags == 2:
        offset, = struct.unpack_from(">I", collection, 8 + index * 4)
    else:
        raise ValueError(f"Unsupported collection storage {flags:#x}")
    return bitmap(collection[offset:])


def render_script(frame, archive, resource, color_key=False):
    """Draw the first image group in a tray animation script."""
    script = archive[b"tSCR", resource]
    collection, = struct.unpack_from(">H", script, 2)
    left, top = struct.unpack_from(">hh", script, 16)
    registers_x = archive[b"REGS", collection]
    registers_y = archive[b"REGS", collection + 1]
    start = next(
        offset for offset in range(30, len(script), 2) if script[offset] == 0x10
    )
    bounds = []
    for index in range(script[start + 1]):
        image_id, x, y = struct.unpack_from(">Hhh", script, start + 2 + index * 6)
        image_index = image_id & 0x7FFF
        if image_id & 0x8000:
            x -= struct.unpack_from(">h", registers_x, image_index * 2)[0]
            y -= struct.unpack_from(">h", registers_y, image_index * 2)[0]
        image = sprite(archive[b"tBMH", collection], image_index - 1)
        if color_key and index == 1:
            image.putdata([
                (red, green, blue, 0 if (red, green, blue) == (0, 255, 0) else alpha)
                for red, green, blue, alpha in image.getdata()
            ])
        rect = [x + left, y + top, image.width, image.height]
        frame.alpha_composite(image, tuple(rect[:2]))
        bounds.append(rect)
    return bounds


def color_picker_grid(swatches):
    chips = defaultdict(list)
    for index, (red, green, blue, alpha) in enumerate(swatches.getdata()):
        if alpha == 255:
            chips[red, green, blue].append((index % swatches.width, index // swatches.width))
    result = []
    for rgb, pixels in chips.items():
        if len(pixels) < 30:
            continue
        x, y = (round(sum(axis) / len(pixels), 2) for axis in zip(*pixels))
        result.append({"x": x + 76, "y": y + 80, "color": "#%02x%02x%02x" % rgb})
    return sorted(result, key=lambda chip: (round(chip["y"] / 4), chip["x"]))


def pcm_sound(data, output):
    sample_rate, channels, samples = import_module("import-original").decode_sound(data)
    with wave.open(str(output), "wb") as stream:
        stream.setnchannels(channels)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(samples)


# Coordinates use the native 1024×768 master resolution. Variant order is
# normal, hover, pressed, selected/disabled when supplied by the source.
PAINT_BUTTONS = {
    "backgrounds": (27, 15, 2, 1, 0, 4),
    "stickers": (36, 85, 7, 6, 5, 9),
    "animations": (38, 148, 12, 11, 10, 14),
    "media": (14, 222, 17, 16, 15, 19),
    "draw": (20, 365, 22, 21, 23, 20),
    "paint": (76, 365, 27, 26, 28, 25),
    "fill": (19, 427, 32, 31, 33, 30),
    "mixer": (75, 427, 37, 36, 38, 35),
    "stamp": (20, 489, 42, 41, 43, 40),
    "text": (76, 489, 47, 46, 48, 45),
    "grab": (20, 551, 52, 51, 53, 50),
    "eraser": (76, 551, 57, 56, 58, 55),
    "new": (899, 207, 62, 247, 248),
    "print": (954, 207, 65, 249, 250),
    "help": (968, 289, 84, 85, 86),
    "slideshow": (930, 695, 89, 90, 91),
    "export": (954, 148, 107, 245, 246),
    "exit": (926, 468, 94, 95, 96),
    "play": (915, 21, 101, 102, 103, 100),
    "save": (899, 149, 111, 206, 244),
    "undo-face": (58, 310, 113),
    "firehose": (906, 331, 169, 170, 171),
    "flipbook": (933, 582, 108, 210, 112),
    "paper-texture": (883, 533, 216),
    "undo": (28, 322, 251, 252, 253, 254),
    "redo": (105, 322, 255, 256, 257, 258),
    "swatch": (44, 681, 203),
}

DRAW_OPTIONS = {
    "tray-draw": (133, 637, 429),
    "tray-size": (408, 642, 483),
    "size-small": (441, 653, 474, 476, 475),
    "size-medium": (437, 670, 477, 479, 478),
    "size-large": (432, 696, 480, 482, 481),
    "freehand": (495, 655, 510, 512, 511),
    "line": (554, 654, 513, 515, 514),
    "curve": (554, 689, 516, 518, 517),
    "rectangle": (631, 655, 519, 521, 520),
    "rectangle-fill": (631, 690, 522, 524, 523),
    "oval": (711, 655, 525, 527, 526),
    "oval-fill": (711, 690, 528, 530, 529),
    "polygon": (794, 655, 531, 533, 532),
    "polygon-fill": (794, 690, 534, 536, 535),
    "tray-up": (874, 645, 606, 731, 732),
    "tray-down": (874, 703, 607, 734, 735),
}

DRAW_TOOLS = {
    "pencil": (132, 635, 150, 140),
    "chalk": (183, 621, 157, 172),
    "crayon": (246, 649, 178, 193),
    "marker": (306, 640, 198, 211),
}

SLIDE_BUTTONS = {
    "slide-up": (679, 321, 3, 4, 5, 6),
    "slide-down": (679, 363, 7, 8, 9, 10),
    "slide-dog": (860, 204, 17, 19, 23),
    "slide-boy": (869, 406, 33),
    "slide-girl": (775, 406, 127),
    "slide-paint": (920, 621, 42, 41, 43),
    "slide-help": (954, 327, 45, 46, 47),
    "slide-prev": (183, 661, 50, 51, 52, 56),
    "slide-next": (757, 661, 53, 54, 55, 57),
    "slide-new": (80, 615, 58, 59, 60),
    "slide-play": (846, 120, 67, 68, 70, 71),
    "slide-transition-on": (313, 609, 72, 73, 74),
    "slide-print": (766, 260, 75, 76, 77),
    "slide-save": (709, 134, 78, 79, 80),
    "slide-export": (722, 201, 81, 82, 83),
    "slide-sound": (289, 153, 84, 85, 86),
    "slide-sound-off": (472, 153, 87, 88, 89),
    "slide-trash": (800, 610, 91, 93, 96),
    "slide-transition-switch": (363, 619, 111, 109, 107),
    "slide-transition-off": (438, 609, 114, 113, 112),
    "slide-undo": (14, 272, 242, 243, 244, 245),
    "slide-redo": (91, 272, 246, 247, 248, 249),
}

# Each tray references the draw calls in Tp.MHK, followed by the option set's
# bitmap archive, resource interval and native option frame positions.
TRAYS = {
    "paint": ([18045, 18072, 18076, 18079, 18149, 18144, 18168, 18170], "Icons", range(3500, 3520), 560, 5),
    "wacky": ([18045, 18072, 18076, 18079, 18149, 18144, 18167, 18171], "Icons", range(3520, 3547), 560, 5),
    "sound": ([18045, 18073, 18075, 18079, 18149, 18144, 18174, 18176], "Icons", range(3547, 3557), 560, 5),
    "hands-free": ([18045, 18073, 18075, 18079, 18149, 18144, 18173, 18177], "Icons", range(3557, 3567), 560, 5),
    "spray": ([18045, 18073, 18076, 18078, 18180, 18182], "Cyclic", range(24000, 25500, 100), 560, 5),
    "moving-spray": ([18045, 18073, 18076, 18078, 18179, 18183], "Anims", range(24000, 26000, 100), 560, 5),
    "bucket": ([18046, 18081, 18085, 18088], "Tp", range(21500, 21542), 434, 7),
    "gradient": ([18046, 18082, 18084, 18088], "Tp", range(21300, 21363), 434, 7),
    "pattern": ([18046, 18082, 18085, 18087], "Tp", range(21400, 21449), 434, 7),
    "mixer": ([18047, 18090, 18094, 18149, 18144], "Icons", range(3900, 3924), 497, 6),
    "mixer-wand": ([18047, 18091, 18093, 18149, 18144], "Icons", range(3800, 3812), 497, 6),
    "eraser": ([18051, 18135, 18137, 18149, 18166, 18160, 18163], "Icons", range(3701, 3717), 560, 5),
    "text": ([18049, 18096, 18097, 18104, 18107, 18098, 18101, 18110, 18113,
              18116, 18120, 18122, 18125, 18191, 18185, 18188, 18238,
              18241, 18242, 18245], None, (), 0, 0),
    "grab": ([18357, 18128, 18132, 18191, 18185, 18188, 18358, 18373,
              18361, 18367, 18370, 18364], None, (), 0, 0),
    "scissors": ([18050, 18129, 18131, 18191, 18185, 18188], "CutRgns", range(13000, 13014), 497, 6),
}


def export_trays(read, tp, easel, output):
    folder = output / "trays"
    icons = folder / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    sources = {name: mohawk(read(f"Data/Tools/{name}.MHK")) for name in
               ("Icons", "Anims", "Cyclic", "CutRgns")}
    sources["Tp"] = tp
    details = {"rect": [113, 608, 817, 168], "trays": {}}
    tray_rect = (113, 608, 930, 776)
    frames = {index: sprite(tp[b"tBMH", 18000], index) for index in (738, 739, 740)}
    for index, image in frames.items():
        image.save(icons / f"option-frame-{index}.png")

    def preview(data):
        width, height, stride, format_flags = struct.unpack_from(">4H", data)
        if format_flags != 2:
            return bitmap(data)
        alpha = Image.frombytes("L", (width, height), data[8:], "raw", "L", stride)
        image = Image.new("RGBA", (width, height), "#0084f4")
        image.putalpha(alpha)
        return image

    for name, (scripts, archive, resource_ids, start, columns) in TRAYS.items():
        frame = Image.new("RGBA", (1024, 768))
        for script in scripts:
            render_script(frame, tp, script, color_key=18072 <= script <= 18083)
        render_script(frame, tp, 18034)
        base_filename = f"{name}-base.png"
        frame.crop(tray_rect).save(folder / base_filename)
        pages = []
        option_positions = []
        option_ids = list(resource_ids)
        for row, first in enumerate(range(0, len(option_ids), columns or 1)):
            shown = frame.copy()
            if row:
                render_script(shown, tp, 18028)
            if first + columns < len(option_ids):
                render_script(shown, tp, 18031)
            for offset, number in enumerate(f"{row + 1:02}"):
                digit = sprite(easel[b"tBMH", 1000], 74 + int(number))
                shown.alpha_composite(digit, (875 + offset * 17, 676))

            options = []
            for column, resource_id in enumerate(option_ids[first:first + columns]):
                x, y = start + column * 63, 660
                image = preview(sources[archive][b"tBMP", resource_id])
                filename = f"icons/{archive.lower()}-{resource_id}.png"
                image.save(folder / filename)
                shown.alpha_composite(frames[738], (x, y))
                shown.alpha_composite(image, (x + (56 - image.width) // 2, y + (56 - image.height) // 2))
                options.append({"id": resource_id, "image": filename})
                if row == 0:
                    option_positions.append([x, y, 56, 56])
            page_file = f"{name}.png" if row == 0 else f"{name}-{row + 1}.png"
            shown.crop(tray_rect).save(folder / page_file)
            pages.append({"image": page_file, "options": options})
        if not pages:
            frame.crop(tray_rect).save(folder / f"{name}.png")
            pages.append({"image": f"{name}.png", "options": []})
        details["trays"][name] = {"base": base_filename, "pages": pages, "options": option_positions,
                                 "dynamicOptionFrames": True, "sizeEnabled": 18149 in scripts}
    (output / "trays.json").write_text(json.dumps(details, indent=2) + "\n")


LIBRARY_TRAYS = {
    "backgrounds": (18326, 497, 6, {"backgrounds": 18298, "projects": 18302, "maps": 18305},
                    {"delete": 18323, "remove": 18327, "import": 18330}),
    "background-projects": (18326, 497, 6, {"backgrounds": 18299, "projects": 18301, "maps": 18305},
                            {"delete": 18323, "remove": 18327, "import": 18330}),
    "background-maps": (18326, 497, 6, {"backgrounds": 18299, "projects": 18302, "maps": 18304},
                        {"delete": 18323, "remove": 18327, "import": 18330}),
    "stickers": (18041, 434, 7, {"stickers": 18317, "flags": 18321}, {}),
    "sticker-flags": (18041, 434, 7, {"stickers": 18318, "flags": 18320}, {}),
    "toons": (18041, 434, 7, {"3d": 18333, "2d": 18337}, {}),
    "toons-2d": (18041, 434, 7, {"3d": 18334, "2d": 18336}, {}),
    "sounds": (18042, 560, 5, {"sounds": 18335, "movies": 18339},
               {"delete": 18341, "remove": 18258, "import": 18286, "record": 18248}),
    "movies": (18356, 560, 5, {"sounds": 18338, "movies": 18340},
               {"delete": 18341, "size": 18344, "import": 18347, "record": 18350, "frame": 18353}),
    "stamps": (18048, 560, 5, {}, {"edit-stamp": 18236}),
}


def export_library_trays(tp, easel, output):
    folder = output / "libraries"
    folder.mkdir(exist_ok=True)
    collection = tp[b"tBMH", 18000]
    paint_sprites = easel[b"tBMH", 1000]
    rect = (113, 608, 930, 776)
    manifest = {"rect": [113, 608, 817, 168], "trays": {}}

    for digit in range(10):
        sprite(paint_sprites, 74 + digit).save(folder / f"digit-{digit}.png")
    for name, (base, start, columns, tabs, controls) in LIBRARY_TRAYS.items():
        frame = Image.new("RGBA", (1024, 768))
        render_script(frame, tp, base)
        render_script(frame, tp, 18034)
        render_script(frame, tp, 18028)
        render_script(frame, tp, 18031)
        tab_rects = {tab: render_script(frame, tp, script)[0] for tab, script in tabs.items()}
        controls_rects = {control: render_script(frame, tp, script)[0] for control, script in controls.items()}

        if name == "stamps":
            category = [146, 665, 183, 59]
            render_script(frame, tp, 18053)
            render_script(frame, tp, 18149)
            render_script(frame, tp, 18144)
        else:
            category = [155, 690, 165, 63]
            render_script(frame, tp, 18289)
            render_script(frame, tp, 18037)
        selector_x = category[0] + category[2]
        selector_y = category[1]
        category_up = sprite(collection, 450)
        category_down = sprite(collection, 453)
        frame.alpha_composite(category_up, (selector_x, selector_y))
        frame.alpha_composite(category_down, (selector_x, selector_y + category_up.height))

        filename = f"{name}.png"
        frame.crop(rect).save(folder / filename)
        manifest["trays"][name] = {
            "image": filename, "tabs": tab_rects, "controls": controls_rects,
            "category": category,
            "previousCategory": [selector_x, selector_y, category_up.width, category_up.height],
            "nextCategory": [selector_x, selector_y + category_up.height, category_down.width, category_down.height],
            "previousPage": [874, 645, 43, 30], "nextPage": [874, 703, 46, 35],
            "pageDigits": [[875, 676], [892, 676]],
            "selectedName": [565, 725, 214, 43] if name != "stamps" else None,
            "slots": [[start + 63 * column, 660, 56, 56] for column in range(columns)],
        }
    (output / "library-trays.json").write_text(json.dumps(manifest, indent=2) + "\n")


def export_paper(easel, output):
    collection = easel[b"tBMH", 1000]
    pages = []
    for page in range(3):
        image = sprite(collection, 241 + page)
        filename = f"paper-page-{page + 1}.png"
        image.save(output / filename)
        options = []
        for column in range(7):
            resource_id = 12300 + page * 7 + column
            options.append({"id": resource_id, "rect": [403 + round(column * 65.2), 546, 64, 64]})
        pages.append({"image": filename, "rect": [394, 540, image.width, image.height], "options": options})
    return pages


def export_ideas(read, paths, output):
    output.mkdir(parents=True, exist_ok=True)
    ideas = []
    for path in sorted(paths):
        if not path.startswith("Idea Machine/") or not path.endswith(".kpt"):
            continue
        name = " ".join(Path(path).stem.split())
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        package = mohawk(read(path))
        record = {"id": slug, "name": name}
        for key, filename, resource in (
            ("image", f"{slug}.jpg", (b"tBMP", 1)),
            ("thumbnail", f"{slug}-thumb.jpg", (b"tTHM", 1)),
        ):
            data = package[resource]
            if data[8:12] != b"jpeg" or data[24:27] != b"\xff\xd8\xff":
                raise ValueError(f"Unexpected JPEG bitmap in {path}")
            (output / filename).write_bytes(data[24:])
            record[key] = filename
        sound = output / f"{slug}.wav"
        pcm_sound(package[b"tWAV", 1], sound)
        if sound.exists():
            record["sound"] = sound.name
        ideas.append(record)
    (output / "index.json").write_text(json.dumps(ideas, indent=2) + "\n")


def export_undo_animations(easel, output):
    decode = import_module("mohawk-script").decode_script
    folder = output / "undo"
    folder.mkdir(exist_ok=True)
    clips = []
    # These are the 20 sound-bearing face routines, followed by the idle/blink
    # routines. Decode each draw group, not the numeric order of the sprite bank.
    for resource in [1094, *range(1095, 1115)]:
        script = decode(easel[b"tSCR", resource])
        collection = script["collection"]
        origin_x, origin_y = script["origin"]
        groups = []
        sounds = []
        ticks = 0
        current = None
        interval_ms = None
        for event in script["events"]:
            if event["op"] == "interval":
                if interval_ms is not None:
                    raise ValueError(f"Changing intervals not supported in undo script {resource}")
                interval_ms = event["ms"]
            elif event["op"] == "draw":
                parts = []
                for image_id, x, y in event["images"]:
                    index = image_id & 0x7FFF
                    if image_id & 0x8000:
                        x -= struct.unpack_from(">h", easel[b"REGS", collection], index * 2)[0]
                        y -= struct.unpack_from(">h", easel[b"REGS", collection + 1], index * 2)[0]
                    image = sprite(easel[b"tBMH", collection], index - 1)
                    parts.append((origin_x + x, origin_y + y, image))
                current = {"parts": parts, "ticks": 0}
                groups.append(current)
            elif event["op"] == "wait":
                if current is None:
                    raise ValueError(f"Wait before drawing in undo script {resource}")
                if not event.get("terminal"):
                    current["ticks"] += 1
                    ticks += 1
            elif event["op"] == "sound":
                sound_id = collection + event["cue"]
                if (b"tWAV", sound_id) not in easel:
                    raise ValueError(f"Missing sound cue in undo script {resource}")
                sounds.append({"tick": ticks, "sound": sound_id, "channel": event["channel"]})
        rect = [min(x for group in groups for x, y, image in group["parts"]),
                min(y for group in groups for x, y, image in group["parts"]), 0, 0]
        right = max(x + image.width for group in groups for x, y, image in group["parts"])
        bottom = max(y + image.height for group in groups for x, y, image in group["parts"])
        rect[2:] = [right - rect[0], bottom - rect[1]]
        frames = []
        for index, group in enumerate(groups):
            image = Image.new("RGBA", tuple(rect[2:]))
            for x, y, part in group["parts"]:
                image.alpha_composite(part, (x - rect[0], y - rect[1]))
            filename = f"undo/{resource}-{index}.png"
            image.save(output / filename)
            frames.append({"image": filename, "ticks": group["ticks"]})
        if interval_ms is None:
            raise ValueError(f"Missing interval in undo script {resource}")
        clips.append({"script": resource, "rect": rect, "frames": frames, "sounds": sounds, "tickMs": interval_ms})
    return {"idle": clips[0], "clips": clips[1:],
            "timingStatus": "Intervals, frame order, positions, waits and sound cues decoded from tSCR; millisecond scheduler verified against the i386 executable. Live runtime comparison remains pending."}


def export_ui(volume, output):
    read, paths = app_resources(volume, include_paths=True)
    easel = mohawk(read("Data/Easel.MHK"))
    tp = mohawk(read("Data/Tools/Tp.MHK"))
    sky = mohawk(read("Data/StarySky.MHK"))
    slide = mohawk(read("Data/Picker.MHK"))
    palette = mohawk(read("Data/BigPicker.MHK"))
    little_palette = mohawk(read("Data/LittlePicker.MHK"))
    login = mohawk(read("Data/RDlgLogin.MHK"))

    output.mkdir(parents=True, exist_ok=True)
    star_field = bitmap(sky[b"tBMP", 6000])
    star_field.save(output / "star-field.webp", lossless=True, method=4)
    frame = bitmap(easel[b"tBMP", 1000])
    frame.save(output / "paint-frame.png")
    slide_frame = bitmap(slide[b"tBMP", 5000])
    slide_frame.save(output / "slideshow-frame.png")

    # Match the master-resolution framing of the original moving star field.
    stars = star_field.crop((768, 336, 1792, 1104))
    backdrop = stars.copy()
    backdrop.alpha_composite(frame)
    backdrop.save(output / "paint-empty.png")
    composite = backdrop.copy()
    # The paper canister is a three-piece animated control. Its idle holder
    # must be behind the roller and the narrow handle in front.
    composite.alpha_composite(sprite(easel[b"tBMH", 1000], 67), (883, 524))

    manifest = {
        "size": [1024, 768],
        "canvas": [164, 67, 720, 542],
        "buttons": {},
        "drawingOptions": {},
        "drawingTools": {},
        "slideShow": {},
    }

    def export_set(section, rows, collection, initial):
        for name, (x, y, *indices) in rows.items():
            images = []
            for index, asset_id in enumerate(indices):
                image = sprite(collection, asset_id)
                filename = f"{name}-{index}.png"
                image.save(output / filename)
                images.append(filename)
                if index == initial.get(name, 0):
                    composite.alpha_composite(image, (x, y))
            manifest[section][name] = {
                "x": x, "y": y, "w": image.width, "h": image.height, "images": images
            }

    export_set("buttons", PAINT_BUTTONS, easel[b"tBMH", 1000], {"draw": 3, "undo": 3, "redo": 3})
    composite.alpha_composite(sprite(easel[b"tBMH", 1000], 70), (886, 539))
    composite.save(output / "paint-chrome.png")
    export_set("drawingOptions", DRAW_OPTIONS, tp[b"tBMH", 18000], {"size-medium": 2, "freehand": 2})
    export_set("drawingTools", DRAW_TOOLS, tp[b"tBMH", 18000], {})
    composite.save(output / "paint-zone.png")

    composite = stars.copy()
    composite.alpha_composite(slide_frame)
    slide_art = slide[b"tBMH", 5000]
    export_set(
        "slideShow", SLIDE_BUTTONS, slide_art,
        {"slide-up": 3, "slide-down": 3, "slide-prev": 3, "slide-next": 3,
         "slide-undo": 3, "slide-redo": 3},
    )
    composite.alpha_composite(sprite(easel[b"tBMH", 1000], 113), (44, 260))
    composite.save(output / "slideshow.png")
    for name, index in (
        ("slide-slot", 0), ("slide-slot-selected", 2), ("slide-slot-hover", 1),
        ("slide-deck", 38), ("slide-deck-selected", 37), ("slide-load", 135),
        ("slide-deck-label", 118), ("slide-deck-label-selected", 119),
    ):
        sprite(slide_art, index).save(output / f"{name}.png")

    sprite(palette[b"tBMH", 1500], 4).save(output / "color-picker.png")
    swatches = sprite(palette[b"tBMH", 1500], 11)
    swatches.save(output / "color-picker-swatches.png")
    manifest["colorPicker"] = {
        "x": 38, "y": 426, "w": 307, "h": 307, "chips": color_picker_grid(swatches),
    }
    manifest["paperTextures"] = export_paper(easel, output)
    manifest["paperAnimations"] = import_module("native-paper").export_paper(easel, output, import_module("import-original").bitmap)
    manifest["undoAnimations"] = export_undo_animations(easel, output)
    manifest["cursors"] = import_module("native-cursor").export_cursors(mohawk(read("Data/General.MHK")), output)
    manifest["stampEditor"] = import_module("native-stamp-editor").export_stamp_editor(read, output)
    buttons = import_module("button-animation")
    manifest["buttonAnimations"] = buttons.export_button_animations(easel, 75, output, sprite, buttons.EASEL_NAMES, "Data/Easel.MHK")
    sprite(palette[b"tBMH", 1500], 7).save(output / "eyedropper.png")
    sprite(little_palette[b"tBMH", 1500], 0).save(output / "small-palette.png")
    sprite(login[b"tBMH", 7600], 51).save(output / "login.png")
    sprite(login[b"tBMH", 7600], 19).save(output / "login-go.png")
    sprite(login[b"tBMH", 7600], 39).save(output / "login-quit.png")
    for index in range(113, 166):
        sprite(easel[b"tBMH", 1000], index).save(output / f"undo-face-frame-{index - 113:02}.png")
    for (tag, resource), data in easel.items():
        if tag == b"tWAV":
            pcm_sound(data, output / f"easel-{resource}.wav")

    export_trays(read, tp, easel, output)
    export_library_trays(tp, easel, output)
    export_ideas(read, paths, output.parent / "ideas")
    (output / "ui.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("volume", nargs="?", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/original/ui")
    args = parser.parse_args()
    export_ui(args.volume, args.output)
