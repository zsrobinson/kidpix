# Native Mac paper palette investigation

Investigated 2026-11-09 against the mounted Kid Pix Deluxe 3D installer. Scope: indexed Easel sprites **218–238**, their source-palette interpretation, and the native Mac drawing port's color table. This is resource and executable evidence. **The original application has not run here; native rendered colors remain unverified.**

The strongest defensible conclusion is that the ordinary native draw path borrows the destination port's `PixMap.pmTable`. Its traced offscreen allocations request format 32 with a null color table. This investigation did **not** establish the contents of that table at paper draw time, or an installation of Easel `tPAL1000` into it. Neither Apple's CLUT8 nor CLUT40 dumps supply that missing connection. Keep the existing archive-palette decoder and its explicit native-port uncertainty.

## Evidence identity

The installer is mounted at `/Volumes/Kid Pix Deluxe 3D`. `scripts/import-ui.py`'s `app_resources()` reads its installer index and payload; `mohawk()` reads the embedded archive directory. A fresh read of that installer established:

- `Contents/MacOS/Kid Pix` is byte-identical to `artifacts/research/kidpix-original`: 7,794,072 bytes, SHA-256 `a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5`.
- The i386 slice starts at fat-file offset `0x1000`, length `0x35f46c`, SHA-256 `506a64bd99ac1848ec934013a453a41ec3f745d53d174a7fba5939727807abeb`.
- `Data/Easel.MHK` resource `(tPAL,1000)` is byte-identical to `artifacts/research/native-paper-indexed/tPAL-1000.bin`: 1,020 bytes, SHA-256 `3553077d6575c6b8d3837d4900cfce53abc2458dffdc0466ded59ad69b4e7efd`.
- All 21 sprites' complete eight-byte header plus `stride × height` payloads match the retained `218.bitmap`–`238.bitmap` files exactly.

All executable addresses below are **i386 virtual addresses**, as printed in [`disassembly-i386.txt`](../../artifacts/research/disassembly-i386.txt). Do not add the fat-slice offset to these virtual addresses when setting a debugger breakpoint. For file reads, use Mach-O segment mapping; `__IMPORT` has a different virtual-to-file offset from `__TEXT` and `__DATA`.

## What the archive establishes

The palette header is big-endian `(start=1, count=254)`, followed by 254 RGBx entries. This agrees with [ScummVM's own Mohawk `GraphicsManager::setPalette` implementation](https://github.com/scummvm/scummvm/blob/master/engines/mohawk/graphics.cpp#L103), which reads a big-endian start and count, then three color bytes and a skipped byte per entry. That independently corroborates the resource format; ScummVM's implementation does not prove the original Mac application's palette installation.

The declared colors are grayscale. The two absent intensity values are **83 and 169**. The earlier reference to a missing 86 in `docs/paper-canister.md` is incorrect; this task leaves that separately owned file untouched.

Across the 21 payloads, counting visible row widths and excluding stride padding:

- 93,639 indexed pixels use 30 indices.
- Index 0 occurs 47,424 times; index 1 is unused; index 255 occurs 361 times.
- The other indices are `9,21,35,49,50,66,76,82,88,98,100,105,112,115,117,122,129,136,143,153,155,161,174,194,214,234,244,253`.
- All sprite headers have flags 2. They carry no per-image palette under the native flag test described below.

The saved `mac-clut-8.json` and `mac-clut-40.json` are actual host Apple `GetCTable` dumps retained by the preceding investigation. Re-reading their records confirms that both have256 entries, index 0 white and index 255 black. CLUT8 is colored; CLUT40 is inverse grayscale. Neither equals the authored table over the used declared indices. These are candidate-table evidence, **not a dump of Kid Pix's destination**. Reading a CLUT resource by ID does not install it into a GWorld.

## Ordinary native sprite path

The path can be reproduced without guessing a global palette:

| Address | Direct executable evidence |
| --- | --- |
| `0x00158ef9`–`0x00158f46` | Animation renderer iterates image records, resolves each image in its loaded bank and calls `0x001ca573`; internal drawing mode is8. |
| `0x001ca573`–`0x001ca60a` | Bitmap wrapper obtains/decompresses the bitmap through `0x001ca4b6`, byte-swaps its header and passes its flags and pixel pointer to `0x001c8b90`. Drawing mode is a separate argument. |
| `0x001ca4e6`–`0x001ca559` | Compressed payload handling recognizes compression bits and restores the bitmap header/pixels. It does not install an archive palette. Raw flags 2 return through `0x001ca55d`. |
| `0x001c8bbf`–`0x001c8c61` | Dispatcher selects the current drawing surface and calls virtual slot `+0x14`. |
| `0x0032a938 + 0x14` | Offscreen surface vtable slot contains `0x001d3e20`. Constructor `0x001ce422` installs this vtable. |
| `0x001d3e6e`–`0x001d3fa7` | For source flags 2, flag 0x08 is clear. A destination depth other than 8 takes fallback `0x001d457f`; the traced 32-bit allocations satisfy that condition. |
| `0x001d457f`–`0x001d45d4` | Forwards the drawing arguments to `0x001d1180`. |
| `0x001d121a`–`0x001d1248` | Separates source flags: `flags & 8` into local `-0x20c`, low three bits into `-0x1f0`. |
| `0x001d1ac0`–`0x001d1adc` | Maps low source-format bits through the table reached via import pointer `0x00351700 → 0x00261440`; first six little-endian shorts are `1,4,8,16,32,32`. Flags 2 therefore describe8-bit source pixels. |
| `0x001d1aef`–`0x001d1b3d` | Only sources with flag 0x08 enter the branch that allocates and builds a source color table from per-image data. Flags 2 do not take this branch. |
| `0x001d25ce`–`0x001d25e3` | For flag 0x08 clear, assigns the supplied pixels directly to the scratch source `PixMap.baseAddr`, sets temporary-table local `-0x1e0` to 0 and rejoins setup. |
| `0x001d1db3`–`0x001d1dcd` | Source depths 4 and 1 have special reduced-table handling. Source depth 8 proceeds to `0x001d1ef1`. |
| `0x001d1ef1`–`0x001d1f1d` | With flag 0x08 clear, calls `GetPortPixMap(destinationPort)`, reads its `pmTable` at byte offset `0x2a`, and assigns that handle to the scratch **source** PixMap's `pmTable`. |
| `0x001d21c5`–`0x001d21dc`; `0x001d2484`–`0x001d25b1` | Configures drawing colors, resolves internal mode 8 through table `0x0026142c` to QuickDraw mode 36, and calls `CopyBits` with the assembled source PixMap and destination port bitmap. |

The inspected SDK header is `/Library/Developer/CommandLineTools/SDKs/MacOSX14.5.sdk/System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/QD.framework/Versions/A/Headers/Quickdraw.h`.

Apple's [PixMap documentation](https://developer.apple.com/documentation/applicationservices/pixmap) and local SDK `Quickdraw.h`, lines78–105, identify `pmTable` as the color map and define `ColorTable`/`ColorSpec`. In the 32-bit packed structure used by this binary, `pmTable` is at `+0x2a`, matching the loads above.

This is more precise than “8-bit means grayscale.” The source pixel size and the source palette are separate. The native fallback explicitly makes the indexed source use a destination-owned table. Also, its mode 36 transparency is color-dependent: the web export's index 0 transparency convention alone does not prove the original Mac's color-key behavior for an unknown table.

## Destination allocation and initialization

The following argument chain is established statically:

| Address | Allocation / initialization |
| --- | --- |
| `0x0008fb18`–`0x0008fb25` | Requests depth/format `0x20` through allocator `0x001ccbdd`; stores the returned surface handle at owner `+0x960`. |
| `0x0008b217`–`0x0008b227`; `0x0008b251`–`0x0008b261` | Picker allocations request `0x20` through `0x00149d29`; store handles at `+0xc4` and `+0xc8`. |
| `0x00149d29`–`0x00149d67` | Forwards requested depth to `0x00149ca1`. |
| `0x00149ca1`–`0x00149cdf` | Forwards depth to `0x001ccbdd`; later selects/sets up coordinates and restores the previous surface. No palette argument is supplied. |
| `0x001ccbe6`–`0x001ccc06` | Allocator receives depth as its third argument; values0/`0xffff` use graphics-global default depth at `+0x0a`. Explicit 32 is preserved. |
| `0x001ccc6e`–`0x001ccc8c` | Forwards that depth to offscreen initializer `0x001ce120`. |
| `0x001ce18d` | Stores requested depth in surface `+0x4c`. |
| `0x001ce282`–`0x001ce2af` | Allocates with `QTNewGWorld(&surface->port, depth, bounds, NULL, NULL, 0x2000)`. The null table is the fourth argument at stack `+0x0c`. |
| `0x001ce1da`–`0x001ce20f` | Alternative caller-buffer path uses `QTNewGWorldFromPtr`, again with a null table. |
| `0x001cccba` → `0x001cf5d0` | Newly allocated surface virtual initializer `+0x58` sets drawing colors, state and clipping. Its inspected instructions contain no `pmTable` replacement or palette copy. |
| `0x0015828a`–`0x001582da` | Animation-manager offscreen creation queries the supplied surface's actual `PixMap.pixelSize` through `0x001c8daf`, then allocates with that depth. It does not independently request40 or pass a palette. |

Apple's [TN2044, “The Offscreen”](https://developer.apple.com/library/archive/technotes/tn/tn2044.html) documents the `QTNewGWorld` color-table argument as selecting the default when null. Apple's [NewGWorld contract](https://developer.apple.com/library/archive/documentation/mac/QuickDraw/QuickDraw-311.html) likewise describes null as selecting a table for the requested depth; depth 0 has distinct screen-device inheritance. Neither cited contract identifies the exact 256 entries borrowed by this application when it later treats the 32-bit port's table as the palette of an 8-bit source.

Thus a 32-bit world with `cTable=NULL` is **not evidence of `GetCTable(40)`**. It is also insufficient evidence to substitute `GetCTable(8)`. No table was supplied by the traced application allocation calls.

## Other leads checked and bounded negative results

**Explicit format 40 exists, but its owner is fill tooling.** Calls at `0x001283b2` and `0x0012870b` pass `0x28` directly to `QTNewGWorld`. Local Apple SDK `Quickdraw.h`, line 124, defines this as `k8IndexedGrayPixelFormat`, distinct from `k8IndexedPixelFormat=8` at line 116 and `k32ARGBPixelFormat=32` at line 119. Vtable `0x00325480` contains method `0x00128314` at `+0xc8`; its RTTI at `0x00325558` points to `0x0024e8c0`, string `N9Rembrandt5RFillE`. The first allocation stores its world at fill-object `+0x100`. This proves an explicit grayscale allocation in `Rembrandt::RFill`; no paper-port connection was established. It must not be generalized to paper.

**The color-table mutation import is cursor-related.** The disassembly contains one call to `CTabChanged`, at `0x001cd270`. Its routine `0x001cd060` obtains global `+0xe4`, dereferences a cursor structure's PixMap at `+2`, copies cursor pixels/color-table records and refreshes cursor state. Constructor `0x001cd613` allocates a 0x60-byte handle, writes cursor type `0x8001`, installs `NewPixMap` at `+2`, and allocates the cursor data handles. Disposal at `0x001cd5e2` calls `DisposeCCursor` for the associated global handles. This is a real table mutation, but it does not establish mutation of the paper destination.

**Main screen depth handling is not palette installation.** `0x001d109e` calls `SetDepth`; `0x001d10a3`–`0x001d114b` read the main device's actual pixel size, update graphics-global depth and update screen-like surface depth fields. The inspected path does not copy Easel's authored palette into the paper GWorld.

**No direct archive-palette loader was identified.** Exact byte scans of the i386 slice found no `tPAL`, reversed `LAPt`, lowercase `tpal` or reversed `lapt`. Searches of the import table found no `SetPalette`, `GetCTable` or `SetEntries`. Scans for the authored palette's first 32 entries as RGBx bytes and as 16-bit RGB triplets/ColorSpecs in either byte order found no literal copy. These searches exclude those straightforward representations only. They do not exclude computed tags, generic resource enumeration, indirect mutation, other encodings, or framework-side initialization. They are not proof that the resource is never used.

**Modern host limitations are concrete.** Read-only `ctypes` symbol lookup in this host's QD framework finds `GetCTable`, but not `NewGWorld`, `GetGWorldPixMap`, `GetPortPixMap` or `DisposeGWorld`. No GWorld allocation or original drawing was executed. A host CLUT dump cannot stand in for a native application-port capture.

## Reproduction

Read installer resources without regenerating exports or Python bytecode:

```sh
PYTHONDONTWRITEBYTECODE=1 artifacts/t3/cursors/venv/bin/python -B - <<'PY'
from pathlib import Path
from importlib import import_module
import hashlib, struct, sys
sys.path.insert(0, 'scripts')
ui = import_module('import-ui')
paper = import_module('native-paper')
read = ui.app_resources(Path('/Volumes/Kid Pix Deluxe 3D'))
exe = read('Contents/MacOS/Kid Pix')
assert exe == Path('artifacts/research/kidpix-original').read_bytes()
print('executable', hashlib.sha256(exe).hexdigest())
archive = ui.mohawk(read('Data/Easel.MHK'))
root = Path('artifacts/research/native-paper-indexed')
palette = archive[b'tPAL', 1000]
assert palette == (root / 'tPAL-1000.bin').read_bytes()
assert struct.unpack_from('>2H', palette) == (1, 254)
print('missing shades', sorted(set(range(256)) - set(palette[4::4])))
for number in range(218, 239):
    payload = paper.sprite_payload(archive[b'tBMH', 1000], number)
    width, height, stride, flags = struct.unpack_from('>4H', payload)
    assert flags == 2
    assert bytes(payload[:8 + stride * height]) == (root / f'{number}.bitmap').read_bytes()
print('21/21 indexed payloads match installer')
PY
```

The command above passed in this investigation. The isolated existing interpreter is an environment dependency, not an output directory for this task.

Recover selected instruction intervals from the retained disassembly:

```sh
python3 -B - <<'PY'
from pathlib import Path
ranges = [(0x1d1ac0, 0x1d1b44), (0x1d1db3, 0x1d1f20),
          (0x1ce18d, 0x1ce2b4), (0x128382, 0x1283b7),
          (0x1cd060, 0x1cd2c8)]
for line in Path('artifacts/research/disassembly-i386.txt').read_text().splitlines():
    if len(line) > 8 and line[:8].startswith('00'):
        address = int(line[:8], 16)
        if any(lo <= address < hi for lo, hi in ranges):
            print(line)
PY
```

Use `otool -arch i386 -l artifacts/research/kidpix-original` when reading pointer targets. In this image, import pointer `0x00351700` maps to i386 slice file offset `0x346700` and contains `0x00261440`; that target has the source-depth mapping `1,4,8,16,32,32`. An incorrect assumption that every segment has `vmaddr-fileoff=0x1000` reads unrelated bytes at the import address.

## Exact remaining gap and integration contract

The unresolved value is **the destination's actual `CTabHandle` and entries at a paper sprite draw**, including any initialization or mutation after allocation. The allocation request and the generic draw-time lookup have been traced; the table's contents and paper-event port identity have not been observed in the original runtime.

The most discriminating next evidence is a compatible native runtime capture:

1. At `0x001ca573`, identify one of sprites218–238 from the current bitmap header/payload and record the caller/event.
2. At `0x001d1f04`–`0x001d1f1d`, record destination surface argument `[ebp+8]`, its port at `+4`, surface depth at `+0x4c`, destination PixMap `pixelSize`/`pixelFormat`, and the `CTabHandle` in `esi` after the `+0x2a` load. Dump the dereferenced `ColorTable`: seed, flags, size and all declared `ColorSpec` entries.
3. Record the scratch source PixMap's resulting table and `CopyBits` source/destination/mode at `0x001d25b1`. Compare entries against the authored palette and capture the rendered paper canister. A table dump immediately after `QTNewGWorld` is useful, but cannot alone exclude later mutation.

Alternatively, primary implementation evidence for the exact legacy QuickTime/QuickDraw allocation plus a complete application mutation trace could close the same gap. A different app's GWorld or this host's CLUT40 is insufficient.

No runtime integration API changed. Existing exports remain `palette_entries()` / `indexed_paper_pixels()` in `scripts/native-paper.py` and manifest `palette.nativeMacPortStatus`. Parent integration should retain the uncertainty, optionally link this audit from `docs/paper-canister.md`, and correct its absent-shade 86 reference to 83. No decoder, published PNG, UI behavior, or test expectation needs changing on this evidence.

Actual checks: installer/executable equality passed; palette equality and header assertions passed; indexed-payload equality passed 21/21; palette/index statistics and import/symbol scans completed; referenced disassembly and vtable/pointer targets inspected. No browser, application, build or regression suite was run for this documentation-only investigation. Native runtime verification remains 0 captures.
