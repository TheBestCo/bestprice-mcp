# BestPrice current release matrix

This is the current release record for September 30, 2026. Historical qualification reports remain dated evidence. Versions below belong to different artifacts: MCP **1.8.3**, native workspace **v7**, distribution/WebMCP **2.8.0 / 2.8**, and submitted OpenAI plugin **1.2.0**.

The [sanitized qualification receipt](evidence/external-audit-qualification-2026-09-30.json) retains timestamps, revisions, checks and the failed intermediate chair probe alongside the corrective proof. Counts from overlapping test closures are not added together.

## Release and qualification

| Surface | Current state | Evidence and remaining limit |
| --- | --- | --- |
| Backend/default branch | External-audit hardening and the additional early basket-clarification fix are pushed directly to `main` through normal hooks. | Final fix: `d3f2124c2a324690206ca3b0e03b7aefa47a1c39`; Jenkins [28372](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/28372/) succeeded in 251 seconds. Normal pre-push qualification covered 458 affected test files. The preceding pass qualified 577 files; these overlap and are not added. |
| Public MCP gateway | MCP **1.8.3**, extensions enabled, source revision `d3f2124c2a324690206ca3b0e03b7aefa47a1c39`. | Eight endpoint checks passed at 18:06 UTC. The final bounded synthetic canary passed **55 checks** at 18:07:24 UTC, using 66 requests, no rate-limit retries and no merchant redirects. Four ChatGPT-shaped calls preserved model/card facts. A client-name simulation does not establish a visible host render. |
| Brain/API | Final fix observed in live API heartbeats; all seven targeted production replay cases passed. | The chair error was attributed to the running `a473d55` API and reproduced with the real default reader. On the fixed gateway, laptop/chair now clarifies with both slots, budget and postcode preserved. Laptop/monitor produces a complete under-budget basket. Canonical admission was not weakened. |
| Native UI | `ui://bestprice/shopping-workspace-v7.html` deployed; cached v6/v5/v4/v1 and portable v1 remain served. | Earlier actual ChatGPT checks verified images, offers/history navigation and CSP enforcement. Fresh visible v7 follow-up verification is pending browser access. Model-visible reasons, alternatives, offer minima/counts and history are retained; omission counts and evidence closure remain bounded. |
| Website/discovery | Public guide and live website MCP metadata respond successfully; the metadata mirror advertises **1.8.3**. | Both protected-resource paths return 200, including `/.well-known/oauth-protected-resource`; the earlier proxy 404 is resolved. Website revision is not independently measured by these HTTP checks. WebMCP's 2.8 is a separate version. |
| OAuth authorization server | Public discovery advertises the BestPrice issuer, authorization/token/revocation endpoints and S256. Private ChatGPT qualification linking was observed. | Anonymous shopping remains available. Linked Events use `events:subscribe`; public directory app migration still shows **No authentication** and remains unverified. Private linking does not prove public-app linking. |
| Events backend | Implemented and qualified with isolated SQL lifecycle/concurrency tests. Real periodic product sampling, Resume and Pause were observed. | At 18:08 UTC: **0 active subscriptions**, 2 stopped, 0 delivery rows; scheduler last succeeded at 18:08:19 UTC. The five-minute heartbeat window included both `a473d55` and `a9e6e31` cron revisions during rollout. Events/OAuth source is identical between `a473d55` and the final `d3f2124` fix; complete worker rollout is not yet established. Separate cron release policy is preserved; gateway revision does not prove cron revision. A genuine matching price-drop notification processed by ChatGPT remains unobserved. |
| OpenAI submission | **BestPrice 1.2.0 is In review**; published version remains **1.0.1**. The superseded 1.1.0 review was canceled. | The submitted ZIP and downloaded portal ZIP have identical seven source files. Public OAuth migration and final applied reviewer materials are unresolved. [Official support escalation](evidence/openai-support-request-2026-09-30.json) is confirmed; no human resolution has been observed. The frozen submission is preserved. |
| MCP scan | Last observed portal scan reported **0 issues** with all four tools live. | A fresh scan after the final basket fix is pending browser access. The older generic “Needs attention” state and brand wording warning do not establish a new tool failure. |
| Official MCP registry | Older 1.8.1 publication is documented; the local 1.8.3 record and **BestPrice** title are prepared. | Publication uses the existing protected registry workflow, then must be checked at the receiving registry. Current receiving API requests timed out or were inaccessible; prepared metadata is not publication proof. |
| Other distribution manifests | BestPrice branding prepared in LobeHub, Cline and AgentFinder metadata; stable package identities retained. | Repository updates do not establish external marketplace uptake. Current-account OpenAI directory search returned no matches while the installed connector remained callable; clean-account discovery remains unverified. |
| ACP/CSS feed | Separate CSS-backed **10,000-row** sample validated; exporter prevents concurrent or repeated writes to an output directory. | No schema errors in the recorded sample. Twenty product pages and twenty image URLs were checked; this is not a full crawl. Partner ingestion/acceptance, refresh/deletion and attribution acceptance remain unqualified. ACP is separate from plugin review. |

## External audit disposition

The external audit's ten calls are selected probes, not a production failure-rate estimate. Every item was checked; the [backend disposition](https://github.com/TheBestCo/bp-backend-node/blob/main/docs/agent-commerce/external-audit-2026-09-30.md) explains the implementation and limits.

| Finding | Result |
| --- | --- |
| Collective basket language | Slots and quantities survive “both,” “all three” and “everything together”; genuine unsupported products remain visible. The exact laptop/monitor case passed in production. |
| Unsupported chair basket | Finite parser-family schema corrected. An additional real-reader early clarification error was found during deployment qualification, repaired and replayed successfully in production with the complete requested slots, destination and aggregate budget. |
| Model evidence erased by UI | Destructive projection removed. The model receives the canonical bounded result, including requested follow-up facts and resolvable evidence. Actual visible-host follow-ups remain to be checked. |
| Misleading recovery advice | Exact-model unmet/unverified requirements are distinguished; budget relaxation does not promise an undiscovered qualifying product. |
| Offer anomaly policy | Shared assessment labels suspicious listings for inspection; Brain excludes them from recommendation/budget proof. The €100/€300/€310 fixture is policy evidence, not a claim of live mispricing. |
| Shipping scope | Labels describe item plus published/estimated shipping. Floor delivery, installation, removal, payment and remote-area fees are not assumed included. Retrieval time is not merchant-feed freshness. More delivery-source evidence remains needed. |
| Candidate recall | Bounded-page disclosure retained. A human reference set is required before measuring recall or broadening retrieval; basket feasibility is not global optimality. |
| Accessory prominence | Requested model precedes accessories at limits 1 and 2; typed relationships are visible. Translated colour wording may conservatively yield `variant`, without certifying features. |
| Release consistency | This matrix separates source, deployment, scan, review, publication and host qualification. Public metadata paths checked; all four public catalog tools now declare `openWorldHint: true`. |
| Events lifecycle | Threshold equality, baseline, rebound/re-crossing, staleness, revocation, cancellation and concurrency have isolated SQL coverage. Genuine ChatGPT notification remains an explicit gate. |
| Discovery/adoption | Installed tool availability is recorded separately from directory discovery, automatic selection and installation. Historical Anthropic evaluation is not a new ChatGPT benchmark. |
| Telemetry attribution | Announced-host HTTP canaries remain explicitly synthetic. Resource reads, visible renders, human landings, merchant clicks and authoritative CPC charges are distinct. Historical audit calls cannot be retroactively excluded without their trace/time evidence. |

## Price-drop behavior

The monitor observes the exact grouped product's EUR **item price**, excluding shipping. A fresh prior observation must be above the requested threshold, and the new lower observation at or below it. First observations establish a baseline; repeated below-threshold observations do not repeat an alert. A rebound above the threshold rearms it. A baseline older than 24 hours cannot establish a crossing.

The producer samples a bounded set of valid subscriptions each minute and atomically persists its price checkpoint and deduplicated outbox event. Delivery rechecks grant, subscription, lease and expiration before sending a signed webhook. Cancellation and revocation suppress queued work. These are sampled observations, so an intermediate change may be missed. A callback 2xx establishes acknowledgement, not that ChatGPT processed and displayed the notification.

## Release gates still open

1. Fresh visible ChatGPT v7 UI/follow-ups and portal rescan after browser unlock.
2. OpenAI confirmation of public-app OAuth migration and applied reviewer materials; 1.2.0 approval/publication and clean-account discovery.
3. A genuine matching price-drop notification processed by ChatGPT, including the post-cancellation boundary.
4. Complete Events worker rollout/source parity, receiving registry confirmation of the 1.8.3 publication; separate ACP partner ingestion and acceptance.

No account identifiers, credentials, callback URLs, webhook secrets, private conversation URLs or signed merchant destinations belong in this public record.
