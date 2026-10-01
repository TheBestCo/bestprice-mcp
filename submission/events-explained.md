# How BestPrice price-drop Events work

The user selects an exact grouped product and a EUR item-price threshold. BestPrice reads that product's real catalog minimum price; no LLM predicts or invents the price.

For a €170 threshold:

| Observed change | Alert |
| --- | --- |
| First observation: €185.88 | Establishes the baseline |
| €185.88 → €184 | No: still above the threshold |
| €185.88 → €170 | Yes: crosses down to the threshold |
| €185.88 → €169 | Yes: crosses down below the threshold |
| €169 → €168 | No: already below the threshold |
| €169 → €175 → €170 | Yes: the rise re-arms the monitor |

The price excludes shipping. It is a catalog item minimum, not a guarantee of a delivered total or a purchasable offer. An unavailable or invalid price is skipped. The first valid observation establishes a baseline even when it is already below the requested threshold. Comparisons more than 24 hours apart establish a fresh baseline instead of generating a stale crossing.

The backend schedules a bounded sampler every minute. It checks at most 20 distinct active products, oldest checked first, and yields to database pressure or a rollout drain. Queueing and rollouts can delay a check; changes between observations can be missed. These are observed catalog crossings, not an instant or exhaustive merchant-price-change service.

The price checkpoint and matching delivery records commit in one SQL transaction. Deterministic event identities suppress duplicate observations. A delivery worker verifies that the subscription and OAuth grant are still active, signs the event with Standard Webhooks, and POSTs it to the callback supplied and verified by ChatGPT. ChatGPT acknowledges receipt and processes the event asynchronously, as described in the [official Events contract](https://developers.openai.com/plugins/build/mcp-events).

Subscriptions expire after at most 24 hours unless the host refreshes them. OAuth consent is limited to `events:subscribe`, with a maximum 30-day grant. Transient delivery failures have a five-attempt cap. Pause/unsubscribe cancels queued work; each new delivery attempt rechecks expiry and revoked access. An HTTP request already in flight can finish.

## Current qualification

On October 1, a separate **BestPrice delivery qualification** monitor was created
in the actual ChatGPT host for `bp_2157591869` at **€185.87 EUR item price**. The
earlier €170 monitor remains paused. The real scheduled worker sampled
€185.88 at 04:39:02 UTC and again at 04:44:02 UTC. Read-only
production checks confirm one active subscription, a usable `events:subscribe`
grant, and its lease through October 2 at 04:38:28 UTC. No delivery records exist:
the observed price has not crossed the threshold. No real catalog price or
production observation was changed for this test.

At 04:45:13 UTC, both cron rows in the five-minute heartbeat cohort run the fixed
7b746ea revision; the latest worker success was 04:45:10 UTC. This proves active
periodic sampling beyond an idle tick. It does not prove a genuine callback or
ChatGPT processing. The [follow-up receipt](evidence/end-to-end-gates-2026-10-01.json)
records these checks; subscription expiry still requires host renewal.

On 30 September 2026, the private qualification connector passed real OAuth linking, subscription creation, signed callback verification, Resume, scheduled catalog sampling and Pause. Scheduled observations at 15:55:26 and 16:01:05 UTC independently confirmed the real €185.88 price after the manual sampler check. Pause left zero active subscriptions and no delivery records.

All 72 Events, callback, protocol and OAuth tests passed. The expanded isolated MySQL qualification passed exact-threshold crossings, concurrent duplicates, re-arming, stale-baseline suppression, signed fixture delivery and cancellation of 19 queued recipients. Its disposable tables were removed. [PR #1665](https://github.com/TheBestCo/bp-backend-node/pull/1665) retains that additional regression coverage. Synthetic fixture delivery is separate from real ChatGPT notification delivery.

Native search, offers and price history also passed in the actual ChatGPT workspace with CSP enforcement enabled.

No genuine crossing notification has yet reached ChatGPT. Plugin 1.2.0 remains In review; released 1.0.1 independently shows Authorization supported: None and has no account-linking control. Public OAuth migration and final applied reviewer materials require OpenAI resolution. Private reviewer credentials remain outside the ZIP and public repository. The separate CSS-backed ACP export has not been accepted by an external partner. These remain release gates. The owner-approved OpenAI Support request was sent and escalated; an October 1 inspection of the same support conversation found no human resolution. See the [support receipt](evidence/openai-support-request-2026-09-30.json).
