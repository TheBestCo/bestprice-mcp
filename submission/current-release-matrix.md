# BestPrice current release matrix

This is the current release record for October 1, 2026. MCP **1.8.4**, native workspace **v8**, distribution/WebMCP **2.8.0 / 2.8**, and submitted OpenAI plugin **1.2.0** identify different artifacts.

The [October 1 qualification receipt](evidence/paranoid-qualification-2026-10-01.json) records revisions, timestamps, positive checks and failed intermediate attempts. The [September 30 receipt](evidence/external-audit-qualification-2026-09-30.json) remains historical evidence. Overlapping test closures are not added together.

## Release and qualification

| Surface | Current state | Evidence and remaining limit |
| --- | --- | --- |
| Backend/default branch | Boundary hardening and shared resource discovery are pushed directly to `main`, through normal hooks. Final revision: `7b746eaf57cbdb78c88ba845fc8ff70b56d7e374`. | [Jenkins 28410](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/28410/) succeeded, including tests and gateway/API deployment. The final normal pre-push qualified 217 affected files; the preceding boundary commit qualified 284 overlapping files. A combined local run passed 293 tests across thirteen files; seventy adjacent UI/MCP/server checks also passed. The separate CI Runtime proof stage was not executed. |
| Public MCP gateway | **1.8.4**, extensions enabled, final revision independently observed on public responses. | The final canary passed **55 checks** at 04:04:21 UTC, with 67 requests, zero rate-limit retries and zero merchant redirects. Public TLS certificate verification was enabled. SDK, legacy and resource server-card inventories agree, including all nine retained resources. This is bounded synthetic qualification, not a visible host-render proof. |
| Brain/API | Final API generation deployed; all seven selected production cases passed on the final gateway. | The exact collective basket, unsupported chair, cause-specific recovery, exact search at limits 1 and 2, offer/shipping facts and history passed at 04:03:49 UTC. At 04:19:58 UTC, all five API heartbeat rows in the five-minute window reported 7b746ea; no preceding API revision remained. |
| Native UI | `ui://bestprice/shopping-workspace-v8.html` deployed, retaining cached v7/v6/v5/v4/v1 and portable v1. | Locale, context ordering and unresolved legacy promises have regressions. An actual ChatGPT follow-up exposed UI-only history missing from model context; v8 now sends the current canonical structured result, bounded to 32,768 characters, without private metadata or transcript. Fresh actual v8 rendering and model admission remain pending browser availability. A bridge acknowledgement alone is insufficient. |
| Website/discovery | Eight public endpoints passed at 04:03:49 UTC; the website MCP mirror advertises **1.8.4**. | Both protected-resource aliases, issuer discovery, MCP metadata, WebMCP and public guide returned 200. Website code revision is not independently established by these HTTP checks. WebMCP 2.8 remains a separate contract. |
| OAuth authorization server | Public discovery and private ChatGPT qualification linking are established. | Anonymous shopping remains available; linked Events use `events:subscribe`. The public associated OpenAI app still shows **No authentication**. Public migration and final applied reviewer materials remain unverified; private linking does not establish public-app linking. |
| Events backend | Authorization-loss challenge, oversized acknowledgement and sampling/outbox fairness defects repaired; isolated real SQL checks passed. Periodic-worker fixes remain pending live rollout qualification. | At 04:19:58 UTC: zero active subscriptions, two stopped, zero delivery rows; latest successful tick at 04:19:11 UTC independently attributed to cron revision fdd0b09. Both observed cron instances still reported that revision. Scheduled [build 28411](https://jenkins.bestprice.gr/job/TheBestCo/job/bp-backend-node/job/main/28411/) requested cron release 7b746ea and succeeded, but its deployment wait confirms API readiness while cron drains in the background. Direct Nomad inspection from this Mac timed out. No drain was shortened or allocation stopped. A genuine ChatGPT-processed price-drop notification remains unobserved. |
| OpenAI submission | **BestPrice 1.2.0 In review**; public released version remains **1.0.1**. | Frozen submitted/downloaded ZIPs retain identical seven source files. The existing [official support escalation](evidence/openai-support-request-2026-09-30.json) remains unresolved. A narrow review-email check found the submission receipt and no newer approval or OAuth-resolution message. This does not establish the absence of a support-chat reply. No withdrawal or duplicate submission was made. |
| MCP scan | October 1 portal scan has **one held shopping-decision update**. | At 03:22:47 UTC, `get_shopping_decision` was Earlier version live with “This tool update needs further review before it can go live.” Its previous full-conversation-history warning was absent. Other three tools and server instructions were Live. A new scan after v8 remains pending browser availability. |
| Official MCP registry | **1.8.4**, title **BestPrice**, published and independently received. | [Publication workflow](https://github.com/TheBestCo/bestprice-mcp/actions/runs/36813117642) succeeded. Receiving GET at 04:02:12 UTC returned HTTP 200, version 1.8.4, active and latest; published timestamp 04:01:05 UTC. The prior 1.8.3 receiving-visibility gate is closed. |
| Public distribution and LobeHub | Metadata and verifier fixes pushed at `a5e8c32f1ce5e9bc4a7ffca5c5bed723feb7418c`; LobeHub owner update and receiving record verified. | [CI](https://github.com/TheBestCo/bestprice-mcp/actions/runs/36813117504) passed on both configured Node lines: 1,088 passed, zero failed, two environment-dependent skips out of 1,090 tests per line. The isolated installed-tarball diagnostic also passed. Locally, 1,090/1,090 repository tests and 75/75 installed tests passed. LobeHub receiving API returned validated BestPrice 1.8.4, four tools with `openWorldHint: true` and its valid three-resource portable subset. Other marketplace uptake is not inferred from repository changes. |
| ACP/CSS feed | New CSS-backed **10,000-row** sample, twenty families, 406 sellers and 247 brands; zero schema errors. | Eight explicit same-model colour contradictions in the preserved older sample are excluded. Exported/category sums equal 10,000; examined denominator 15,932 = 10,000 exported + 5,534 without eligible headline + 284 quality exclusions + 114 unprocessed tail. Default-curl HEAD produced 20 PDP 403s and 20 image 200s; two representative Chrome-UA HEAD/GET and two explicitly synthetic crawler GET probes returned 200. These do not prove actual partner-crawler access. No upload or partner acceptance occurred. |

## October 1 hardening

LobeHub’s inferred npm artifact still advertises `bestprice-mcp` 1.2.7, distinct from the current listing version. The package is private and its declared installation paths use the current Git repository or hosted HTTP. Re-publication of the same owned repository was accepted for enrichment; completed processing and corrected artifact inference are not yet verified.

The [backend boundary audit](https://github.com/TheBestCo/bp-backend-node/blob/main/docs/agent-commerce/paranoid-audit-2026-10-01.md) records the reproduced Events, native UI and ACP defects. The public verifier also now canonicalizes both dependency-root and target paths, accepting the macOS temporary-directory alias while rejecting external SDK symlinks. These controlled reproductions are not claims of a live production incident.

The initial 1.8.4 deployment exposed two negative canary attempts: first an expected-inventory omission, then the actual legacy-card omission of cached v7. The corrected shared inventory passed on the final deployment. The negative receipts are retained; their request counts were not recorded and are not invented.

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

The monitor samples the exact grouped product’s EUR **item price**, excluding shipping. A fresh prior observation must be above the chosen threshold and the new, lower observation at or below it. The first observation establishes a baseline; repeated below-threshold observations do not repeat an alert. A rebound above the threshold rearms it. A baseline older than 24 hours cannot establish a crossing.

Each minute, the bounded producer checks at most twenty eligible products while respecting pool pressure, aborts and the whole-tick deadline. Sampling admission now uses the first half of the remaining budget so existing outbox work has time to drain. The price checkpoint and deduplicated event are committed atomically. Delivery rechecks the grant, subscription, lease and expiry before its signed callback. Pause/revocation suppress queued work; already in-flight work may complete. Sampled intermediate price changes can be missed. A callback 2xx proves acknowledgement, not ChatGPT notification processing; the historical worker field named delivered counts attempts.

## Release gates still open

1. Fresh actual ChatGPT v8 render, UI-only history model follow-up, and portal rescan after browser availability.
2. Live Events-worker revision after the scheduled batch, followed by a genuine matching price-drop notification processed by ChatGPT.
3. OpenAI confirmation of public-app OAuth migration and applied reviewer materials; 1.2.0 approval/publication and clean-account discovery.
4. Separate ACP partner ingestion/acceptance, refresh/removal, crawler access and attribution acceptance.
5. LobeHub repository enrichment and correction of its stale inferred npm artifact.

No credentials, account identifiers, callback URLs, webhook secrets, private conversation URLs or signed merchant destinations belong in this public record.
