# Bounded media read recovery

Original public failure cause: **UNRESOLVED**. The 2026-11-11 17:14:17 GMT sound18053 503 (ray a58eeeb5afe1610c-EWR) lacked Retry-After, matching the outer catch response shape. Neither the provider exception nor its stage was observed. This change establishes recovery for injected binding promise rejections; it supplies no retrospective forensic proof or Pencil latency result.

The existing two-attempt metadata/body loop now also handles rejected `MEDIA.head` and `MEDIA.get` promises. Each rejection consumes the current attempt. A retry starts with fresh metadata, re-evaluates HTTP conditions and ranges, and pins the next get using `onlyIf.etagMatches`. There are no nested retries, timers, client loops or healthy-request extra calls. A terminal rejection rethrows to the existing structured `media_read_failed` log and 503/no-store response without Retry-After. Metadata races retain the existing exhausted-loop 503/Retry-After:1. First rejected reads produce a structured `media_read_retry` log with key, stage, attempt and error string; no request headers or environment dumps are added.

Read repetition has no object mutation side effects. This is an intentionally bounded recovery policy, not an error classifier: permanent binding promise failures can consume the second attempt too. No undocumented provider code parsing is used. Authentication/configuration failures still require repair. Retrying every rejected read is not claimed to implement provider-specific backoff guidance.

Method invocation and get-option construction remain outside the await catches, as do headers, validators, range handling and Response construction. Synchronous contract errors and handler programming errors do not retry. An asynchronous bug inside an implementation of the binding is indistinguishable from another rejected binding promise and may consume the retry; the scope assumes the actual platform binding implements its documented promise contract.

Returned streams pass directly into Response. No body is buffered, consumed or reused by recovery; nothing retries a later stream error. Under documented conditional-get semantics an unsuccessful condition produces metadata without a body, so the existing race branch has no body to cancel. No new post-get metadata comparison or body-discard path was introduced. A provider violating that contract is outside this candidate. No request-abort support or physical-device cancellation behavior is asserted.

## Evidence and limits

- Real-handler/binding tests: fail-once head/get; synthetic complete PCM WAV Range bytes=0-; changed metadata with Range/If-Range/If-Match; persistent and mixed race/null/rejection budgets; HEAD/validator fast paths; healthy counts; synchronous contract/header failures; interleaved requests; late stream failure; cache isolation and fresh-byte cache population.
- Healthy HEAD: head1/get0. Healthy ordinary or ranged GET: head1/get1. Head fail-once: head2/get1; get fail-once: head2/get2. Maximum: two heads and two gets, with each failed head skipping its get.
- The independent original-WAV Node seam replay returned complete 2462-byte 206 responses after each injected failure. SHA256: `58599701e19d873aeda3abff970560447fe6b108d49bf3215f5e4bb601d4ee5d`. No production fault injection occurred.
- Worker suite 29/29; full npm suite 371/371; private Cloudflare build and installed Wrangler 4.158.0 dry-run passed. Dry-run proves packaging, not remote R2 runtime behavior. Detailed commands, logs and final integration restrictions are in `artifacts/t3/media-read-recovery/HANDOFF.md` in the prepared checkout.
- Compatibility remains 2026-11-09. No flags, dependencies, cache keys, media, application assets, version, observability configuration or UI changes.

## Primary references retrieved 2026-11-11

- [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/): head metadata/null; get stream/null/conditional metadata; `onlyIf`, ETag and range options. Conditional gets enforce the selected ETag; this does not promise upload-version identity across equal ETags.
- [R2 errors](https://developers.cloudflare.com/r2/api/error-codes/): Workers operations throw exceptions; missing objects use null. Service and permanent failure categories both exist. The actual historical exception remains unknown.
- [Workers streams](https://developers.cloudflare.com/workers/runtime-apis/streams/): direct readable-stream Response construction preserves streaming; errors after response headers cannot be repaired by this loop.
- [Wrangler command index](https://developers.cloudflare.com/workers/wrangler/commands/) and installed `wrangler deploy --help`: dry-run, outdir and assets flags. The attempted `/commands/deploy/` URL was unavailable; installed help supplied the applicable command evidence.

## Independent review and integration

Independent review found no release objections within the fixed read-retry,
HTTP, stream and cache scope. All 29 affected cases and seven independent
boundary cases pass, including 25 ordered mixed-outcome combinations. Prior
source controls fail as intended. Both independent original-WAV replays return
complete 2462-byte 206 responses with the pinned SHA-256. Parent integration
passes all 371 Node cases and repeats both WAV failure-stage checks.

The 0.28.1 maintenance release retains the existing compatibility date, API
contracts and application rendering. Release packaging, scoped media-heavy
built-browser checks and selected public acceptance remain pending. This is
fault-class recovery evidence, not provider fault reproduction or a claim that
the historical 503's cause has been identified.
