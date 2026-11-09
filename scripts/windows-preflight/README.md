# Harmless hosted Windows capability probe

One push on `t3/d318dd34` runs one Windows Server 2022 job, capped at ten
minutes. The operator cancels if queued over three minutes or total wall time
reaches twenty minutes; there are no retries. No original application,
prerequisite installer, media, or remote desktop service is involved.

The installed Framework v4 x86 compiler builds the reviewed helper. It records
actual token type/elevation/integrity/group attributes, CLR bitness, session,
window station, desktop, input desktop, display/DPI, waveOut capabilities and
active IMMDevice render endpoints. The inventory records OS/image, display
driver, Framework release and read-only UAC values. Services alone never prove
audio. Endpoint presence does not prove playback or capture.

A small WinForms window must receive real click, typing and stroke input and
produce a screen-captured green patch and red stroke at known pixels. Session
zero, inaccessible/default-desktop mismatch, inadequate display, or failed
input/capture stops the probe. A passing window also records its own OpenGL
vendor/renderer/version; this does not establish application renderer support.

Only after desktop success may one disposable local account be created with
Users membership. Its random password remains in process memory. No policy,
window-station ACL or desktop ACL is changed. Only the scratch directory gains
an account-specific file permission. CreateProcessWithLogonW authenticates with
LOGON_WITH_PROFILE on winsta0/default. The child independently verifies no
Administrators SID, enabled Users membership, Medium integrity, non-elevated
status and elevation type other than Full before its own window probe. Any
rights/session/token failure stops; Default alone never proves standard user.

Owned child handles/account/profile/scratch are cleaned in finally paths, with
PowerShell fallback cleanup for the exact recorded account/process. VM disposal
is the final boundary on forced cancellation. Only named JSON and up to two
small benign window PNGs are uploaded, under 10 MB with three-day retention.
No passwords, environment dumps, command lines, token handles, profiles or
application content are artifacts. The helper never launches the original.

Action pins were resolved from official repository tag refs before the push:
- actions/checkout v4.3.1: 34e114876b0b11c390a56381ad16ebd13914f8d5
- actions/upload-artifact v4.6.2: ea165f8d65b6e75b540449e92b4886f43607fa02

Local validation: YAML parsed and bounds/paths/permissions inspected; C# and
PowerShell inspected for gate order, P/Invoke layouts, allowlisting and cleanup.
The Linux authoring host has no Framework compiler; actual compilation and
Windows API measurements happen only in the single authorized hosted run.
Accepted native references remain 0/17. A follow-up needs separate authorization.
