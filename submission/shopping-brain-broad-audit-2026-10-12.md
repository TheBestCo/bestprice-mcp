# Shopping Brain anonymous audit — October 12, 2026

This follow-up audit exercises mandatory features, correction precedence and dense evidence through anonymous `get_shopping_decision` calls. It also uses local Brain replays against the live catalog without Ask history writes. Requests never open returned links or navigate to merchants.

## Release qualification

Released backend revision `979987837e73b3b364234855508974bdbd77746b` passed [Jenkins build 30020](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/30020/). The [final anonymous audit](evidence/shopping-brain-broad-2026-10-12/final-live.json) passed **36/36 cases**, including five full-evidence responses. The [read-only interface canary](evidence/shopping-brain-broad-2026-10-12/canary-final.json) passed **53/53 checks** with 67 requests and zero merchant redirects.

The final affected suite passed **6,168 tests**, with three skipped and zero failures. Normal push hooks additionally qualified 547 test files and 23 offline contract files; these overlapping cohorts are not added together. The [release receipt](evidence/shopping-brain-broad-2026-10-12/release-receipt.json) pins source, CI, runtime-role observations and evidence hashes.

## Confirmed failures and repairs

The initial 30-case sweep exposed seven product failures after manual review and stronger assertions. Two additional control requests reproduced the NFC recall failure. These are selected adversarial cases, not a production failure-rate estimate.

| Cause | Live symptom | Repair |
| --- | --- | --- |
| Price correction vocabulary | “Up to €100; Διόρθωση: up to €400” kept €100; a corrected contradictory interval still asked for clarification. | The exact price compiler recognizes the noun-form correction and retains the corrected source spans. |
| Storage correction precedence | A 512 GB request corrected to 128 GB still failed. | The newest turn and its explicit correction own the active storage minimum. |
| Litre shorthand guard | `4.5L έως 5L` asked for clarification although the spelled-out control found products. | The parser's fast guards recognize `L`, which its full quantity grammar already supports. |
| Consumed quantity custody | A valid RAM correction was parsed as 8–16 GB but remained unresolved; superseded quantities reappeared as orphan requirements. | Compiler-consumed numeric spans remain understood, including superseded values. Unsupported words remain visible. |
| Named comparison split | A56 versus Redmi Note 14 Pro with “NFC και OIS” returned different models. | A feature-list conjunction cannot become another comparison model. |
| Mandatory-feature retrieval order | The €150 NFC request missed qualifying phones already retrieved. Twenty basic phones from an unrestricted cheap companion consumed the detail budget first. | Feature-targeted results retain priority when requirements are mandatory; generic price-only discovery retains its existing order. |

No search, detail, offer, candidate, claim or receipt-byte limit was increased by these changes. Eligibility still requires verified typed facts.

## Evidence and audit corrections

- [Original 30-case receipt](evidence/shopping-brain-broad-2026-10-12/baseline.json), [eight control calls](evidence/shopping-brain-broad-2026-10-12/controls.json), and [fresh failure confirmations](evidence/shopping-brain-broad-2026-10-12/confirmed-before.json) retain the original responses on revision `8eb2c1db66ccd1e3b70c28e39249bd1832d4d99a`.
- [Assessment](evidence/shopping-brain-broad-2026-10-12/assessment.json) corrects the initial harness: ANC's typed key is `active_noise_cancellation`; an ineligible comparison intentionally keeps `outcome: comparison` with `status: no_match` and no recommendation. Empty responses and wrong model identities no longer pass the positive cases.
- [Failed recall trace](evidence/shopping-brain-broad-2026-10-12/bounded-recall-before.json) and [fixed live-catalog replay](evidence/shopping-brain-broad-2026-10-12/bounded-recall-fixed.json) show the ordering problem and its repair.
- [Local corrected cases](evidence/shopping-brain-broad-2026-10-12/local-fixed.json) and [final dense replay](evidence/shopping-brain-broad-2026-10-12/local-dense-final.json) retain the internal evidence measurements. The dense NFC canonical artifact contains **2,095 claims, 779,994 bytes**, and eight offer lookups with ten offers each. The independent limits remain 4,096 claims and 1 MiB.
- Public `full` evidence contains every returned-product claim, not every internal search candidate. Canonical and public evidence counts are reported separately.

Signed URLs and request identifiers are omitted from saved public responses. No staff Ask calls, history persistence, account/order/alert writes, Events writes, merchant navigation or signed attribution checks occurred. This audit does not establish live Ask/MCP parity, whole-catalog recall, portal state or marketplace adoption.
