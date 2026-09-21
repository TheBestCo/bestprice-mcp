# Pipe failure and repeated WebMCP lifecycle stability

21 September 2026. Baseline: `9d05b3063df93761d287f91275c94365b83b3358` on main.

## Failure reproduced and corrected

The stdio entrypoint did not observe stdout/stderr stream errors. A host closing its
logging pipe could crash an otherwise healthy protocol. A broken protocol-output pipe
could exit through Node's unhandled error path without closing the upstream bridge.

Diagnostics now have an error listener before the first write. A broken stderr disables
only diagnostics; healthy protocol work continues. A stdout error is fatal to the protocol
and enters the existing bounded, idempotent shutdown. Shutdown records the requested exit
status immediately: an unresolved cleanup promise alone cannot keep Node alive, and must
not turn a failure into a natural zero exit. The existing two-second shutdown watchdog,
input validation, byte limits and signal handling remain intact.

Six new actual-OS-pipe entrypoint tests use explicitly substituted SDK/bridge imports to
observe close calls. The unchanged baseline passes one and fails five; the candidate
passes six. Both startup and later diagnostic-pipe loss, stdout loss with either stderr
state, unresolved cleanup and healthy EOF are included. This is not SDK qualification.

Three separate `stdio-pipe-sdk.test.js` tests do not replace any dependency imports. They
use the real entrypoint, installed SDK and a loopback HTTP server, and require one upstream
session DELETE after a protocol-pipe failure or ordinary EOF. The installed-package verifier
runs these tests outside the checkout and raises its complete-test floor from 72 to 75.
A new control rejects the previous 72-test suite, and 73/74-test partial runs. All existing
zero-failure, zero-skip and byte/dependency custody checks remain.

## Repeated browser lifetime control

`webmcp-lifecycle-soak.test.js` exercises 25 registration generations and 400 mixed calls.
It checks immediate receipts, genuine cancellation despite stopped propagation, fabricated
abort events, sibling isolation, caller reason identity, late rejection/fulfilment,
confirmation-signal cleanup, retired callbacks and exactly-once effects. Optional observer
rejections are injected. The storefront has a corresponding invocation test; runtime code
and its 16 ms truthful-receipt allowance are unchanged in this round.

Before publication, 158 dependency-free MCP controls passed at concurrency 1/4/8. An earlier
broader command also included a file requiring the unavailable local SDK; its dependency
load failure is retained separately and is not called a passing full suite. The real SDK
and full-history assertions must run in unchanged CI. The local storefront subset passes
25 tests. Network-free Chromium 144 exercised 100 generations / 3,200 invocations for each
runtime, with zero escaped errors, using exact source modules and a synthetic registration
adapter. This is lifecycle stress evidence, not real-model/native-WebMCP qualification.

## Reproduction and scope

```
node --test test/stdio-pipe-lifecycle.test.js test/stdio-shutdown.test.js test/webmcp-lifecycle-soak.test.js
# Requires the genuine locked dependencies installed by npm ci:
node --test test/stdio-pipe-sdk.test.js
node scripts/verify-packed-release.mjs /absolute/new/output-directory
```

No public MCP requests or merchant actions are needed by these tests. No feature, hosted
backend, shopping semantics, release ledger, benchmark, model prompt, grading rule or
qualification threshold changes. Passing pipe/soak tests does not certify every production
allocation, external client installation, storefront deployment or shopper task.
