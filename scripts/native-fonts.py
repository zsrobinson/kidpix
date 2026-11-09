"""Recover exact sfnt bytes from the supplied installer, without installing fonts.

Requires the existing import-ui.py dependencies plus fontTools. Outputs research
artifacts only; this does not modify the app, publish fonts, or repair old fonts.
"""

import argparse
from hashlib import sha256
from importlib import import_module
from io import BytesIO
import json
from pathlib import Path
import plistlib

from fontTools.misc.macRes import ResourceReader
from fontTools.ttLib import TTFont


def digest(data):
    return sha256(data).hexdigest()


def composite_cycles(font):
    """Report recursive component graphs without trying to flatten the glyphs."""
    glyf = font["glyf"]
    edges = {}
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        edges[name] = [part.glyphName for part in glyph.components] if glyph.isComposite() else []
    completed, active, cycles = set(), [], []

    def visit(name):
        if name in active:
            cycles.append(active[active.index(name):] + [name])
            return
        if name in completed:
            return
        active.append(name)
        for child in edges.get(name, []):
            visit(child)
        active.pop()
        completed.add(name)

    for name in edges:
        visit(name)
    return cycles


def extract_dfont(data):
    """Yield (metadata, exact sfnt payload) for every face, including bad faces."""
    reader = ResourceReader(BytesIO(data))
    try:
        for index in reader.getIndices("sfnt"):
            resource = reader.getIndResource("sfnt", index)
            payload = resource.data
            font = TTFont(BytesIO(payload), recalcBBoxes=False, recalcTimestamp=False)
            try:
                names = {
                    str(key): sorted({name.toUnicode() for name in font["name"].names if name.nameID == key})
                    for key in (0, 1, 2, 4, 6, 13, 14)
                }
                ps_name = font["name"].getDebugName(6)
                if not ps_name or not all(char.isalnum() or char in "-_" for char in ps_name):
                    raise ValueError(f"Unsafe or missing PostScript name: {ps_name!r}")
                family = font["name"].getDebugName(1)
                style_bits = font["head"].macStyle
                cycles = composite_cycles(font)
                metadata = {
                    "sfntIndex": index,
                    "resourceId": resource.id,
                    "resourceName": resource.name,
                    "postscriptName": ps_name,
                    "family": family,
                    "subfamily": font["name"].getDebugName(2),
                    "cssFamily": f"KPX Native {family}",
                    # These legacy OS/2 weights include 5 and 7. Head style bits
                    # distinguish the real four Schoolhouse faces without
                    # changing the font or treating 5 as a CSS font weight.
                    "cssWeight": 700 if style_bits & 1 else 400,
                    "cssStyle": "italic" if style_bits & 2 else "normal",
                    "path": f"sfnt/{ps_name}.ttf",
                    "bytes": len(payload),
                    "sha256": digest(payload),
                    "names": names,
                    "tables": list(font.keys())[1:],
                    "unitsPerEm": font["head"].unitsPerEm,
                    "hhea": {key: getattr(font["hhea"], key) for key in ("ascent", "descent", "lineGap")},
                    "post": {key: getattr(font["post"], key) for key in ("italicAngle", "underlinePosition", "underlineThickness")},
                    "os2": {key: getattr(font["OS/2"], key, None) for key in (
                        "version", "fsType", "usWeightClass", "fsSelection", "sTypoAscender",
                        "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent")},
                    "unicodeCodepoints": sorted(font.getBestCmap() or {}),
                    "compositeCycles": cycles,
                    "cssIncluded": not cycles,
                }
                yield metadata, payload
            finally:
                font.close()
    finally:
        reader.close()


def recover(read, paths):
    """Return a JSON-compatible manifest and relative-path → bytes artifact map."""
    artifacts, faces, sources = {}, [], []
    for path in sorted(path for path in paths if "/Fonts/" in path and path.endswith(".dfont")):
        data = read(path)
        original_path = f"original/{Path(path).name}"
        artifacts[original_path] = data
        sources.append({"sourcePath": path, "path": original_path, "bytes": len(data), "sha256": digest(data)})
        for metadata, payload in extract_dfont(data):
            metadata["sourcePath"] = path
            if metadata["path"] in artifacts:
                raise ValueError(f"Duplicate recovered face: {metadata['path']}")
            artifacts[metadata["path"]] = payload
            faces.append(metadata)
    if not sources:
        raise ValueError("Installer has no bundled dfonts")
    css = ["/* Research extraction; exact sfnt bytes. Cyclic fonts are excluded. */"]
    for face in faces:
        if face["cssIncluded"]:
            css.append("@font-face { font-family: %s; src: url(%s) format(\"truetype\"); "
                       "font-weight: %s; font-style: %s; font-display: block; }" % (
                           json.dumps(face["cssFamily"]), json.dumps(face["path"]),
                           face["cssWeight"], face["cssStyle"]))
    artifacts["fonts.css"] = ("\n".join(css) + "\n").encode()
    settings = {}
    for name in ("UserDefaults.plist", "English.lproj/TextObjects.plist", "English.lproj/HelpTextSettings.plist"):
        path = f"Contents/Resources/{name}"
        data = read(path)
        artifacts[Path(name).name] = data
        settings[path] = {"sha256": digest(data), "values": plistlib.loads(data)}
    user_defaults = settings["Contents/Resources/UserDefaults.plist"]["values"]
    default_font = user_defaults["Default Font Name"]
    manifest = {
        "schemaVersion": 1,
        "evidence": "Supplied installer bytes, not native runtime rendering",
        "sourceDirectory": "Kid Pix Deluxe 3D.app/Contents/Resources/Fonts",
        "transformation": "Byte-identical sfnt resource extraction; no reserialization or repair",
        "defaultFontName": default_font,
        "defaultFontSize": user_defaults["Default Font Size"],
        "defaultFontBundled": any(default_font in face["names"]["1"] for face in faces),
        "settings": settings,
        "sources": sources,
        "faces": faces,
    }
    artifacts["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    return manifest, artifacts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--volume", type=Path, default=Path("/Volumes/Kid Pix Deluxe 3D"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/t3/fonts"))
    parser.add_argument("--check", action="store_true", help="Compare every output byte against a fresh installer extraction")
    args = parser.parse_args()
    read, paths = import_module("import-ui").app_resources(args.volume, include_paths=True, include_app_paths=True)
    manifest, artifacts = recover(read, paths)
    for relative, data in artifacts.items():
        target = args.output / relative
        if args.check:
            if not target.is_file() or target.read_bytes() != data:
                raise ValueError(f"Missing or changed extraction: {target}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    cycles = [face["postscriptName"] for face in manifest["faces"] if face["compositeCycles"]]
    print(json.dumps({"check": args.check, "containers": len(manifest["sources"]),
                      "faces": len(manifest["faces"]), "artifactsCompared" if args.check else "artifactsWritten": len(artifacts),
                      "cyclicFacesExcludedFromCSS": cycles}))


if __name__ == "__main__":
    main()
