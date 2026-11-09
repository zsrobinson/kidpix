# Secondary tool-control motion

The Ubuntu source recovery exports 59 controls from 11 original MBTN tables,
179 complete programs and 235 authored draw groups. The current runtime enables
23 selector rows, 69 programs and 92 draw groups: nine Drawing styles, six
Painting mode choices, six size rows and two Mini Eraser shapes. Size rows are
shared by multiple owners; this is a count of unique source rows, not rendered
button instances. Stamp, Text and Grab action controls remain static.

## Source and state rules

`scripts/secondary-motion/extract_inputs.py` reads the supplied Mac DMG using
7-Zip and the legacy installer index. The portable exporter reuses the existing
strict Mohawk, bitmap, bytecode and region codecs without modifying them or
requiring macOS Foundation. Dependencies are pinned in the export directory.
Recovered Tp.MHK SHA-256 remains
`00e92bdce3a7aaf3b72b18a38928f163ba096e7a6c5a3371b5345a3df4482ae5`.

The generated `ui/secondary-motion/manifest.json` preserves native table rows,
all four state slots, command arguments, complete frame registrations, sound
cues, terminal checks and exact kind1 rectangles. Paths are relative to `ui/`.
Sprite identity includes the collection and one-based bitmap number. Unflagged
Stamp bitmap references still retain their nonzero source registrations.

Enabled groups use the recovered mode2 controller. Selected state shares the
tracking script and preserves its progress; auxiliary playback is finite and
canceled on leave. Secondary rows are outside primary material callback ranges
and use ordinary bitmap composition. Drawing and Painting/Mixer load size table
18200; Mini Eraser uses 18200 for Round and 18201 for Square. Native disabled-size
views do not acquire animated size controls.

`src/native-secondary-motion.js` maps source row identity explicitly to existing
application choices. It retains independent owners for styles, modes, sizes and
shapes across rerenders, and binds only the controls present in that view.
Unsupported actions and state-slot patterns are not assigned selector behavior.
Static controls remain usable when optional assets fail; hover can retry an
unready retained owner as well as an initial failed load.

## Rendering and validation

The export contains 143 PNG/raw sprite pairs, 22 decoded WAVs and 60 clean pages.
Clean pages omit both primary and secondary control art. The runtime uses them
only to restore each group's complete pose bounds; existing primary actors and
dynamic option content retain ownership of the remaining tray. It does not
replace the full tray with an incompletely restored page.

Independent source tests compare all 179 programs and 59 table rows with the
pre-existing audit, and check decoded sprite channels, sound PCM, regions and
clean-page restoration. Drawing and Stamp special clean-page recipes are outside
the general restoration test; enabled Drawing selectors have separate actual
studio pixel checks. Broader Stamp integration needs dedicated recipe coverage.

Browser tests in `secondary-motion.spec.js` compare source pixels in both the
actor canvas and visible studio, retain every tracking pose, and exercise input
cancellation, shared progress, owned sound completion, loading failure and retry.
The suite is included in dev, built and live configurations. Asset verification
checks raw/PNG/backdrop/WAV hashes and all referenced programs and frame parts;
an isolated corrupted-WAV test ensures original imported files are untouched.

## Original Windows evidence

The vendor Windows trial identifies as 2.2.1.271. Static extraction found 877 of
878 Tp resources identical to the Mac edition, including every bitmap and sound.
Program 18263 omits Mac sound cue 69; matching assets do not establish identical
platform runtime behavior. Installer/source evidence remains in ignored research
artifacts. Original execution, native motion/audio timing and subjective feel
remain unverified; accepted native references are still 0/17.
