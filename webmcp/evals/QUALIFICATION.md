# Native qualification

`npm test` validates the implementation. It does not authorize a release.

`npm run eval:check` first requires the actual BestPrice.gr checkout and PHP,
then validates native evidence. It does not substitute a fixture when the
storefront is absent. Set `BESTPRICE_STOREFRONT_ROOT` to its checkout path.

The browser command is a JSON-lines peer. One process owns one browser/tab for
a case. Each reply includes a persistent session ID, actual registered tool
descriptors, browser version, current URL and observed results. A later request
must use the actual current URL; it must not reload the tab between calls.
The supplied storefront runner uses Chrome's document.modelContext. It blocks
merchant/billing navigations. Never remove that boundary for qualification.

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

- digest: reviewDigest(frozenDefinition, execution) from task-review.js
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

Historical cohorts remain visible but cannot authorize the current revision.
Sample, pass-rate, completion, safety and independent-review requirements apply
to releaseReady regardless of non-strict report validation. Strict mode exits
unsuccessfully when releaseReady is false.
