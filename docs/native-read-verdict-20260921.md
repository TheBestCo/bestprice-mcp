# Native read diagnostic: retain failures through browser cleanup

This is diagnostic integrity, not a change to the storefront, MCP bridge,
shopping behavior, public tool schemas or real-model qualification gates.

## Observations

The unchanged pinned native read probe at 2026-09-21 11:05 UTC passed all seven
read contracts and the redirect/frame/popup denial controls, but recorded one
CDP interception failure. Its overall verdict correctly remained failed.
The original handler counted that failure without retaining a safe category,
so neither its cause nor its harmlessness is established.

A subsequent diagnostic-only observation with categorical logging at 11:14 UTC
passed all controls and did not reproduce the interception error. That later
success does not erase the original failed run or establish continuous stability.
Both observations used Chrome 152.0.7977.82 and sampled storefront release marker
`5c6be9f3bd736bf07c624b3745204efb2a47e204` on home, listing and product pages.
A release marker is not a byte-level bundle audit.

## Reproduced cleanup defect

The old script marked success before closing the browser context. A guard or
budget failure delivered during cleanup could therefore leave a successful
written receipt and zero exit code. Two fault-injection cases execute the actual
script's final cleanup block with late browser-event stand-ins; they fail on the
original source and pass with the correction. They do not invoke a live browser
or copy the cleanup implementation into an alternative test implementation.

The corrected script finalizes its verdict after context/browser close and before
writing the receipt. Late recorded guard/budget failures make it nonzero and
unsuccessful. Earlier failure causes remain intact. Failed interception commands
retain at most eight rows of bounded categorical metadata, while the full count
continues increasing. Raw URLs, payloads and error messages are not recorded.

No request allow/deny rule, limit, assertion, native tool case, prompt or release
benchmark has been removed or relaxed. A clean run stays clean; an unset verdict
cannot become a pass. This specifically closes the demonstrated cleanup window,
not every theoretical browser race or all end-to-end shopper failure modes.

## Qualification custody

Run `35594189362` at source `5f83489e3eeb00fc3da79590764eb5e0a1fc73d9` qualified
these exact three candidate Git objects after repository formatting:

- `scripts/native-read-smoke.mjs`: `c3c088d788a70ee54017d56e0450da573c811fb9`.
- `scripts/native-read-verdict.js`: `83c28fbe14b43ab1a01bf707d63163d704d8d7c5`.
- `test/native-read-verdict.test.js`: `f4dc3524d7a87a34cda9290e69e527ec091f8bf7`.

Original cleanup regressions: 10 tests, 8 passed, 2 assertion failures.
Candidate: 10 passed at concurrency 1, 4 and 8, no failures/cancellations/skips.
Full suite: 965 passed, 2 existing skips, no failures/cancellations/todos.
Repository lint/format checks passed. The candidate's protected native read run
also passed seven read-tool contracts plus navigation denial controls. It made no
merchant clicks and used no action tools, model, user-agent override or polyfill.

Qualified artifact SHA-256:
`61263822f39503b6e29e509794d2a26dbfb54642f373a62b6ce649dc3cfa18a7`.
Its downloaded archive, file hashes, TAP counts and live receipt were checked
before publication. Temporary qualification/object-storage workflows are removed;
normal final-main CI remains required. No new distribution version is published.

The 5x47 real-model/native-browser release qualification, completion-guard
preregistration and separate Shopping Brain outcome certification remain distinct.
These read-only diagnostics do not establish external adoption or revenue lift.
