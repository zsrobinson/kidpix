# One bounded original Windows startup smoke

Dedicated push-only workflow; no dispatch, schedule, matrix or rerun. Windows Server 2022,
20-minute job limit; external monitor cancels queue over three minutes or total wall time
over 25 minutes. Download/install helper has a ten-minute wall budget. One original
application launch and under one minute of visual observation. All failures end the run.

Inputs are downloaded directly from vendor HTTPS with normal TLS verification; outer,
MSI and installed executable hashes are pinned. No MSI properties bypass launch conditions.
The container reader implements the inspected 312-byte format and codec described in
ISx (https://github.com/lifenjoiner/ISx, revision
3c4177ddd0519244490ff8e78d380110c8dacdc8); only the decoded MSI is retained temporarily.
Its complete SHA-256 is checked before normal installation. No application binary or
configuration changes. Apple Application Support and QuickTimeEssentials are installed
through their normal bundled MSIs; the feature name is checked against the actual MSI.
No plugins or updater are installed. Reboot-required exit codes are failures.

Native scalar token queries use exactly four-byte buffers. Default token is explicitly
not a claim of non-admin status. Policy is only read. No standard-user account retry,
security policy modification, device driver, renderer shim or audio substitution.
Read-only diagnostics and real QuickTime InitializeQTML/EnterMovies precede application
launch. Third-party processes inherit an explicit normal Windows environment allowlist.
No CI credentials, provider variables, environment dump or trial registry export.

All MSI records, views, databases and installer COM objects are deterministically released, including error paths. Installed executable location is resolved through the original MSI key-file component registration and verified by hash and version before the required prelaunch scratch-removal gate.

The observer uses PrintWindow to capture only windows belonging to its one original process and bounded
UI Automation control names. It may invoke at most one enabled verified ordinary
Try/Try Now/Continue Trial button, after checking for refusal/expiry/activation/login text.
Unknown prompts receive no input. No coordinate input is guessed. Geometry mapping,
About, stroke/Undo and Firehose remain unproven unless independently visible and matched;
this conservative startup probe does not accept reference recipes automatically.
Windows 2.2.1.271 is distinct from Mac 2.2 build 615. No Mac timing/feel assertion;
877/878 Tp resource agreement has the known Mac tSCR18263 cue69 exception.

Only JSON diagnostics and a few owned-window PNGs are uploaded, capped below 50MB,
retained three days. No installers, application/media trees, profiles, dumps, keys or
trial state. Only owned processes/scratch are cleaned; VM disposal is the final boundary.
Accepted original references remain 0/17 pending review. Audio playback/recording is unproven.

Local validation before the sole push: PowerShell parser; actionlint; compilation of all
four helpers against Framework4 reference assemblies; review of the unchanged extraction helper against its previously verified full decode and pinned MSI SHA-256. No installer download is performed locally. No original Windows application/installer code runs locally.
Pinned action commits were resolved against official actions repositories before use.
