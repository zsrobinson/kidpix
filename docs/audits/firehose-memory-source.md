# Vacuum or hose memory: bounded source finding

The supplied source supports an omitted moving Firehose actor, but cannot establish
that it is the exact animation remembered by the user. No original moving-render
reference was collected; accepted native references remain0/17. Mac2.2/build615
and Windows2.2.1.271 are distinct builds. Windows reached EULA only according to
the current parent runtime handoff; older QuickTime/elevation failures in runtime
reports are historical. No EULA was accepted or native process started here.

The guide's printed page23 (local user-guide.txt lines1049–1083) explicitly separates
Firehose Screen Eraser, Big Eraser effect selection and Mini Eraser dragging. It
does not describe a vacuum, the hose's trajectory, its placement or terminal pose.
Big Eraser's supplied factory/panel124–137 maps to ClockFace, IrisHeart, IrisStar,
Windmill, PageTear, SquareSpiral, Implode, Engulf, Fade, Explode, Kaleidoscope,
Waterfall, WipeRight and Vanish; none is identified as a vacuum. That does not
exclude a remembered different Kid Pix version or imagery within an effect.

Read first: root firehose-actor-placement README/evidence/source-excerpts,
firehose-integration-next, runtime-readiness, Windows-native-runtime and subsequent
QuickTime-repair reports; then guide, current source and addressed disassembly.
The relevant additional crosscheck for this feedback is that script3900's eleven
single-part draw commands all use authored(0,0). Thus its encoded motion is
**changing bitmap poses at a common anchor**, not an authored sequence of eleven
wandering anchor coordinates. Visual motion within453×493 images can still look
like a moving hose. No native runtime trajectory follows from those zero offsets.
The header[-100,500,376,1020] is not the453×493 bitmap footprint.

Firehose event266 replaces button1089's animation with3900 before constructing the
separate RBubbleCleaner139. Current `firehose-operation.js` implements the page-wipe
transaction and frozen composite via `native-big-eraser.js`; actor.enabled remains
false and the enlarged actor is not fetched/rendered. Ordinary rollover1091 is a
different animation. Big Eraser124–136 uses unsupported QFX engines and137 is
Vanish, so enabling one of those cannot restore this missing Firehose actor.

The placement audit's blockers remain valid; this pass found no new evidence that
closes them. Required activation-entry values: button1089 animation+56,+c4,
+60/+62/+64/+66 and REGS-handle validity after forwarded event266 handlers;
actual layout descriptor S/D plus final window presentation transform; inherited
graphics target/clip for +c0=0; terminal +57, visibility+71 and owner state+84
through cleaner completion1333/0x2004 and subsequent replacement. Callback538ac
ignores−1 and skips restoration for−2/script3900; end-of-script is not proof that
the actor should disappear at1000ms or at cleaner completion.

Safe next step is a static data-flow trace of those exact activation-entry fields
before attempting integration, followed by legitimate native captures at activation,
pose11 and cleaner completion with target/clip/display metadata if static tracing
cannot resolve them. Preserve original poses and keep the actor disabled until
geometry and lifetime are proved. This report adds no guessed actor animation,
new effect implementation, media, native execution or full-parity claim.

## Corrected owner/base trace

A later byte-checked trace corrects the helper-output interpretation in the
earlier placement artifact. At `0x15b22a`, outputs are `(-drawX,-drawY,
headerX+drawX,headerY+drawY)`. The reset branch writes header-plus-draw into
the base pair `+0x60/+0x62` and negative draw into offsets `+0x64/+0x66`.
Normal replacement with valid REGS and non-sentinel `+0xc4` retains the base
and writes the negative first-draw coordinates into the offsets. Script3900's
first draw is zero, so that branch has zero offsets; its header origin is not
added to the retained base. This supersedes steps3/4 of the older ignored
`firehose-actor-placement/README.md`; the original evidence is preserved.

The ordinary button constructor supplies no position, but successful first
selection can replace its zero base. Ordinary redraw and explicit position
writers also change that base. Forwarded event266 handlers, position history,
script-range bank selection and REGS handle validity remain unclosed. Therefore
the correction does not establish a numeric activation origin, inherited clip,
final presentation or terminal lifetime. Keep the enlarged actor disabled.

Primary addressed instructions, hashes, an independent GNU disassembly and
24 exact byte guards are retained in `artifacts/t3/vacuum-owner-entry/`.
Reproduce without executing original code:

```sh
python3 artifacts/t3/vacuum-owner-entry/probe.py --source /home/zsrobinson/code/kidpix
```

The checks passed on the server. No application, source media or runtime
behavior changed; native references remain0/17.
