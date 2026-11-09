# Reverse engineering the supplied Mac trial

Evidence collected 2026-11-09 from the mounted `KPD3DMac.dmg`. The executable identifies itself as Kid Pix version 2.2, build 615. Analysis here is static: the original application has not been run.

## Native animation timing recovered from the executable

The `tSCR` command stream starts at **byte 26**, not byte 30. The common bytes at offset 26, `04 04 00 64`, are a command: opcode 4, length 4, big-endian interval 100. Treating those bytes as a fixed header drops the animation's timing instruction.

For the examined Undo Guy routines, that interval is **100 milliseconds**. The earlier 35 ms per frame value was an approximation and is contradicted by the native scheduling code.

The evidence chain in the i386 slice is:

| Location | Observed instructions | Interpretation |
| --- | --- | --- |
| `0x0015a501` to `0x0015a50f` | Opcode 16 has a separate image-group path; opcodes 0–15 dispatch through the table at `0x00260850`. | This is the script command interpreter, entered at `0x0015a174`. |
| Table `0x00260850`, index 4 | Target `0x0015a52c`. | Maps opcode 4 to the interval handler. |
| `0x0015a52c` to `0x0015a54d` | Reads the command's word at `+2`, byte-swaps it, stores it at animation object `+0x4c` and `+0x50`. | Sets current and saved/default interval. |
| `0x0015a2ed` to `0x0015a301` | Adds animation `+0x4c` to global state `+0x84`, stores the sum in animation `+0x48`. | Schedules the next animation update. |
| `0x00158988` to `0x001589a4` | Compares animation `+0x48` with global state `+0x84`. | Tests whether the animation is due. |
| `0x0015767d` to `0x00157682` | Calls `0x001dfa90`, stores its result in global state `+0x84`. | Supplies the shared scheduling clock. |
| `0x001dfaa5`, then `0x001dfb9f` to `0x001dfbb2` | Calls imported `Microseconds`; high word is scaled by `0x418937`; low word is divided by 1000 using multiply `0x10624dd3` and right shift 38. | Converts the microsecond clock to integer milliseconds. |

These locations establish the intended interval and its unit. They do not establish how much an actual legacy machine's event loop may delay a particular frame.

The opcode 1 wait handler is at `0x0015a6e4`. It ends the current interpreter update if the following command is nonzero. If the next command is end/opcode 0, it finishes immediately in the same update. A trailing wait before end therefore does not add another visible frame hold. Repeated waits elsewhere retain the current image group across subsequent scheduled updates.

The opcode 3 sound handler also confirms the resource-base convention: at `0x0015a56a`–`0x0015a589`, the decoded cue is added to the script header's collection/base word. For an Easel script with base 1000 and cue 8, the sound is resource 1008.

The current importer preserves image registration offsets, image-group order, repeat waits and sound cues from the 20 sound-bearing Easel routines `1095`–`1114`. Routine `1094` supplies the neutral face composition. Using the numerical order of the sprite bank is not equivalent to following those routines. See [the decoder](../scripts/mohawk-script.py) and [the importer](../scripts/import-ui.py).

## Reproduce the binary evidence

The extracted universal executable is at `artifacts/research/kidpix-original`, with SHA-256:

```text
a4d270edd09540a3a696a2b3e95f6dab29d52fd6bd6f1d3ed679b7990ed799a5
```

It contains i386 and PowerPC 7400 slices. `nm` shows that ordinary internal function names have mostly been stripped, but imported symbols and C++ RTTI names remain. Examples include `Rembrandt::RScriptComposer`, `Rembrandt::RTimer` and the painting-effect classes. This is sufficient to recover useful entry points and relationships before installing a decompiler.

The local inspection files are ignored artifacts:

- `artifacts/research/disassembly-i386.txt` — `otool -arch i386 -tvV` output, with imported call names and instruction addresses.
- `artifacts/research/imports.txt` — `otool -arch i386 -Iv` output.
- `artifacts/research/strings.txt` — executable strings, including RTTI names and resource/error labels.
- `artifacts/research/symbols.txt` — `nm -arch i386 -C` output.

Regenerate the text disassembly without executing the program:

```sh
otool -arch i386 -tvV artifacts/research/kidpix-original > artifacts/research/disassembly-i386.txt
otool -arch i386 -Iv artifacts/research/kidpix-original > artifacts/research/imports.txt
nm -arch i386 -C artifacts/research/kidpix-original > artifacts/research/symbols.txt
strings -a artifacts/research/kidpix-original > artifacts/research/strings.txt
```

For deeper class analysis, the `RScriptComposer` RTTI string is at i386 virtual address `0x0024faa0`, type information at `0x00327f68`, and vtable function entries begin at `0x00327f58`. The entries include `0x0015ec6e` and destructors near `0x0015efc6`. This class is a useful script-composition lead; the timing claim above comes from the actual interpreter and scheduler rather than from that class name.

## Reverse Engineer Anything

The canonical project is [morluto/rea](https://github.com/morluto/rea), with official documentation at [rea.tools](https://rea.tools). It exposes analysis through MCP and a CLI. Its [native-analysis guide](https://rea.tools/guides/native/) uses a separate native engine such as Hopper, Ghidra or IDA to return pseudocode, instructions, callers, cross-references and raw bytes. REA does not itself recover original source merely by inspecting a file name.

The [setup guide](https://rea.tools/get-started/) documents the registration workflow and restart. Neither REA nor a native decompiler was installed during this investigation. This Mac currently has `otool`, LLVM `objdump`, and Java 17/8; no Ghidra, Hopper or Rizin installation was detected. A compatible native engine and its required Java/runtime version must be chosen before connecting REA. Check the chosen versions together: the REA native guide and the latest [Ghidra getting-started documentation](https://github.com/NationalSecurityAgency/ghidra/blob/master/GhidraDocs/GettingStarted.md) may describe different supported Ghidra/JDK versions.

## Next focused investigations

1. Extend the [button rollover work](button-animation.md) to unsupported compound scripts and paper-canister routines. Preserve the extracted event order and source intervals, then test interruption and pointer transitions in the browser.
2. Follow dynamic replacements of native `MBTN` state-script slots to resolve remaining selected/pressed behavior. Ordinary rollover dispatch and its repeat/cancellation flags are established; sprite numbering alone does not establish the remaining mappings.
3. Map the original `General.MHK` cursor IDs to tool constructors, retaining cursor hotspots. Disassembly currently shows cursor ID 10017 at calls `0x00117e50` and `0x00134cac` through virtual method offset `+0x98`; those two call sites alone do not identify every tool-to-cursor mapping.
4. Use a decompiler for brush stepping, mixer formulas, animation interrupt rules and path interpolation when resource scripts and configuration no longer answer the question. Retain raw addresses and byte evidence alongside any renamed pseudocode.
5. Eventually compare against a running original. Static analysis establishes rules and constants; native recordings are still needed to validate event-loop delays, sound onset, animation cancellation, cursor feel and platform rendering.

No overall native-parity percentage is inferred from this static evidence.
