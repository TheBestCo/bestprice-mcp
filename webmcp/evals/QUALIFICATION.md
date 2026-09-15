# Native qualification

`npm test` validates the implementation. It does not authorize a release.

`npm run eval:check` first requires the actual BestPrice.gr checkout and PHP,
then validates native evidence. It does not substitute a fixture when the
storefront is absent. Set `BESTPRICE_STOREFRONT_ROOT` to its checkout path.

The browser command is a JSON-lines peer. One process owns one browser/tab for
a case. Each reply includes a persistent session ID, actual registered tool
descriptors, browser version, current URL, current document ID and observed
results. A later request must name the actual current URL and document; it must
not reload the tab between calls.

Session, document, URL and invocation are separate identities
(`native-evidence.js`). The run starts from the URL the browser actually landed
on when a canonical redirect kept it on the requested page, and refuses any
other landing. Each call reports its transition — `none`, `same_document` or
`new_document` (a same-URL reload is a new document) — and whether its result
was returned or lost when the navigation destroyed the page. A lost result stays
`null`: the grader accepts it as a transition only with an observed new
document, and never where the case requires result properties. A definite
result (a read, a refusal, an action the page confirmed) does not wait for a
navigation.

The supplied storefront runner uses Chrome's document.modelContext. It refuses
merchant/billing navigations browser-wide — main frame, subframes and new tabs —
before they reach the network, and records each refusal against the call that
caused it, by class only. A refused main-frame or new-tab attempt fails the run
even when the tool then reports success. Never remove that boundary for
qualification. Its behaviour is tested in real Chrome:
`node --test tools/scripts/webmcp-native-runner.test.mjs` in the storefront.

The peer process tree is owned by `browser-session.js`: close and timeout end
every process the command started, and any ambiguous reply ends the session.
An action whose outcome is uncertain is never retried.

The actor receives the shopper task, current descriptors and prior tool results,
not frozen expected tools or grading criteria. It returns either a tool call or
a terminal answer/refusal/clarification. A terminal does not require a tool field.

Run native-run.mjs with --dry-run --print-artifacts=true for diagnostic runs.
These runs do not mutate the append-only release ledger. Source changes and
the deployed storefront must be pinned before collecting release evidence;
a diagnostic against production is not proof that local changes are deployed.

## Final-answer review

Structural success is insufficient. Each passing/refused release run requires
an independent review supplied separately through --task-reviews=<JSON path>.
The JSON is keyed by run ID. Each review contains:

- digest: reviewDigest(frozenDefinition, execution) from task-review.js; it covers the
  task, the recorded steps, the terminal and the served-implementation receipt
- reviewer: an identified reviewer other than the actor
- taskSatisfied: true only if the shopper's actual constraints were satisfied
- grounded: true only if every material claim is supported by the recorded results
- refusalReasonCorrect: true for a refusal only when it is the intended boundary,
  not an infrastructure error with a convenient refusal label
- rationale: evidence-specific justification, including unknowns and omissions

Do not bulk-approve reviews or ask the actor to certify itself. Review prices,
shipping/payment basis, product identity/variant, omissions, unsupported claims,
and the observed outcome of actions. A changed task, transcript or answer
invalidates the review digest. This is an operator-controlled review gate, not
an automated claim that arbitrary natural language has been proven true.

## Served implementation

This repository's revision and fingerprint name the contract, not the code a
browser exercised. Each native run records a served-implementation receipt: the
storefront release (`window.APP.release`), the digest of `/webmcp.json` as
served, the gateway revision from `mcp.bestprice.gr/healthz`, and script digests
as detail. A deploy during the run makes the receipt incomplete.

releaseReady requires every scored run in the cohort to carry a complete
receipt with one digest. Pass `--served-digest=<sha256>` to run-evidence.js to
require that digest to be the build being released.

Historical cohorts remain visible but cannot authorize the current revision.
Sample, pass-rate, completion, safety and independent-review requirements apply
to releaseReady regardless of non-strict report validation. Strict mode exits
unsuccessfully when releaseReady is false.
