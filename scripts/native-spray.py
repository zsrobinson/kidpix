"""Recover complete authored spray banks and moving-paint script timelines.

The exporter takes the same bitmap/sound decoder callbacks as import-original.py
and never limits a bank to a sample of its first frames. It preserves native
registration, authored image groups, wait durations, and source sound cues.
Emitter selection/relocation is intentionally outside this resource decoder.
"""

from importlib import import_module
from io import BytesIO
import json
from pathlib import Path
import struct
import wave
import zlib


def pack_atlases(frames, maximum=2048):
    """Pack unscaled sprites into deterministic horizontal shelves."""
    if not isinstance(maximum, int) or not 1 <= maximum <= 2048:
        raise ValueError("Atlas maximum must be an integer between 1 and 2048")
    pages = []
    for frame in sorted(frames, key=lambda item: (-item["height"], -item["width"], item["index"])):
        width, height = frame["width"], frame["height"]
        if width > maximum or height > maximum:
            raise ValueError(f"Native spray frame {frame['index']} exceeds atlas dimensions; resizing is not allowed")
        candidates = [(shelf["height"] - height, maximum - shelf["x"] - width, page_index, shelf_index)
                      for page_index, page in enumerate(pages) for shelf_index, shelf in enumerate(page["shelves"])
                      if height <= shelf["height"] and shelf["x"] + width <= maximum]
        if candidates:
            _, _, page_index, shelf_index = min(candidates)
            page = pages[page_index]
            shelf = page["shelves"][shelf_index]
        else:
            page = next((item for item in pages if item["usedHeight"] + height <= maximum), None)
            if page is None:
                page = {"shelves": [], "placements": [], "usedHeight": 0}
                pages.append(page)
            shelf = {"x": 0, "y": page["usedHeight"], "height": height}
            page["shelves"].append(shelf)
            page["usedHeight"] += height
        page["placements"].append({"index": frame["index"], "x": shelf["x"], "y": shelf["y"],
                                   "width": width, "height": height})
        shelf["x"] += width
    return [{"width": max(p["x"] + p["width"] for p in page["placements"]),
             "height": max(p["y"] + p["height"] for p in page["placements"]),
             "placements": page["placements"]} for page in pages]


def _words(data, offset, count):
    if offset < 0 or offset + count * 2 > len(data):
        raise ValueError("Truncated spray registration table")
    return struct.unpack_from(f">{count}h", data, offset)


class _Bank:
    def __init__(self, resource_id, data, archive, prefix):
        if len(data) < 16:
            raise ValueError(f"Truncated spray bank {resource_id}")
        declared, _, storage_stride, flags, expected, packed_size = struct.unpack_from(">4HII", data)
        if flags != 0x0302:
            raise ValueError(f"Unsupported spray bank {resource_id} flags {flags:#x}")
        if not declared or declared > storage_stride:
            raise ValueError(f"Invalid spray bank {resource_id} frame count")
        if packed_size != len(data) - 16:
            raise ValueError(f"Spray bank {resource_id} compressed size mismatch")
        self.pixels = zlib.decompress(data[16:])
        if len(self.pixels) != expected:
            raise ValueError(f"Spray bank {resource_id} uncompressed size mismatch")
        if declared * 4 > len(self.pixels):
            raise ValueError(f"Truncated spray bank {resource_id} offset table")
        offsets = struct.unpack_from(f">{declared}I", self.pixels)
        self.offsets = []
        self.metadata = {"id": resource_id, "frameCount": declared, "storageStride": storage_stride,
                         "frames": [], "clipIds": []}
        register_x = archive.get((b"REGS", resource_id))
        register_y = archive.get((b"REGS", resource_id + 1))
        if register_x is None or register_y is None:
            raise ValueError(f"Missing registration tables for spray bank {resource_id}")
        for index, relative in enumerate(offsets[:declared]):
            offset = relative - 8
            if offset < declared * 4 or offset + 8 > len(self.pixels):
                raise ValueError(f"Invalid spray bank {resource_id} frame {index} offset")
            width, height, _, _ = struct.unpack_from(">4H", self.pixels, offset)
            if not width or not height:
                raise ValueError(f"Empty spray bank {resource_id} frame {index}")
            self.offsets.append(offset)
            self.metadata["frames"].append({
                "index": index, "width": width, "height": height,
                "registration": [_words(register_x, (index + 1) * 2, 1)[0],
                                 _words(register_y, (index + 1) * 2, 1)[0]],
                "image": f"{prefix}/{resource_id}-{index}.png",
            })

    def payload(self, index):
        if not 0 <= index < len(self.offsets):
            raise ValueError(f"Spray frame {index} outside bank")
        # The bitmap decoder reads its own declared dimensions/compressed size.
        # A view avoids copying the remainder of a large bank for every image.
        return memoryview(self.pixels)[self.offsets[index]:]


def _compile_clip(resource_id, data, archive, banks, prefix):
    decode = import_module("mohawk-script").decode_script
    script = decode(data)  # Rejects unsupported commands explicitly.
    collection = script["collection"]
    bank = banks.get(collection)
    if bank is None:
        raise ValueError(f"Script {resource_id} references missing bank {collection}")
    left, top, right, bottom = struct.unpack_from(">4h", data, 16)
    clip = {"id": resource_id, "bank": collection, "sourceOrigin": list(script["origin"]),
            "sourceBounds": [left, top, right - left, bottom - top], "frames": [], "sounds": [],
            "durationMs": 0, "loop": False}
    interval = None
    now = 0
    current = None
    for event in script["events"]:
        if event["op"] == "interval":
            interval = event["ms"]
        elif event["op"] == "draw":
            if "firstDrawRawPosition" not in clip:
                clip["firstDrawRawPosition"] = list(event["images"][0][1:])
            parts = []
            for raw_id, x, y in event["images"]:
                index = (raw_id & 0x7FFF) - 1
                if not 0 <= index < bank.metadata["frameCount"]:
                    raise ValueError(f"Script {resource_id} references missing frame {index}")
                frame = bank.metadata["frames"][index]
                registered = bool(raw_id & 0x8000)
                if registered:
                    x -= frame["registration"][0]
                    y -= frame["registration"][1]
                parts.append({"frame": index, "x": x, "y": y, "registered": registered})
            current = {"atMs": now, "durationMs": 0, "parts": parts}
            clip["frames"].append(current)
        elif event["op"] == "wait":
            if interval is None or current is None:
                raise ValueError(f"Script {resource_id} waits before interval/drawing")
            if not event.get("terminal"):
                current["durationMs"] += interval
                now += interval
        elif event["op"] == "sound":
            sound_id = collection + event["cue"]
            if (b"tWAV", sound_id) not in archive:
                raise ValueError(f"Script {resource_id} references missing sound {sound_id}")
            clip["sounds"].append({"atMs": now, "id": sound_id, "channel": event["channel"],
                                   "src": f"{prefix}/sounds/{sound_id}.wav"})
    if not clip["frames"]:
        raise ValueError(f"Script {resource_id} has no drawing frames")
    clip["durationMs"] = now
    # The native finite actor checks completion at the next scheduled update,
    # and can wait longer while either source sound channel is still active.
    clip["endIntervalMs"] = interval
    clip["minimumCompletionMs"] = now + interval
    clip["terminalFrame"] = len(clip["frames"]) - 1
    return clip


class NativeSprayArchive:
    def __init__(self, archive, mode):
        if mode not in ("moving-spray", "spray"):
            raise ValueError("Native spray mode must be moving-spray or spray")
        self.archive = archive
        self.mode = mode
        self.prefix = f"tools/{mode}/native"
        self.banks = {
            resource_id: _Bank(resource_id, data, archive, self.prefix)
            for (tag, resource_id), data in sorted(archive.items()) if tag == b"tBMH"
        }
        if not self.banks:
            raise ValueError("Native spray archive contains no bitmap banks")
        clips = {}
        for (tag, resource_id), data in sorted(archive.items()):
            if tag != b"tSCR":
                continue
            try:
                clip = _compile_clip(resource_id, data, archive, self.banks, self.prefix)
            except ValueError as error:
                raise ValueError(f"Cannot decode native spray script {resource_id}: {error}") from error
            clips[str(resource_id)] = clip
            self.banks[clip["bank"]].metadata["clipIds"].append(resource_id)
        if mode == "moving-spray" and not clips:
            raise ValueError("Moving spray archive contains no scripts")
        if mode == "spray" and clips:
            raise ValueError("Static spray archive unexpectedly contains scripts")
        self.manifest = {
            "version": 1, "mode": mode,
            "source": "Data/Tools/Anims.MHK" if mode == "moving-spray" else "Data/Tools/Cyclic.MHK",
            "banks": {str(key): bank.metadata for key, bank in self.banks.items()}, "clips": clips,
            "coordinateSystem": "Parts are relative to sourceOrigin after source registration; no rescaling or recentering applied.",
            "relocationAnchor": "Subtract firstDrawRawPosition from the pointer; each part already has registration applied. Verified against i386 emitter/interpreter.",
            "emitterStatus": "Source selection, cadence, first-image anchoring and finite flattening verified against i386. Completion is no earlier than minimumCompletionMs and waits for active sound channels. Platform timer delay and overlapping completion order remain empirical.",
            "timingStatus": "Intervals and source waits retained in milliseconds; terminal waits before end do not add a hold.",
            "unsupported": [],
        }

    def export(self, output, bitmap_decoder, sound_decoder=None, *, layout="frames", shard=False, atlas_size=2048):
        """Write under the original-media root; publish the manifest last.

        bitmap_decoder is import-original.bitmap: (extension, bytes, w, h).
        sound_decoder is import-original.decode_sound: (rate, channels, PCM16).
        """
        output = Path(output)
        if layout not in ("frames", "atlas"):
            raise ValueError("Spray layout must be frames or atlas")
        sound_ids = sorted({sound["id"] for clip in self.manifest["clips"].values() for sound in clip["sounds"]})
        if sound_ids and sound_decoder is None:
            raise ValueError("A sound decoder is required to preserve moving-spray sound cues")
        for bank in self.banks.values():
            if layout == "atlas":
                self._export_atlases(bank, output, bitmap_decoder, atlas_size)
                continue
            bank.metadata.pop("atlases", None)
            for frame in bank.metadata["frames"]:
                frame["image"] = f"{self.prefix}/{bank.metadata['id']}-{frame['index']}.png"
                frame.pop("sourceRect", None)
                extension, pixels, width, height = bitmap_decoder(bank.payload(frame["index"]))
                if extension != "png":
                    raise ValueError("Native spray frame must decode to PNG without resampling")
                if [width, height] != [frame["width"], frame["height"]]:
                    raise ValueError("Decoded spray frame dimensions differ from source")
                target = output / frame["image"]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(pixels)
        for sound_id in sound_ids:
            rate, channels, samples = sound_decoder(self.archive[b"tWAV", sound_id])
            target = output / self.prefix / "sounds" / f"{sound_id}.wav"
            target.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(target), "wb") as sound:
                sound.setnchannels(channels)
                sound.setsampwidth(2)
                sound.setframerate(rate)
                sound.writeframes(samples)
        self.manifest["layout"] = layout
        manifest = self._export_shards(output) if shard else self.manifest
        target = output / "tools" / f"{self.mode}-native.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
        return manifest

    def _export_atlases(self, bank, output, bitmap_decoder, maximum):
        from PIL import Image

        pages = pack_atlases(bank.metadata["frames"], maximum)
        bank.metadata["atlases"] = []
        for page_index, page in enumerate(pages):
            filename = f"{self.prefix}/{bank.metadata['id']}-atlas-{page_index}.png"
            atlas = Image.new("RGBA", (page["width"], page["height"]))
            for placement in page["placements"]:
                frame = bank.metadata["frames"][placement["index"]]
                extension, pixels, width, height = bitmap_decoder(bank.payload(frame["index"]))
                if extension != "png" or [width, height] != [frame["width"], frame["height"]]:
                    raise ValueError("Decoded spray atlas frame differs from source format or dimensions")
                with Image.open(BytesIO(pixels)) as source:
                    image = source.convert("RGBA")
                    if image.size != (width, height):
                        raise ValueError("Encoded spray image dimensions differ from source")
                    # No mask: using alpha as a paste mask would premultiply
                    # twice and alter translucent source edge pixels.
                    atlas.paste(image, (placement["x"], placement["y"]))
                frame["image"] = filename
                frame["sourceRect"] = [placement["x"], placement["y"], width, height]
            target = output / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            atlas.save(target, format="PNG")
            bank.metadata["atlases"].append({"image": filename, "width": page["width"], "height": page["height"]})

    def _export_shards(self, output):
        common = {key: value for key, value in self.manifest.items() if key not in ("banks", "clips")}
        index = {**common, "sharded": True, "banks": {},
                 "spriteCount": sum(bank.metadata["frameCount"] for bank in self.banks.values()),
                 "clipCount": len(self.manifest["clips"])}
        for key, bank in self.manifest["banks"].items():
            filename = f"{self.prefix}/{key}.json"
            clips = {str(clip_id): self.manifest["clips"][str(clip_id)] for clip_id in bank["clipIds"]}
            shard = {**common, "banks": {key: bank}, "clips": clips}
            target = output / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(shard, separators=(",", ":")) + "\n")
            index["banks"][key] = {"id": bank["id"], "frameCount": bank["frameCount"],
                                    "clipCount": len(clips), "manifest": filename}
        return index


def analyze_native_spray(archive, mode):
    """Inspect without writing files; every source command/reference is checked."""
    return NativeSprayArchive(archive, mode).manifest


def export_native_spray(archive, output, *, mode, bitmap_decoder, sound_decoder=None, layout="frames", shard=False, atlas_size=2048):
    return NativeSprayArchive(archive, mode).export(output, bitmap_decoder, sound_decoder,
                                                  layout=layout, shard=shard, atlas_size=atlas_size)
