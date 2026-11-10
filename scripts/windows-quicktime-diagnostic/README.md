# QuickTime prerequisite diagnostic

One push-triggered Windows job; no original application code execution.
Compile Probe.cs x86 with Framework csc. Run.ps1 downloads only pinned official
Apple QuickTime 7.7.9, requires Valid Apple Authenticode, installs bundled AAS and
QuickTimeEssentials once, then executes a fixed matrix of fresh read-only probes.

Discovery records only Registry32 HKLM Software\Apple Computer, Inc.\QuickTime
QTSysDir, QuickTime.qts folder and InstallDir. It approximates the documented
embedded discovery order, but is not the embedded binary stub and does not claim
identical path validation or secondary loader fallback. Full-path LoadLibraryA
uses default dependency search; forced-directory cases are explicit controls.
QTMLClient flags0/2 are external API calls, never labeled embedded initialization.
No app, licenses, trial state, media, policies, drivers or optional features.

Child processes inherit a normal Windows variable allowlist, without CI tokens.
Baseline PATH reproduces the previous Windows-only wrapper. Comparison PATH is
built from actual post-installer machine PATH entries restricted to Windows,
QuickTime and Apple Application Support roots. No machine environment is changed.

Each native probe is a fresh x86 process; cleanup balances successful initialization
and movie entry. Timeouts stop only owned process trees. MSI query records and
COM view/database/installer handles have deterministic release, reused from909f3c0.
Evidence is small JSON only, at most10MB, retained3days. Scratch is removed even
on failure; hosted VM disposal contains installed runtime. Native refs remain0/17.
