# Stamp source pixels and browser PNG presentation

The candidate correction changes tests only. Original source composition and
browser presentation are separate checks: all 29 raw-source pins remain intact,
while live controls are compared with independently presented original PNGs.
No rendering, input, audio, asset, baseline or pixel-tolerance change is made.
Independent correction review found no integration objections within this scope.
The standard WebKit population now includes the Stamp suite; its expanded full
run passes all 647 cases with the three existing explicit skips.

## Diagnosis

At accepted source `f7abaa9489ecb3a5ea4d6cabe3c8e43def493327`, the unchanged
Stamp suite passes all 13 Chromium cases but fails ten WebKit cases. Source
checks pass in both. A standalone PNG control reproduces the arrow discrepancy
without the application, controller, canonical helper or frame metadata.

At source coordinate (330,666), original sprite RGBA is (74,101,170,48), over
opaque backing (76,105,171,255). Node's straight-alpha composition produces
(76,104,171,255); Chromium presents (75,104,170,255); pinned WebKit presents
(74,104,170,255). A synthetic one-pixel PNG reproduces the same loading-path
effect. WebKit's transparent PNG readback has red 69 at alpha 48, corresponding
to a premultiplied contribution of 13, while its raw ImageData control retains
14. No complete engine-internal rounding algorithm is inferred.

Further independent original-PNG controls match initial arrows, editor and
size actors exactly. Their Node-oracle discrepancies are respectively 38, 5
and 25 channels; canonical readback and visible Studio agree. This supports a
presentation-oracle correction, not changing runtime pixels to accommodate a
straight-alpha expectation. The exploratory multi-pose probe timed out after
transferring large raw arrays; its receipts and failure remain preserved. No
deadline was increased or that incomplete run counted as a passing suite.

## Independent contracts retained

- The original Node compositor still verifies all 29 source RGBA hashes.
- The presentation helper loads original PNG bytes from local inputs as data
  URLs, independently of application requests and actor output. It imports no
  runtime renderer/controller and reads no actor pixels, style or metadata.
- Source-space placements, clips, backing and frame parts are supplied from
  the existing manifest/pose selection. The helper uses an unscaled PNG draw
  into its own canvas and returns only the expected footprint pixels.
- The normal assertion still requires zero bad channels at the existing
  tolerance of one, zero visible bad channels and zero alpha outside ownership.
  Canonical geometry/placement, all 26 live groups, boundary script identities,
  restoration, input, cue and lifecycle checks remain required.
- Raw-source fidelity is not inferred from the browser presentation helper.
  Engine presentation is not evidence of native application pixel fidelity.

Nine negative cases exercise the same normal footprint assertion: wrong pose,
shifted registration, source channel corruption, backdrop channel/alpha
corruption, omitted backdrop, and actual actor-canvas channel corruption,
missing restoration at a source-transparent pixel, and outside-footprint ink.
Each requires a healthy comparison before the mutation, the expected pixel
assertion rejection, and a healthy comparison after restoration. Decode/setup
errors cannot satisfy the expected rejection. No mutated original file is
written.

## Scoped validation

The four-lane matrix passes without skips, errors or flaky results:

| Entry | Chromium | WebKit |
| --- | ---: | ---: |
| Development | 82 | 81 |
| Private production build | 79 | 78 |

These 320 cases include all 22 Stamp checks in each lane, Stamp Editor and
owned-audio regressions, and the established development-only 702-frame
renderer differential in both engines. Original source pins and assertions
remain in the populations. Built-module and Chromium-CDP exclusions retain
the established settings.

The exact old Stamp boundary test is also run against the unchanged runtime
in WebKit development and built entries. Both fail at the intended assertion:
38 bad and 38 visible channels, zero outside, rather than a setup failure. All
old failure traces, initial diagnosis and the transfer-heavy exploratory probe
remain retained alongside the correction receipts.

Reproduction and JSON/log receipts are under
`artifacts/t3/stamp-webkit-correction/`; run `matrix.sh` from the repository
root with the existing dependencies, original media and pinned browser image.
The runner requires the rootless Docker endpoint, uses read-only source/media
mounts, owned build/cache outputs, and holds the host browser-validation lock.
No installation, system socket, elevated operation or native execution occurs.

The application stays at accepted 0.28. This does not verify actual iPad
latency, foreground-idle behavior, audible delivery or IME behavior. Native
references remain 0/17; enlarged vacuum remains disabled and Pencil preview
defaults off. The separately preserved sound-delivery 503 remains unexplained.

## Independent review and standard coverage

Independent review passed all 88 Stamp cases across the four entries, six added
network/visible-corruption probes, 27 trace-retention repeats, eleven source and
parity cases, and 47 source asset hashes. Both old-oracle WebKit controls still
fail at 38 bad and 38 visible channels with zero outside. The review identified
no actionable findings. Its initial request-corruption probe did not force a
fresh image request; those setup failures were retained, and the corrected
probe explicitly requires an intercepted request before accepting rejection.

The live-snapshot-plus-manifest pattern establishes rendering for the reported
pose; it cannot defeat coordinated falsification of both snapshot and output.
Hardcoded boundary identities, state/input checks and complete live-group
coverage supply separate controller evidence. This pre-existing limit is not
replaced or obscured by the presentation helper.

The standard WebKit configuration adds the 22 Stamp cases without removing any
existing case or changing exclusions, timeouts, retries, profiles or tolerances.
The expanded population lists 650 cases. Its frozen full run at
`62766065949af60d860fc95003ba2ba2a6bc15eb` passes 647 cases with the three
existing explicit skips, zero unexpected/flaky results and zero runner errors.
All 362 Node checks pass. This full acceptance is separate from the scoped
review, and changes no application code or physical-device claim.
