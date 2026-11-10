# Bounded original Windows attempt with genuine installer PATH

One push, one windows-2022 job, one original app launch. Preserve the actual
runner token/session; Default/elevated/HIGH is not a standard user. No app,
configuration, machine PATH, policy, token or runtime search override.

Reuse the faithful extractor and deterministic MSI COM cleanup from the prior
original startup smoke. Pin outer vendor EXE, decoded MSI, registered installed
app version/hash, Apple bundle bytes/hash/Valid Apple Authenticode, QuickTime MSI
and three runtime module hashes. Install bundled AAS and QuickTimeEssentials
normally once, original app MSI normally once. No optional features or repair.

Registry32 QTSysDir and QuickTime.qts folder must identify the canonical official
QTSystem directory. The genuine post-install Machine PATH must include that
same directory. Child environments use an explicit Windows variable allowlist
and retain only genuine Machine PATH Windows directories plus that exact
registered QTSystem entry. Reject reparse directories/files and missing gates.
No CI/provider/token variables are passed to vendor/helper children.

Separate x86 prerequisite checks normal full-path QTS loading and all three
exports, unloads QTS, then loads the real external QTMLClient and initializes
with flags2/EnterMovies and balanced cleanup. This is not equivalent to the
embedded application stub. No SetDllDirectory, preloading into app, injection
or spoofing. Failed gates stop; no remediation or retry.

Observe owned original-process windows/UIA only. PrintWindow may omit message
content. Client-only CopyFromScreen requires foreground ownership, screen bounds,
and no earlier visible overlapping window in z-order before and after capture.
No desktop dump. At most six PNGs under50MB, UTC and elapsed capture times,
window/client geometry, UIA, app token/session, module paths and file build.
Only one verified visible trial button invocation with explicit trial context;
stop on EULA/activation/expiry/login/payment/unknown dialogs. No guessed inputs,
About shortcut, stroke, Undo or Firehose. Process closes normally then bounded
owned-tree stop; scratch removed in finally. VM disposal is final containment.

Sparse credential-free checkout, pinned official actions, read-only contents,
20min job/25min wall/3min queue cap. JSON and owned PNG only, retention3days.
No app/media/profile/trial state/credentials/installers/DLLs uploaded. No audio
claim. Parent must inspect raw captures and metadata; accepted references0/17.
Windows2.2.1.271 remains distinct from Mac2.2build615.
