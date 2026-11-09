#!/usr/bin/env python3
"""Convert the Kid Pix Deluxe 3D disc libraries into web assets."""

import argparse
from array import array
from collections import Counter
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
import json
import importlib
from pathlib import Path
import plistlib
import re
import struct
import subprocess
import sys
import tempfile
import unicodedata
import zlib

from swf_art import convert as convert_swf

CATEGORIES = {
    "Backgrounds": "tBMP",
    "Stamps": "tBMP",
    "Stickers": "tSWF",
    "Sounds": "tWAV",
    "Movies": "tMOV",
    "Toons": ("t3DA", "tSWF"),
    "Frames": "t3DA",
}


def unpack(format_string, data, offset=0):
    return struct.unpack_from(">" + format_string, data, offset)


class Library:
    """Read Mohawk resources by their type and original numeric ID."""

    def __init__(self, file):
        self.file = file
        header = file.read(28)
        if header[:4] != b"MHWK" or header[8:12] != b"RSRC":
            raise ValueError("Invalid Mohawk library")
        directory_offset, file_table_offset, file_table_size = unpack("IHH", header, 20)
        file.seek(directory_offset)
        table = file.read(file_table_offset + file_table_size)
        self.directory = {}
        _, type_count = unpack("HH", table)
        entry_count, = unpack("I", table, file_table_offset)
        entries = []
        for index in range(entry_count):
            offset, size_low, size_high, flags, _ = unpack(
                "IHBBH", table, file_table_offset + 4 + index * 10
            )
            size = size_low | size_high << 16 | (flags & 7) << 24
            entries.append((offset, size))
        for index in range(type_count):
            resource_type, index_offset, _ = unpack("4sHH", table, 4 + index * 8)
            count, = unpack("H", table, index_offset)
            resources = {}
            for i in range(count):
                resource_id, file_id = unpack("HH", table, index_offset + 2 + i * 4)
                resources[resource_id] = entries[file_id - 1]
            self.directory[resource_type.decode("ascii")] = resources

    def read(self, resource_type, resource_id, length=None):
        entry = self.directory.get(resource_type, {}).get(resource_id)
        if entry is None:
            return b""
        offset, size = entry
        self.file.seek(offset)
        return self.file.read(size if length is None else min(length, size))

    def items(self, default_type):
        """Yield resource references in the order used by the native library tray."""
        order = self.read("rLHR", 1)
        if not order:
            for resource_id in self.directory.get(default_type, {}):
                yield default_type, resource_id, resource_id, resource_id
            return
        resource_type, _, count, flags, label_id = unpack("4sHHHH", order)
        resource_type = resource_type.decode("ascii")
        if resource_type != default_type and resource_type not in default_type:
            raise ValueError(f"Unexpected library item type {resource_type}")
        if len(order) < 12 + count * 6:
            raise ValueError("Invalid library item list")
        for index in range(count):
            resource_id, thumbnail_id, name_id = unpack("HHH", order, 12 + index * 6)
            yield resource_type, resource_id, thumbnail_id, name_id


def slug(value):
    ascii_name = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def png_bytes(width, height, rgba):
    def chunk(name, data):
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))

    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)
        start = y * width * 4
        scanlines.extend(rgba[start:start + width * 4])
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanlines))
        + chunk(b"IEND", b"")
    )


UNPREMULTIPLY = tuple(
    bytes(min(255, (value * 255 + alpha // 2) // alpha) if alpha else 0 for value in range(256))
    for alpha in range(256)
)


def bitmap(data, *, stamp=False):
    """Decode direct RGB555 pixels, or unwrap an original JPEG/PNG payload."""
    width, height, row_bytes, flags = unpack("HHHH", data)
    if data[8:12] in (b"jpeg", b"png\0"):
        byte_count, = unpack("I", data, 20)
        extension = "jpg" if data[8:12] == b"jpeg" else "png"
        return extension, data[24:24 + byte_count], width, height

    if row_bytes == width * 2 and flags == 3 and len(data) >= 8 + row_bytes * height:
        rgba = bytearray()
        for pixel, in struct.iter_unpack(">H", data[8:8 + row_bytes * height]):
            red = pixel >> 10 & 31
            green = pixel >> 5 & 31
            blue = pixel & 31
            alpha = 0 if stamp and pixel == 0x7FFF else 255
            rgba.extend(((red << 3) | red >> 2, (green << 3) | green >> 2, (blue << 3) | blue >> 2, alpha))
        return "png", png_bytes(width, height, rgba), width, height

    if flags & 0x0300 == 0x0300:
        expected, compressed_size = unpack("II", data, 8)
        uncompressed = zlib.decompress(data[16:16 + compressed_size])
        if len(uncompressed) != expected:
            raise ValueError("Compressed bitmap size mismatch")
        header = struct.pack(">HHHH", width, height, row_bytes, flags & ~0x0300)
        return bitmap(header + uncompressed, stamp=stamp)

    if flags == 2 and row_bytes >= width and len(data) >= 8 + row_bytes * height:
        rgba = bytearray()
        for y in range(height):
            row = data[8 + y * row_bytes:8 + y * row_bytes + width]
            for gray in row:
                rgba.extend((gray, gray, gray, 255))
        return "png", png_bytes(width, height, rgba), width, height

    if row_bytes >= width * 4 and flags & 0x7FFF == 0x2005 and len(data) >= 8 + row_bytes * height:
        rgba = bytearray()
        for y in range(height):
            row = data[8 + y * row_bytes:8 + y * row_bytes + width * 4]
            for alpha, red, green, blue in struct.iter_unpack(">BBBB", row):
                straight = UNPREMULTIPLY[alpha]
                rgba.extend((straight[red], straight[green], straight[blue], alpha))
        return "png", png_bytes(width, height, rgba), width, height

    raise ValueError(f"Unsupported bitmap encoding {data[6:12].hex()}")


def save_asset(destination, stem, extension, data):
    path = destination / f"{stem}.{extension}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def save_image(destination, stem, data, *, stamp=False):
    extension, pixels, width, height = bitmap(data, stamp=stamp)
    return save_asset(destination, stem, extension, pixels), width, height


def bitmap_pair(data):
    """Return the primary bitmap and its optional stereoscopic partner."""
    width, height, stride, flags = unpack("HHHH", data)
    end = 8 + height * stride
    if data[8:12] in (b"jpeg", b"png\0"):
        end = 24 + unpack("I", data, 20)[0]
    right = b""
    if flags & 0x8000 and data[end:end + 4] == b"tBMP":
        length, = unpack("I", data, end + 4)
        right = data[end + 8:end + 8 + length]
    return data[:end], right


def export_scene_layers(destination, resource_id, data, instructions, catalog_root):
    first_layer, = unpack("I", data, 8)
    count = (first_layer - 8) // 4
    offsets = (first_layer, *unpack(f"{count - 1}I", data, 12))
    if instructions[30] != 0x10 or instructions[31] != count:
        raise ValueError("Unknown 3D scene layer list")
    layers = []
    for index, offset in enumerate(offsets):
        opcode, x, y = unpack("Hhh", instructions, 32 + index * 6)
        if opcode != 0x8001:
            raise ValueError("Unknown 3D scene layer instruction")
        left, right = bitmap_pair(data[offset:])
        source, width, height = save_image(destination, f"{resource_id}-layer-{index}", left)
        layer = {
            "src": source.relative_to(catalog_root).as_posix(),
            "x": x, "y": y, "width": width, "height": height,
        }
        if right:
            source, _, _ = save_image(destination, f"{resource_id}-layer-{index}-right", right)
            layer["rightSrc"] = source.relative_to(catalog_root).as_posix()
        layers.append(layer)
    return layers


def run_ffmpeg(arguments, *, data=None):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *arguments],
        input=data,
        capture_output=True,
    )
    if result.returncode:
        raise ValueError(result.stderr.decode(errors="replace").strip())


IMA_STEPS = (
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
    34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
    143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449,
    494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
    1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660,
    4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493,
    10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385,
    24623, 27086, 29794, 32767,
)
IMA_INDEX = (-1, -1, -1, -1, 2, 4, 6, 8)


def ima_delta(step, code):
    # The disc's saved decoder checkpoints match separate integer shifts.
    delta = step >> 3
    if code & 4:
        delta += step
    if code & 2:
        delta += step >> 1
    if code & 1:
        delta += step >> 2
    return -delta if code & 8 else delta


IMA_TRANSITIONS = tuple(
    tuple((ima_delta(step, code), max(0, min(88, index + IMA_INDEX[code & 7]))) for code in range(16))
    for index, step in enumerate(IMA_STEPS)
)


def decode_sound(data):
    if data[:4] != b"MHWK" or data[8:12] != b"WAVE":
        raise ValueError("Invalid Mohawk sound header")
    offset = 12
    while offset + 8 < len(data):
        kind, size = unpack("4sI", data, offset)
        offset += 8
        if kind == b"Data":
            break
        offset += size
    else:
        raise ValueError("Missing audio sample data")

    rate, samples, bits, channels, codec = unpack("HIBBH", data, offset)
    sample_data = data[offset + 20:offset + size]
    if codec == 0 and bits == 8:
        audio = array("h", ((sample - 128) << 8 for sample in sample_data[:samples * channels]))
        if sys.byteorder != "little":
            audio.byteswap()
        return rate, channels, audio.tobytes()
    if codec == 0 and bits == 16:
        audio = array("h")
        audio.frombytes(sample_data[:samples * channels * 2])
        # Some installer resources store raw samples in little endian.
        other = array("h", audio)
        other.byteswap()

        def jump_size(samples):
            return sum(abs(current - previous) for current, previous in zip(samples[channels:2048], samples[:2048 - channels]))

        if jump_size(other) < jump_size(audio):
            audio = other
        if sys.byteorder != "little":
            audio.byteswap()
        return rate, channels, audio.tobytes()
    if codec != 1 or bits != 16 or channels not in (1, 2):
        raise ValueError(f"Unsupported sound encoding {codec}, {bits} bits, {channels} channels")
    audio = array("h")
    left = right = left_step = right_step = 0
    for byte in sample_data:
        delta, left_step = IMA_TRANSITIONS[left_step][byte >> 4]
        left = max(-32768, min(32767, left + delta))
        audio.append(left)
        if channels == 1:
            delta, left_step = IMA_TRANSITIONS[left_step][byte & 15]
            left = max(-32768, min(32767, left + delta))
            audio.append(left)
        else:
            delta, right_step = IMA_TRANSITIONS[right_step][byte & 15]
            right = max(-32768, min(32767, right + delta))
            audio.append(right)

    if sys.byteorder != "little":
        audio.byteswap()
    return rate, channels, audio[:samples * channels].tobytes()


def export_sound(destination, resource_id, data, *, lossless=False):
    extension = "flac" if lossless else "mp3"
    path = destination / f"{resource_id}.{extension}"
    if not path.is_file():
        rate, channels, pcm = decode_sound(data)
        path.parent.mkdir(parents=True, exist_ok=True)
        options = ["-c:a", "flac"] if lossless else ["-q:a", "2"]
        temporary = path.with_name(f"{path.stem}.tmp.{extension}")
        run_ffmpeg(
            ["-f", "s16le", "-ar", str(rate), "-ac", str(channels), "-i", "pipe:0", *options, str(temporary)],
            data=pcm,
        )
        temporary.replace(path)
    return path


def export_movie(destination, resource_id, data):
    path = destination / f"{resource_id}.mp4"
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="kidpix-movie-") as work:
            movie = Path(work) / "source.mov"
            movie.write_bytes(data)
            temporary = path.with_name(f"{path.stem}.tmp.mp4")
            run_ffmpeg([
                "-i", str(movie), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "copy",
                "-c:a", "aac", "-movflags", "+faststart", str(temporary),
            ])
            temporary.replace(path)
    return path


def sequence_frames(data):
    """Read the paired bitmaps and native playback rate for each 3D frame."""
    frame_count, frame_rate = unpack("IH", data, 12)
    offsets = unpack(f"{frame_count}I", data, 28)
    frames = []
    for offset in offsets:
        # The offset table excludes a 28-byte metadata extension.
        start = offset + 28
        if data[start + 8:start + 12] not in (b"png\0", b"jpeg"):
            raise ValueError(f"Invalid animation frame offset {offset}")
        frames.append(bitmap_pair(memoryview(data)[start:]))
    return frames, frame_rate


def export_motion(destination, stem, frames, rate, eye):
    animation = destination / f"{stem}-animation.webp"
    if not animation.is_file():
        temporary = animation.with_name(f"{animation.stem}.tmp.webp")
        with tempfile.TemporaryDirectory(prefix="kidpix-animation-") as work:
            work = Path(work)
            inputs = []
            for index, frame in enumerate(frames):
                path, _, _ = save_image(work, index, frame[eye])
                duration = round((index + 1) * 1000 / rate) - round(index * 1000 / rate)
                inputs.extend(["-d", str(duration), str(path)])
            result = subprocess.run(
                ["img2webp", "-loop", "0", "-lossless", "-m", "1", *inputs, "-o", str(temporary)],
                capture_output=True,
            )
            if result.returncode:
                raise ValueError(result.stderr.decode(errors="replace").strip())
        temporary.replace(animation)
    return animation


def export_sequence(destination, resource_id, data, *, animated):
    frames, rate = sequence_frames(data)
    left, right = frames[0]
    still, width, height = save_image(destination, resource_id, left)
    info = {"width": width, "height": height, "duration": len(frames) / rate}
    if right:
        right_source, _, _ = save_image(destination, f"{resource_id}-right", right)
        info["rightSrc"] = right_source
    if animated and len(frames) > 1:
        info["animation"] = export_motion(destination, resource_id, frames, rate, 0)
        if right:
            info["rightAnimation"] = export_motion(destination, f"{resource_id}-right", frames, rate, 1)

    first, = unpack("I", data, 28)
    metadata = data[first:first + 28]
    opening_offset = metadata.find(b"INFR")
    if opening_offset >= 0 and metadata[opening_offset + 4:opening_offset + 8] == b"\x00\x00\x00\x08":
        x, y, opening_width, opening_height = unpack("hhhh", metadata, opening_offset + 8)
        info["opening"] = {"x": x, "y": y, "width": opening_width, "height": opening_height}
    return still, info


def export_library(path, category, destination, catalog_root, missing, *, animated):
    items = []
    with path.open("rb") as file:
        library = Library(file)
        for resource_type, resource_id, thumb_id, name_id in library.items(CATEGORIES[category]):
            label = library.read("tATX", name_id).decode("mac_roman").strip("\0")
            fallback = f"Stamp {resource_id - 7999}" if category == "Stamps" else f"{path.stem} {resource_id}"
            name = label or fallback
            media_type = {"tMOV": "video", "tWAV": "audio"}.get(resource_type, "image")
            item = {"id": f"{slug(category)}-{slug(path.stem)}-{resource_id}", "name": name, "mediaType": media_type}

            thumbnail = library.read("tTHM", thumb_id)
            if thumbnail:
                try:
                    thumb_path, _, _ = save_image(destination, f"{resource_id}-thumb", thumbnail)
                    item["thumbnail"] = thumb_path.relative_to(catalog_root).as_posix()
                except ValueError as error:
                    missing[(category, str(error))] += 1

            if resource_type == "tBMP":
                original = library.read(resource_type, resource_id)
                try:
                    source, width, height = save_image(
                        destination, resource_id, original, stamp=category == "Stamps"
                    )
                    item["src"] = source.relative_to(catalog_root).as_posix()
                    item["width"] = width
                    item["height"] = height
                    item.setdefault("thumbnail", item["src"])
                    if original[6] & 0x80:
                        _, right = bitmap_pair(original)
                        if right:
                            right_path, _, _ = save_image(destination, f"{resource_id}-right", right)
                            item["rightSrc"] = right_path.relative_to(catalog_root).as_posix()
                        layers = library.read("tBMH", resource_id)
                        instructions = library.read("tSCR", resource_id)
                        if layers and instructions:
                            item["layers"] = export_scene_layers(
                                destination, resource_id, layers, instructions, catalog_root
                            )
                except (ValueError, struct.error) as error:
                    missing[(category, str(error))] += 1
            else:
                try:
                    if resource_type == "tWAV":
                        source = export_sound(
                            destination, resource_id, library.read(resource_type, resource_id), lossless=True
                        )
                    elif resource_type == "tMOV":
                        source = export_movie(destination, resource_id, library.read(resource_type, resource_id))
                    elif resource_type == "t3DA":
                        source, info = export_sequence(
                            destination, resource_id, library.read(resource_type, resource_id), animated=animated
                        )
                        for key in ("animation", "rightAnimation", "rightSrc"):
                            if key in info:
                                info[key] = info[key].relative_to(catalog_root).as_posix()
                        item.update(info)
                    elif resource_type == "tSWF":
                        still, animation, width, height = convert_swf(library.read(resource_type, resource_id))
                        source = save_asset(destination, resource_id, "svg", still)
                        item.update(width=width, height=height)
                        if animation:
                            animation_path = save_asset(destination, f"{resource_id}-animation", "svg", animation)
                            item["animation"] = animation_path.relative_to(catalog_root).as_posix()
                    else:
                        missing[(category, resource_type)] += 1
                        source = None
                    if source is not None:
                        item["src"] = source.relative_to(catalog_root).as_posix()
                except (ValueError, struct.error, FileNotFoundError, IndexError, zlib.error) as error:
                    missing[(category, str(error))] += 1

            if "src" in item or "thumbnail" in item:
                items.append(item)
    return {"name": path.stem, "items": items}


TOOL_IMAGES = {
    "Brushes": "brushes",
    "TextureMaps": "paper",
    "Anims": "moving-spray",
    "Cyclic": "spray",
    "CutRgns": "cutouts",
}
TOOL_SOUNDS = {"WackyBrushSounds": "wacky-sounds", "FeltPenSnds": "felt-pen-sounds"}


def export_fills(data, output):
    ranges = {
        "patterns": (20400, 20500),
        "mono-patterns": (20500, 20600),
        "gradient-previews": (21300, 21400),
        "pattern-previews": (21400, 21500),
        "mono-previews": (21500, 21600),
    }
    with BytesIO(data) as file:
        library = Library(file)
        for resource_id in library.directory["tBMP"]:
            for folder, (start, stop) in ranges.items():
                if start <= resource_id < stop:
                    save_image(output / folder, resource_id, library.read("tBMP", resource_id))
                    break

        definitions = library.read("grad", 21300)
        gradients = []
        offset = 0
        while offset < len(definitions):
            mode, count = unpack("HH", definitions, offset)
            offset += 4
            stops = [unpack("HBBBB", definitions, offset + index * 6) for index in range(count)]
            offset += count * 6
            gradients.append({"id": 21300 + len(gradients), "mode": mode, "stops": stops})
        save_asset(output, "gradients", "json", json.dumps(gradients, separators=(",", ":")).encode())
        print(f"Tp: {len(gradients)} gradients and original fill patterns", flush=True)


def export_cutout_regions(library, destination):
    regions = {}
    for resource_id in library.directory["MRGN"]:
        data = library.read("MRGN", resource_id)
        if data[:4] != b"rgnR":
            continue
        x, y, right, bottom, count, _ = unpack("HHHHHH", data, 4)
        rectangles = []
        for index in range(count):
            x0, y0, x1, y1 = unpack("HHHH", data, 16 + index * 8)
            rectangles.append([x0 - x, y0 - y, x1 - x, y1 - y])
        regions[resource_id] = {"width": right - x, "height": bottom - y, "rects": rectangles}
    save_asset(destination, "regions", "json", json.dumps(regions, separators=(",", ":")).encode())


def export_spray_frames(library, output, resource_id):
    data = library.read("tBMH", resource_id)
    count, flags, size, compressed_size = unpack("HHII", data, 4)
    if flags != 0x0302:
        raise ValueError(f"Unknown spray frame encoding {flags:#x}")
    bitmaps = zlib.decompress(data[16:16 + compressed_size])
    if len(bitmaps) != size:
        raise ValueError("Compressed spray frame size mismatch")
    paths = []
    for index, offset in enumerate(unpack(f"{count}I", bitmaps)):
        try:
            frame, _, _ = save_image(output, f"{resource_id}-{index}", bitmaps[offset - 8:])
        except (ValueError, struct.error, zlib.error):
            continue
        paths.append(frame.name)
        if len(paths) == 8:
            break
    return paths


def export_tools(read, output, missing):
    spray = {}
    for archive, folder in {**TOOL_IMAGES, **TOOL_SOUNDS}.items():
        try:
            data = read(f"Data/Tools/{archive}.MHK")
        except (FileNotFoundError, KeyError):
            missing[("Tools", f"missing {archive}.MHK")] += 1
            continue
        destination = output / "tools" / folder
        kind = "tBMP" if archive in TOOL_IMAGES else "tWAV"
        with BytesIO(data) as file:
            library = Library(file)
            if folder == "cutouts":
                export_cutout_regions(library, destination)
            count = 0
            for resource_id in library.directory[kind]:
                data = library.read(kind, resource_id)
                try:
                    if kind == "tBMP":
                        save_image(destination, resource_id, data)
                        if folder in ("spray", "moving-spray"):
                            frames = export_spray_frames(library, destination, resource_id)
                            spray.setdefault(folder, {})[str(resource_id)] = [
                                f"tools/{folder}/{frame}" for frame in frames
                            ]
                    else:
                        export_sound(destination, resource_id, data)
                    count += 1
                except (ValueError, struct.error, FileNotFoundError) as error:
                    missing[("Tools", str(error))] += 1
            print(f"{archive}: {count} tool assets", flush=True)
    save_asset(output / "tools", "spray-frames", "json", json.dumps(spray, separators=(",", ":")).encode())
    export_fills(read("Data/Tools/Tp.MHK"), output / "tools")


def apply_native_categories(groups, read):
    catalogs = {
        "backgrounds": "BG",
        "stickers": "Stickers",
        "toons": "Toons",
        "frames": "Frames",
    }
    for category, filename in catalogs.items():
        configuration = plistlib.loads(read(f"English.lproj/{filename}Categories.plist"))
        if category == "frames":
            by_name = {item["name"]: item for group in groups[category] for item in group["items"]}
            sections = []
            for label, frame_entries in configuration.items():
                items = []
                for entry in frame_entries:
                    original = by_name.pop(entry["FrameName"], None)
                    if original:
                        items.append({**original, "name": entry["localizedName"]})
                if items:
                    sections.append({"name": label, "items": items})
            if by_name:
                sections.append({"name": "Frames", "items": list(by_name.values())})
            groups[category] = sections
            continue

        categories = {group["name"]: group for group in groups[category]}
        for section, entries in configuration.items():
            for entry in entries:
                group = categories.get(entry["name"])
                if group:
                    group.update(section=section, localizedName=entry["localizedName"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--volume", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "public/original")
    parser.add_argument("--app", type=Path, help="Extracted original app bundle containing additional paint tool resources")
    parser.add_argument("--paint-tools", action="store_true", help="Import paint tools directly from the mounted installer (requires PyObjC and Pillow)")
    parser.add_argument("--tools-only", action="store_true", help="Import only the app bundle's paint tool resources")
    parser.add_argument("--animate-3d", action="store_true", help="Encode 3D image sequences as lossless animated WebP (requires img2webp)")
    args = parser.parse_args()
    libraries = args.volume / "Libraries"
    missing = Counter()
    if args.tools_only and not (args.app or args.paint_tools):
        parser.error("--tools-only requires --app or --paint-tools")
    read_resources = None
    if args.app:
        resources = args.app / "Contents/Resources"

        def read_resources(path):
            return (resources / path).read_bytes()

    elif args.paint_tools:
        try:
            read_resources = importlib.import_module("import-ui").app_resources(args.volume)
        except ImportError as error:
            parser.exit(2, f"Direct paint tool import requires PyObjC and Pillow: {error}\n")
    if read_resources is not None:
        export_tools(read_resources, args.output, missing)
    if args.tools_only:
        for (category, reason), count in missing.most_common():
            print(f"{category}: {count} unavailable files ({reason})")
        return
    if not libraries.is_dir():
        parser.exit(2, f"Library directory not found at {libraries}. Mount the original DMG or pass --volume.\n")
    groups = {}
    for category in CATEGORIES:
        key = category.lower()
        groups[key] = []
        paths = sorted((libraries / category).glob("*.klb"), key=lambda path: path.stem.casefold())

        def convert(path):
            failures = Counter()
            group = export_library(
                path, category, args.output / key / slug(path.stem), args.output, failures,
                animated=args.animate_3d,
            )
            return group, failures

        with ThreadPoolExecutor(max_workers=4) as executor:
            for group, failures in executor.map(convert, paths):
                if group["items"]:
                    groups[key].append(group)
                missing.update(failures)
        total = sum(len(group["items"]) for group in groups[key])
        print(f"{category}: {total} items in {len(groups[key])} libraries", flush=True)

    if read_resources is not None:
        apply_native_categories(groups, read_resources)
    catalog = {"version": 1, "groups": groups}
    args.output.mkdir(parents=True, exist_ok=True)
    temp_catalog = args.output / "catalog.json.tmp"
    temp_catalog.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp_catalog.replace(args.output / "catalog.json")
    for (category, reason), count in missing.most_common():
        print(f"{category}: {count} unavailable source or preview files ({reason})")


if __name__ == "__main__":
    main()
