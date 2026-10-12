# Shopping Brain category and basket audit — October 12, 2026

This audit uses anonymous public `get_shopping_decision` calls and local read-only Brain replays against live catalog data. It covers exclusions, conflicting requirements and basket budgets across TVs, tablets, espresso machines, vacuums, washers, dishwashers, mice, printers, routers, headphones, refrigerators, laptops, monitors, phones and air fryers.

## Release qualification

The source fix is `94a2329220a231943fec3edca54a3c602d0a98d0`, released with merge revision `77b594bd8d526e004c8f38b4d30c15caee91ba4f`. [Jenkins 30024](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/30024/console) passed; four new API allocations were admitted at 10:02:08 UTC. [Deployment evidence](evidence/shopping-brain-categories-2026-10-12/deployment.json) distinguishes the gateway, serving APIs and separate cron revision.

The [final anonymous sweep](evidence/shopping-brain-categories-2026-10-12/final-live.json) passed **40/40 cases** from 10:02:27 to 10:03:46 UTC on that revision, including all nine reproduced failures and the positive controls. Eleven cases requested full public evidence; the largest public structured receipt was 125,965 bytes with a maximum of 346 claims across the sweep. Every source/support reference resolved. Full public evidence remains a bounded projection of the returned products; the [local final replays](evidence/shopping-brain-categories-2026-10-12/local-final.json) retain the larger canonical receipts.

The [read-only submission canary](evidence/shopping-brain-categories-2026-10-12/canary-final.json) passed **53/53 checks**, sending 67 requests within its 90-request budget, following zero merchant redirects. Gateway revision headers stayed consistent. The [release manifest](evidence/shopping-brain-categories-2026-10-12/release-receipt.json) records SHA-256 hashes and byte sizes for all retained evidence files.

The affected offline suite passed **6,212 tests**, with three skipped and zero failures. Distribution tests passed **1,095/1,095** at bounded concurrency. An initial unrelated 200 ms browser-session timing failure passed all ten isolated checks and the full bounded run; no distribution code was changed. Normal commit and push hooks remain active. Counts from overlapping hook cohorts are not added to this suite.

## Findings and fixes

The initial 36-case sweep at gateway revision `979987837e73b3b364234855508974bdbd77746b` contained nine semantic failures under the final acceptance checks, plus one transient timeout. These are selected adversarial cases, not a measured production failure rate. Three semantic cases returned unsafe recommendations: two wireless-exclusion variants and the contradictory capsule request. The other six cases clarified late, returned an unhelpful no-match, or missed an answerable basket.

| Cause | Live evidence | Fix |
| --- | --- | --- |
| Wireless refusal became a positive requirement | “Not wireless” and “wireless; correction: wired only” returned three explicitly wireless mice. The saved reading quoted the refusal as the source of `wireless`. | A wired requirement admits only known-false wireless evidence. The literal refusal overrides a positive model reading; explicit corrections retain their final polarity. |
| Contradictions were lost or handled after retrieval | Capsule and no-capsule requirements produced a recommendation. Same-brand inclusion/exclusion and OLED inclusion/exclusion searched before no-match. A contradictory basket item-price range also searched. | Explicit opposing statements clarify before catalog calls, preserving genuine corrections, alternatives and optionality. Each basket item checks its own conflicts. |
| Basket minimum price was not sent to retrieval | A mouse slot requested €20–€40. Eight cheaper mice consumed its detail budget while qualifying €20.59, €27.90 and €34.35 entries were already later in the returned page. | Send the existing per-item minimum alongside its maximum. The same detail and search limits now inspect the requested interval. |
| One family reading blocked another basket slot | A phone with NFC plus a 4–5 L fryer stopped before retrieval because the whole-request reader selected the fryer family and called NFC unsupported. | A phrase already owned and enforced by exactly one basket slot stays with that slot. Compound unknown phrases and ambiguous repetitions remain unresolved. Phones without confirmed NFC still cannot complete the basket. |

The espresso-without-capsules request timed out once in the baseline and passed its recorded repeat. No timeout, retry, search, detail, offer, candidate or receipt-size limit was increased.

## Receipts and interpretation

- [Original baseline](evidence/shopping-brain-categories-2026-10-12/baseline.json), [fresh repeats](evidence/shopping-brain-categories-2026-10-12/repeats.json), [all nine failures reproduced again](evidence/shopping-brain-categories-2026-10-12/confirmed-before.json), and [additional controls](evidence/shopping-brain-categories-2026-10-12/controls.json) preserve the responses, including failures.
- [Baseline assessment](evidence/shopping-brain-categories-2026-10-12/baseline-assessment.json) applies the stronger final acceptance checks. The exploratory runner initially checked schema, evidence references and budgets without requiring positive outcomes for every category; those preliminary passes are not the final assessment.
- [In-progress local traces](evidence/shopping-brain-categories-2026-10-12/local-first.json) retain the missing basket minimum and unresolved NFC behavior. [Corrected basket traces](evidence/shopping-brain-categories-2026-10-12/local-basket-fixed.json) and [final source replays](evidence/shopping-brain-categories-2026-10-12/local-final.json) preserve the catalog calls and canonical receipts. In-progress traces are not attributed to the final immutable source revision.
- Positive controls require actual recommendations or completed baskets. Every returned basket plan is checked for quantity coverage, line arithmetic, merchant and aggregate shipping totals, per-unit price intervals and the aggregate budget. A below-minimum total may honestly clarify; the audit does not require spending extra merely to reach a floor.
- Typed wireless, NFC and capacity facts retain resolving claim/source references. Existing washer policy also permits one unambiguous drum-capacity value in the product title when no capacity observation exists. Two baseline washer products used that path and exposed typed capacity as unknown; the audit does not turn that unknown into a claimed typed fact. Full final washer evidence checks the title claim itself.
- Public `full` evidence describes the returned products, not every internally inspected candidate. Signed links and identifiers are redacted in retained public artifacts; original transport/schema checks run before redaction.

No staff Ask calls, history persistence, account/order/alert writes, Events writes, merchant navigation or signed attribution checks occurred. This audit does not establish live Ask/MCP parity, whole-catalog recall, portal state or marketplace adoption.
