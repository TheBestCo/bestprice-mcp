# MCP and WebMCP request-lifetime hardening — 20 September 2026

## Reproduced boundaries

The SDK's logical request cancellation rejected the caller and sent a protocol
notification, but the physical fetch used its session signal. An unfinished POST
or response body therefore survived the request's cancellation/deadline. A complete
SSE result could also leave its HTTP response open. `src/bridge.js` now carries a
request-owned wire signal through SDK async work. Shared initialization/event
channels remain session-owned. Cancellation notifications receive an independent,
short transport budget so they are neither pre-aborted nor left unbounded.

Wire completion is deliberately separate from logical protocol cancellation: the
SDK retains an abort listener after results. Aborting that logical signal on
success emitted unnecessary cancellation notifications in an initial candidate;
existing tests caught this, and the implementation now ends only the wire signal.
Late non-cooperative fetch responses are disposed without changing cancellation
reasons. These changes do not add retries or close healthy sibling operations.

`webmcp/src/runtime.js` detached a handler's cancellation after an immediate result,
even if the result described a still-running confirmation watcher. Native signal
composition now preserves the caller/registration lifetime after waiter cleanup.
Synchronous return identity and exceptions remain unchanged. The real storefront
already has this composition; this patch corrects the public reference runtime,
not a second deployment of the storefront fix.

`webmcp/evals/browser-session.js` allowed an unsolicited partial reply following a
completed frame to be completed by the next request. Unsolicited bytes now poison
the session immediately. Its request budget also now includes serialization and
elapsed checks around reply parsing. Expiry before dispatch leaves the session
reusable; ambiguous expiry after dispatch closes it without replaying the action.

## Verification before default-branch publication

Baseline: `3db01be80953f11c0bf76dc21465b502122140e0` (runtime inherited unchanged
from `35270327626806f101185d7de6bd5ed3062476dc`). Genuine Git history and exact locked
dependencies were captured by read-only workspace run `35497938750`. Local Node
22.16.0, installed MCP SDK 1.30.0. No package or lockfile changes.

The final 27 new tests produce **1 pass / 26 fail on the original source**, then
**27 pass / 0 fail / 0 skipped / 0 cancelled** with the repair. All 27 pass again at
test concurrency 1, 4 and 8. Three tests use native fetch and an actual loopback
HTTP server: unfinished responses close on cancellation, deadline and successful
SSE completion, while the same session remains usable and tools execute once.
The other controls use the real SDK over controlled streams, actual harmless
JSON-lines subprocesses, or a synthetic registration adapter, explicitly labelled.

The complete local repository suite passes **634 tests, zero failures and two
existing skips**. Biome check passes with one pre-existing warning in
`webmcp/evals/run-evidence.js`. No existing assertions were weakened. Initial
candidate failures are retained in the execution evidence, not called passes.
The temporary source-capture workflow is removed after use; ordinary CI remains.

## What this does not certify

The independently captured public MCP run `35496467429` at 07:18 UTC on
20 September passed both Accept lanes and all four tools on sampled revision
`4373befddab93687f54db0629e4a1320facb3e95`. That predates this patch and does not
attest a deployment of these local bridge changes or fleet-wide uniformity.

Native diagnostic `35496905271` passed its redirect/frame/popup safety controls
and three listing read tools, but stopped with `no_safe_visible_product_link`.
It observed storefront release `516891371b73026b252498f8670a0245725eb721`, not the
latest master. It is not a passing product-page or native-model qualification.

No hosted backend/storefront deployment, merchant navigation, billing operation,
actor prompt, frozen case, grader, threshold, historical artifact or experiment
registration is changed here. Fresh CI, live probes, the registered native-model
campaign and independent Brain quality remain distinct verification steps.
