# Results: the bounded benchmark-blind completion guard (2026-09-19)

**Not part of neg-contract-v1's registration.** That experiment (arms A/B, one prompt rule) is closed
and its rule rejected. This is a separate head-to-head of the *other stream's*
`scripts/webmcp-eval-completion.mjs` guard, measured after it landed, with the same 5 disputed
negative cases, the same grader (v2), the same product page, in the same hour.

| Model | before (no guard) | after (guard) | change |
|---|---|---|---|
| deepseek-chat | 3/25 | 6/25 | +3 |
| claude-sonnet-4-5 | 5/25 | 5/25 | 0 |
| **pooled** | **8/50 (16%)** | **11/50 (22%)** | **+3** |

Per case, pooled over both models:

| Case | before | after |
|---|---|---|
| neg-005 (decline a capability) | 5/10 | **9/10** |
| neg-002 (refuse a cross-origin URL) | 3/10 | 2/10 |
| neg-001 / neg-008 / neg-009 | 0/10 | 0/10 |

**Verdict: not adopted by neg-contract-v1's pre-registered bar (+5 of 50 pooled, no model regressing
by more than 1).** Ignore that bar and the change still fails its own spirit: +3 of 50 is inside the
noise this harness can measure.

**Noise floor, measured:** the *same* baseline arm, same config, ~2 hours apart, scored 5/25 (20%) and
then 3/25 (12%). At n=25 a single-model comparison moves ±2 runs on nothing. Any claim below ~+4
passes at this sample size is unproven.

**What the guard does fix, and what it does not.** neg-005 moved 5/10 → 9/10: the guard detects an
unsupported "I'm done" terminal and gives one bounded continuation, which is exactly the failure that
case carries ("the agent declines and stops instead of making the required call"). The hard core —
neg-001 and neg-008 and neg-009 at 0/10 — is untouched: those fail by *choosing the wrong action*
(prose instead of the required call), not by stopping early. That needs a different mechanism.

**Storage:** `runs-guard-{before,after}.json` (deepseek-chat) and `runs-guard-claude-{before,after}.json`
(claude-sonnet-4-5), all `purpose=diagnostic`, artifacts in `artifacts/`. They cannot enter a release
fraction.
