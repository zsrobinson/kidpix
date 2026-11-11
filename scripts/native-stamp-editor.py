"""Recover StampEd.MHK artwork, palette and MBTN control state references.

The integration entry point is export_stamp_editor(read, ui_output). This module
does not regenerate the application's current UI import. Standalone exports go
to an ignored research directory unless an explicit output path is supplied.
"""

import argparse
import hashlib
from importlib import import_module
import json
from pathlib import Path
import struct

from PIL import Image


BUTTONS = [
    ("pencil", "Pencil"),
    ("fill", "Fill Bucket"),
    ("undo", "Undo Guy"),
    ("erase", "Eraser"),
    ("flip", "Flip Vertical"),
    ("rotate", "Rotate"),
    ("restore", "Restore Original"),
    ("cancel", "Cancel"),
    ("save", "OK"),
]


def export_stamp_editor(read, ui_output):
    ui = import_module("import-ui")
    decode = import_module("mohawk-script").decode_script
    archive_bytes = read("Data/StampEd.MHK")
    archive_hash = hashlib.sha256(archive_bytes).hexdigest()
    if archive_hash != "d3be6fc4f07ca6bfb02c6af85b8c16c7f07f197807c804338a67750599658427":
        raise ValueError("Unsupported StampEd source; re-audit NORMAL erase first")
    archive = ui.mohawk(archive_bytes)
    folder = Path(ui_output) / "stamp-editor"
    folder.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (1024, 768))

    def export_script(script_id, filename):
        frame = Image.new("RGBA", (1024, 768))
        bounds = ui.render_script(frame, archive, script_id)
        left = min(rect[0] for rect in bounds)
        top = min(rect[1] for rect in bounds)
        right = max(rect[0] + rect[2] for rect in bounds)
        bottom = max(rect[1] + rect[3] for rect in bounds)
        frame.crop((left, top, right, bottom)).save(folder / filename)
        script = decode(archive[b"tSCR", script_id])
        sounds = [14000 + event["cue"] for event in script["events"] if event["op"] == "sound"]
        return {"script": script_id, "rect": [left, top, right - left, bottom - top],
                "image": f"stamp-editor/{filename}", "sounds": sounds}

    frame = export_script(14000, "frame.png")
    palette = export_script(14003, "palette.png")
    for script in [14000, 14003]:
        ui.render_script(preview, archive, script)
    manifest = {
        "size": [1024, 768],
        "frame": frame,
        "palette": palette,
        # These are the opaque white interiors in the original frame bitmap.
        # The placeholder tSCR images for the dynamic surfaces are transparent
        # and have registration offsets, so they are not used as hit bounds.
        "canvas": [381, 240, 269, 269],
        "preview": [687, 245, 45, 45],
        "colorReadout": [672, 319, 78, 14],
        "pixels": [32, 32],
        "buttons": {},
        "chips": [],
        "source": {
            "archive": "Data/StampEd.MHK", "collection": 14000,
            "controlStateMapping": "rest=MBTN word0; pointer tracking inside=word1; auxiliary rollover animation=word10",
        },
    }
    records = archive[b"MBTN", 14000]
    if len(records) != len(BUTTONS) * 32:
        raise ValueError("Unexpected StampEd MBTN record count")
    for index, (command, label) in enumerate(BUTTONS):
        words = struct.unpack_from(">16H", records, index * 32)
        states = {
            "rest": export_script(words[0], f"{command}-rest.png"),
            "tracking": export_script(words[1], f"{command}-tracking.png"),
            "rollover": export_script(words[10], f"{command}-rollover.png"),
        }
        manifest["buttons"][command] = {
            "label": label, "rect": states["rollover"]["rect"],
            "states": states, "mbtnWords": list(words),
        }
        ui.render_script(preview, archive, words[0])

    swatches = ui.bitmap(archive[b"tBMP", 14000])
    for row in range(13):
        for column in range(6):
            color = swatches.getpixel((10 + column * 13, 31 + row * 13))[:3]
            manifest["chips"].append({
                "color": "#%02x%02x%02x" % color,
                "rect": [672 + column * 13, 340 + row * 13, 12, 12],
            })
    manifest["operations"] = {"erase": {"geometry": "normal-32-v1", "intervalMs": 66,
        "sound": 14006, "archiveSha256": archive_hash}}
    sounds = sorted({14006} | {sound for button in manifest["buttons"].values()
                     for state in button["states"].values() for sound in state["sounds"]})
    for sound in sounds:
        ui.pcm_sound(archive[b"tWAV", sound], folder / f"sound-{sound}.wav")
    manifest["sounds"] = {str(sound): f"stamp-editor/sound-{sound}.wav" for sound in sounds}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    preview.save(folder / "preview.png")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("volume", nargs="?", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/research/native-stamp-editor"))
    arguments = parser.parse_args()
    ui = import_module("import-ui")
    result = export_stamp_editor(ui.app_resources(arguments.volume), arguments.output)
    print(f"Recovered {len(result['buttons'])} native controls, {len(result['chips'])} palette cells and {len(result['sounds'])} sound cues.")
