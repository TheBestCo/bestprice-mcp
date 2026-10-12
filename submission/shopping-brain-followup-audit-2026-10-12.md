# Shopping Brain follow-up and mixed-basket audit — October 12, 2026

This audit separates anonymous public `get_shopping_decision` calls from local multi-turn Brain replays using live read-only catalog tools. The public contract takes a concise current request, not a chat transcript. Local history replays exercise the same Brain without calling staff Ask or writing conversations. They do not prove an actual host's conversation summarization or live Ask/MCP parity.

## Release qualification

Fixes were committed and pushed through normal hooks at `b91cfa5392f867e3c44828666389e566d20d84ef`. [Jenkins 30029](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/30029/console) passed; four API allocations were admitted at 10:28:08 UTC. [Deployment evidence](evidence/shopping-brain-followups-2026-10-12/deployment.json) records serving API identity separately from the retained cron image.

The [final public sweep](evidence/shopping-brain-followups-2026-10-12/final-live.json) passed **24/24** from 10:28:51 to 10:29:36 UTC, with that exact gateway revision on every response and both health checks. Nine cases requested full public evidence. The maximum public structured receipt was 58,961 bytes; the maximum claim count was 130. Every claim/source/support reference resolved before redaction.

The [final history replays](evidence/shopping-brain-followups-2026-10-12/history-final.json) passed **12/12** using live read-only catalog data. The checkout had advanced to `d2f65b07bb29135bd3b8345898fe0d2a39b38fd1`; all Brain, agent and commerce source paths were verified identical to the release. Synthetic user-turn histories establish Brain correction behavior, not actual host transcript handling.

The affected offline suite passed **6,204 tests**, with three skips and zero failures. Normal push hooks qualified **550 affected test files** and **23 offline module contracts**. These overlapping cohorts are not added together. [Validation and source-blob custody](evidence/shopping-brain-followups-2026-10-12/validation.json) record the exact source and test counts.

The [read-only submission canary](evidence/shopping-brain-followups-2026-10-12/canary-final.json) passed **53/53 checks**, sending 67 requests within the 90-request budget, with zero merchant redirects and zero rate-limit retries. Fifty revision-bearing responses consistently identified the released gateway.

The [release manifest](evidence/shopping-brain-followups-2026-10-12/release-receipt.json) records SHA-256 hashes and byte sizes for every retained evidence file. Reconstruction checks verify that split case files exactly equal their captured responses after redaction.

## Findings and repairs

Nine public failures reproduced on a stable gateway revision, alongside one passing conservative-budget control. Two additional history cases exposed basket continuity failures. These are selected adversarial cases, not a production error-rate estimate.

| Failure | Retained observation | Repair |
| --- | --- | --- |
| Missing reference or unresolved product choice | “The second one, cheaper” invented a recommendation without prior context; postcode alone returned no-match. “Laptop or tablet” selected one category; “laptop and mouse or headphones” bought all three; an unnamed kitchen item was dropped. | Ask for the missing product or category choice before catalog discovery. Compatibility targets and feature alternatives remain ordinary requests. |
| Final ceiling ignored | €800 → €400 → explicitly final €600 still used €400. | Recognize the explicit final-limit correction while preserving genuine conflicting bounds. |
| Corrected basket inventory appended | A 2-mouse/1-headphone basket corrected to 1/2 became four slots. Removing the monitor from a three-item basket appended the old list to the new list, including in history replay. | Replace a complete explicitly corrected inventory; retain requirements on the uniquely matching items that survive. Ambiguous repeated families cannot silently discard old obligations. |
| Budget-only follow-up lost basket intent | The next turn “Correction: total up to €100” became a single-product no-match. | Keep basket intent and its compiled aggregate interval, retaining the existing slots and destination. Correction vocabulary cannot become an invented product slot. |
| Impossible item floors searched anyway | €50 mouse minimum + €60 headphone minimum under a €100 aggregate ceiling made three searches before clarifying. | Check the quantity-weighted item minima against the aggregate ceiling before retrieval. |

No timeout, retry, search, detail, offer, candidate or evidence-size limit was increased. No public schema or server version changed.

## Receipt interpretation

- The [initial sweep](evidence/shopping-brain-followups-2026-10-12/baseline.json) retains all 24 attempts. Six lacked the expected revision header during a deployment transition; their HTTP status was not captured by the old runner, so no exact HTTP failure cause is inferred. The runner now preserves status and transport error text before checking revision identity.
- [Current-revision repeats](evidence/shopping-brain-followups-2026-10-12/repeats-current.json) and the [stable nine-failure confirmation plus one control](evidence/shopping-brain-followups-2026-10-12/confirmed-before-stable.json) retain the public behavior. Zero-case revision mismatches are also preserved and are not counted as semantic failures.
- The initial checker expected clarification for “€500 or €800.” Inspection confirmed conservative resolution to €500, so the final checker accepts that safe behavior. The history family-switch check initially expected internal `mouse`; the public schema correctly uses `mice`. Neither is reported as a product bug.
- [Original history replays](evidence/shopping-brain-followups-2026-10-12/history-before.json), [intermediate traces](evidence/shopping-brain-followups-2026-10-12/history-target-fixed.json), [corrected history replays](evidence/shopping-brain-followups-2026-10-12/history-fixed.json), and [local current-request replays](evidence/shopping-brain-followups-2026-10-12/public-local-fixed.json) retain inputs, canonical receipts, projected responses and catalog calls. Intermediate working states are not attributed to an immutable release commit.
- “A little larger” after a phone request becomes a grounded soft preference for larger screens while retaining mandatory NFC; no exact size or comparison with a previously selected product is claimed. Feature and compatibility alternatives are distinct from choosing which product category to buy.
- Mixed baskets check slot/count custody, quantity and price arithmetic, published shipping totals, aggregate and per-item budgets, brand exclusions, typed NFC/capacity evidence, and typed known-false wireless evidence for wired slots. Public full evidence is a projection of returned products, not every internally inspected candidate.

Retained artifacts redact signed URLs and identifiers. Split canonical evidence and context files reconstruct the captured receipt exactly after redaction. No account, order, alert, history or Events write was made; no merchant or signed attribution link was opened. No portal state or marketplace adoption is inferred.
