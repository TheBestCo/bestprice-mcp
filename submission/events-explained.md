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

On October 2 at **17:43:06 UTC**, the same private qualification monitor observed a real **€185.88 → €179.88** item-price crossing below its **€185.87** threshold. Production recorded one `price.dropped` delivery, accepted on the first attempt. The October 3 checkpoint remained €179.88; ChatGPT displayed the matching native event and prices in the alert conversation. The [live receipt](evidence/events-first-live-delivery-2026-10-03.json) records these facts without account or callback identifiers. A separate push notification was not independently observed.

On October 2, the existing qualification monitor for `bp_2157591869` was still active at a **€185.87 EUR item-price threshold**. Read-only production checks found a renewed subscription version and a lease through **October 2 at 22:05:53 UTC**, a usable grant and a live refresh token. The durable observation at **13:31:09 UTC was €185.88**, matching an independent canonical catalog read. There was one active subscription and two stopped subscriptions, with no delivery records. No price, observation, subscription or grant was changed by the audit.

Sampling is periodic, not guaranteed every minute. In the fixed **12:30–13:30 UTC** window, **53 of 60** scheduled minute boundaries had completed worker transactions, with zero transaction errors. Seven missing minutes coincided with cron process replacement; the largest adjacent claim gap was **8 minutes 28.247 seconds**. Sampling resumed, but the exact cause is not established by retained telemetry. This is an observed operational limit, not a claim of a failed webhook.

The [October 2 receipt](evidence/end-to-end-qualification-2026-10-02.json) records the state before the crossing and separates sampling from host renewal. The October 1 [follow-up receipt](evidence/end-to-end-gates-2026-10-01.json) retains earlier qualification evidence.

On 30 September 2026, the private qualification connector passed real OAuth linking, subscription creation, signed callback verification, Resume, scheduled catalog sampling and Pause. Scheduled observations at 15:55:26 and 16:01:05 UTC independently confirmed the real €185.88 price after the manual sampler check. Pause left zero active subscriptions and no delivery records.

All 72 Events, callback, protocol and OAuth tests passed. The expanded isolated MySQL qualification passed exact-threshold crossings, concurrent duplicates, re-arming, stale-baseline suppression, signed fixture delivery and cancellation of 19 queued recipients. Its disposable tables were removed. [PR #1665](https://github.com/TheBestCo/bp-backend-node/pull/1665) retains that additional regression coverage. Synthetic fixture delivery is separate from real ChatGPT notification delivery.

Native search, offers and price history also passed in the actual ChatGPT workspace with CSP enforcement enabled.

The real event reached ChatGPT through the private qualification connection; plugin 1.2.0 remains In review, and released 1.0.1 independently shows Authorization supported: None and has no account-linking control. Public OAuth migration and final applied reviewer materials require OpenAI resolution. Private reviewer credentials remain outside the ZIP and public repository. The separate CSS-backed ACP export has not been accepted by an external partner. These remain release gates. The owner-approved OpenAI Support request was sent and escalated; an October 2 inspection still found no specialist resolution. The owner-approved [October 2 follow-up](openai-support-followup-2026-10-02.md) was sent in that same case. See the original [support receipt](evidence/openai-support-request-2026-09-30.json).
