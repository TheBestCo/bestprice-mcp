# Stdio input and invocation stability — continuation, 20 September 2026

This round continues from `bestprice-mcp/main` at
`4f2c65adaf3c19048df04b29fd098718771f2e81`. It does not change the hosted backend,
storefront, frozen datasets, qualification ledgers, reviewer, CI rules or deployment gates.

## Corrections

The stdio input validator now bounds each newline-delimited frame to **8 MiB**.
It counts raw UTF-8 bytes before decoding, including carriage returns but excluding
the terminating LF. The budget resets only at LF, matching the SDK's framing, and
applies to unfinished frames. A long-running stream of separate valid frames is
not capped in aggregate. This protects the SDK line buffer; stream backpressure
alone cannot do that. Oversized input closes stdin with an unsuccessful exit and
payload-free diagnostics. Valid in-budget bytes and malformed-UTF-8 rejection
remain unchanged. The exported helper permits an explicitly validated
`maxFrameBytes`; the stdio entrypoint uses the 8 MiB default.

Clean shutdown observes validated writable `finish`, not readable `end`. The latter
waits for a consumer, but the bridge attaches its SDK reader only after upstream
startup. A closed host with empty or small buffered input could therefore wait on
the upstream initialization deadline. Writable completion still follows UTF-8
flush, so truncated bytes cannot be mistaken for clean EOF. This does not claim
immediate EOF detection while unread upstream input is held behind backpressure.

The WebMCP reference runtime snapshots invocation options exactly once, validates
any supplied signal using its native brand/state, and rechecks registration
ownership before executing. Invalid falsy values are refused rather than silently
removed by a truthiness filter. Getter failures refuse without executing a page
tool. The previous private completion signal, genuine abort reasons, sibling
isolation, confirmation lifetime, synchronous return identity and handler errors
are preserved. The storefront already snapshots these options and is not rewritten.

## Reproduction and evidence scope

The 41 new dependency-free defect regressions produce **12 passes / 29 failures**
on the original three implementation files and **41 passes / 0 failures** on this
candidate. Including the actual offline `npm pack` artifact test and existing
focused lifecycle/input tests gives **200 passes / 0 failures / 0 skips** on local
Node 22.16.0, repeated at concurrency 1, 4 and 8.

The package test extracts the real npm tarball, verifies required runtime files
and source bytes, and executes the shipped input validator. It does not claim that
an external host installed or deployed this revision. Offline subprocess tests
substitute only dependency imports to isolate a stalled startup; they are labelled
as such. `test/stdio-eof-sdk.test.js` adds three separate genuine-SDK, actual
subprocess/loopback HTTP regressions for full-checkout CI. SDK dependencies were
not available locally; CI execution is a separate verification requirement.

Chromium 144.0.7559.96 ran the exact runtime module bytes with a synthetic
registration adapter and native `AbortSignal`, without network. The original
passed 7/14 checks and the candidate 14/14, including cross-realm signals, stopped
real abort events, fabricated public events and post-receipt cancellation.
This is browser JavaScript regression evidence, not native WebMCP shopper-task
qualification and not a substitute for 5 x 47 real-model/browser journeys.

No 100% production reliability, fleet deployment, current installed-host identity,
completion-guard experiment or Shopping Brain certification is claimed here.
