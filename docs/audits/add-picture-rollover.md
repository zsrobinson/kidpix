# Add Picture auxiliary rollover

This implements only Easel MBTN75 row23's auxiliary tSCR1128. Command301 and the existing `flipbook` activation in main.js remain authoritative: one slide addition and sound1032. Tracking1127 and unsupported1039 are outside this change.

## Source contract

The static contract at `artifacts/t3/add-picture-rollover-contract/README.md` in the research checkout records 20 guarded executable spans. The parent ran its checker before implementation. Resource1128 SHA256 is `cc8822ca3f4b2723aa4182bbf743e2dd7458369dfa87aacfcfb87c2f9f53754b`. The reachable prefix ends at consumed byte62; bytes62–71 (`800801ec011801020002`) remain opaque, unreachable only under this auxiliary's proved creation/repeat path. Their authoring meaning is unknown.

The source draws bank1000 images109,211,113 at ticks0,1,2, interval100ms, waits1/1/0, earliest restart tick3. It contains no sound. Full artwork is [933,582,79,170]; the native control clips to [933,592,79,95]. The suffix is neither padding nor an alternate supported program.

The old audit pins the preimplementation decoder (`9d602875ed076ce7ff4535c2904cb649d8b52da63a4664445a1d1fabf3cd718e`) and exporter. Those historical receipts are unchanged. This implementation intentionally changes those dependencies. Its new fixture and tests validate the new opt-in behavior; the old receipt is not evidence that the new decoder ran unchanged.

## Generation, export and runtime seams

`decode_script(data)` remains strict. Only explicit `resource=("Data/Easel.MHK",1128)` plus the complete resource hash enables the exception. It returns reachable events, consumedBytes62 and trailing hex/SHA256/classification. Mutations and unrelated resource identities still reject trailing data.

The exporter passes resource identity explicitly. For this exception it reuses existing `flipbook-0/1/2.png` paths, includes native clip/clean restoration metadata, and writes no1128 PNGs. A temporary synthetic export is compared field by field against `src/add-picture-rollover.json`. Normal exports retain their existing behavior.

`loadNativeUi` adapts the fetched manifest in memory only when its flipbook record identifies command301/state1126/1127/rollover1128. The shipped JSON supplies the immutable source-derived timeline to old published manifests that reject1128. Original manifests and remote media are untouched. The JSON is application metadata, not replacement original media.

The sprite binding leaves flipbook's backing at rest, retaining the native-control CSS class. The auxiliary uses a79×95 canvas, restores the corresponding `paint-empty.png` crop before each alpha frame, and draws at offset(0,-10). Its z-index5 is above the existing paper-canister canvas(z4), which otherwise repaints the clip's edge. It never hides or repaints the full backing, and restores it simply by hiding the patch. Outside-clip pixels retain their existing owners.

Malformed/missing restoration metadata, wrong decoded dimensions or failed frame/plate decoding leave the static backing visible. Missing clip metadata for1128 cannot fall through to full-image playback. The existing generic image retry policy is unchanged.

## Hosting policy and audio ownership

Fresh entry starts once. Movement inside preserves progress; source completion restarts at tick3. Leave, press, pointercancel, lost capture, blur, pagehide, hidden state and disposal invalidate pending readiness and cancel scheduling. Reentry starts at pose0. Hidden pages cannot start this clipped actor. These browser lifecycle policies are adaptations, not measured native foreground timing.

The silent timeline neither unlocks audio nor creates an owned cue. The generic stop path touches only audio owned by its actor; it cannot cancel action1032 or another actor's audio. Existing Firehose persistence/suspension/channel gating and library/tool/command owners retain their paths. Global app deactivation may independently retire other owners.

## Validation and limits

Source tests pin every byte of1128, reject all72 one-byte mutations and wrong identities/tails, check reachable order/no sound, and compare exporter metadata with the shipped adapter without exporting new media. Browser tests compare actual Studio screenshots against independently loaded local original PNG composition, including translucent pixels, all poses, outside-clip preservation and restoration. Static, missing-plate, baked-idle and full-image counterfactuals demonstrate sensitivity; no tolerance is relaxed. Chromium and WebKit use their own PNG/Canvas presentation, with local source bytes as inputs rather than actor pixels as expected values.

Coverage includes source timing, motion continuity/repeat, press/cancel/lostcapture/reentry, delayed decoding invalidation, hidden-page retirement, malformed/undecodable assets, single activation, mixed synthetic pen/touch retirement and scaled portrait/split layouts. Synthetic pointer retirement does not establish physical contact arbitration or device latency. Shared disposal still uses the existing generation invalidation/disposer path.

No new media, native execution, installation, download, version change, baseline acceptance, push, upload or deployment is part of this implementation. Native acceptance stays0/17, enlarged vacuum disabled, experimental Pencil OFF. Physical iPad latency, foreground idle, native final compositor feel, audio and IME remain unverified. Parent review, full release and public gates remain pending. Detailed commands, counts, failures and hash inventory are in the private handoff.
