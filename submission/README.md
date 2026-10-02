# OpenAI plugin release 1.2.0

Use the [current release matrix](current-release-matrix.md) for deployed revisions,
live gates and host qualification. The sections below retain the timestamped
implementation and submission history.

The latest [submission identity audit](evidence/submission-identity-audit-2026-10-01.json)
confirms one visible plugin and one active review: **1.2.0 In review**, alongside
**1.0.1 Published**. Both ZIPs preserve the assigned identity and define one MCP
server. The two portal MCP entries are the package-server and associated-app
records, with the same endpoint. The overview's **1.1.0 Not submitted** badge
disagrees with the detail page; do not resubmit or remove records to reconcile
that display. No submission or connection mutation was made during this audit.

At the latest October 1 follow-up, a fresh portal scan reports **zero issues**, all
four tools and server instructions **Live**. A fresh ChatGPT native card and its
UI-only history follow-up passed: the model returned minimum €184.90 and median
€188.68 from the attached card without another visible tool call. A separate real
€185.87 monitor is active and the scheduled worker has repeatedly sampled
€185.88; no genuine crossing or notification has occurred in the observed window.
Public-app OAuth migration and package approval remain with OpenAI. The separate
ACP application is submitted with OpenAI's receipt confirmed; the validated
100-item sample remains local pending explicit Greece/EUR comparison-platform
approval and partner provisioning. See the
[follow-up receipt](evidence/end-to-end-gates-2026-10-01.json) and
[ACP onboarding record](acp-onboarding.md).

`openai/` is the replacement ZIP source for the existing BestPrice plugin. It preserves the assigned package identity and public MCP URL. Its version is independent of the distribution/WebMCP package version.

The package uses **BestPrice** throughout, the official square BestPrice logo for light and dark themes, Greek listing text, and three genuine native-workspace screenshots matched to the three starter prompts. Screenshots are JPEG/PNG files, each 706 pixels wide and 400–860 pixels high. The review contains five positive and three negative cases. Additional cases are retained in the evidence directory outside the ZIP.

Shopping remains anonymous and read-only. Optional account linking is limited to `events:subscribe`; it does not grant account-history, order, checkout or payment access. The advertised decision inputs contain the current task and relevant preferences. Cached clients retain a bounded legacy input adapter; no full conversation history is requested or required.

## Verified in production

- The post-Events shopping/native canary passed all **51 checks** on revision `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c`, with 43 stable gateway responses, 60 requests within the 90-request budget, and zero retries. It covers modern and legacy transport, the four public tools, native launch, compatibility resources, and cross-host AI Catalog/ARD parity.
- Both protected-resource discovery paths return canonical metadata: GET/HEAD 200 and OPTIONS 204. [Operations #498](https://github.com/TheBestCo/Operations/issues/498) is closed after these acceptance checks passed.
- ChatGPT discovers the official CIMD client, exact callback, PKCE S256, issuer, resource and Events scope. Anonymous use succeeds through **Use without an account**.
- The actual ChatGPT native workspace completes live product search, offer comparison, expansion of other stores and observed 180-day price history. The [reviewer demo](https://github.com/TheBestCo/bestprice-mcp/blob/main/submission/evidence/native-workspace-demo-2026-09-30.mp4) contains public catalog data, excludes the account avatar and demonstrates anonymous shopping.
- Real BestPrice account linking is verified: approved consent returns to ChatGPT and displays a linked account. A live database aggregate confirms one consumed authorization code and one access/refresh token pair. Website callback fix `5abf4d6335` passed three regression checks, Jenkins 18166 and production promotion 24456. Earlier locale and form-origin fixes are preserved in the timestamped evidence; they are no longer open account-linking blockers.
- OAuth-bound price-drop Events is activated in production. Commit `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c` passed normal hooks, including the 223-file affected test closure, and Jenkins main28315. Live discovery advertises Events. A fresh ChatGPT Work request created the actual `price.dropped` monitor. Production confirmed the exact product and €170 threshold; the signed callback challenge passed and the sampler recorded the actual €185.88 price. ChatGPT Pause then stopped the subscription: the task shows Paused and production confirms zero active subscriptions.

- Native navigation no longer falls back to internal product IDs. Commit `a547b43c773` passed 85 existing native UI tests and the normal 213-file pre-push closure. Five live metadata checks confirm the four public tools, current/older workspace resources and Events discovery on the new production revision. A fresh actual-host history view verifies readable navigation; the final 706×830 PNG review image captures the current renderer with readable controls.

[Qualification evidence](evidence/live-qualification-2026-09-30.json) records current results and timestamped earlier checks. The actual native monitor and production row prove subscription creation. No real matching price drop or delivered ChatGPT notification has yet been observed.

Fresh post-submission qualification at revision `d4cb141` passed all **51 production canary checks** across 43 stable gateway responses. A separate run of the exact submitted phone request returned three products below €500 with claim-backed NFC and 5G attributes. Both protocol definitions advertise only `message`, `postal_code` and `evidence_detail`; unknown input fields and oversized legacy payloads were rejected, and the empty native home launch passed. See the [definition audit](evidence/shopping-decision-live-definition-2026-09-30.json), [canary](evidence/submitted-shopping-canary-2026-09-30.json) and [exact reviewer case](evidence/submitted-phone-case-2026-09-30.json).

The sampler fix `57e38dbdd8e` removes an unnecessary child-worker heap reservation after live admission refusals. Existing scheduler tests (71), Events lifecycle tests (19) and the normal 494-file affected pre-push closure passed. Later production cron hosts run `488fecb`; the producer, store, sampler, event service and callback source match the qualified implementation byte for byte. Resuming the authorized test monitor verified real scheduled €185.88 observations at 15:55:26 and 16:01:05 UTC, independently of a manual sampler check. Pause then left zero active subscriptions. A rollout-time gap was observed; notification latency is not guaranteed.

The deeper Events qualification passed all 72 lifecycle, callback, protocol and OAuth tests. The isolated MySQL qualifier now additionally checks exact-threshold prices, concurrent duplicate crossings, re-arming, stale baselines and cancellation of 19 queued recipients; it passed and removed all its tables. [PR #1665](https://github.com/TheBestCo/bp-backend-node/pull/1665) retains the new coverage. Fresh native search, offers and history passed with CSP enforcement enabled. See [the Events explanation](events-explained.md) and [the qualification receipt](evidence/events-deep-qualification-2026-09-30.json).

## Review status and remaining release gates

- **1.2.0 is submitted and In review**, confirmed in the portal after the owner approved all six policy declarations. Package ID: `appsub_6abd16a16bb4819193e6e6bdc6337af1`. Downloading the uploaded draft confirmed all seven files match the source, including the new notes and review cases in `extensions.com.openai`. Before submission, the legacy Review information drawer showed saved 1.1.0 materials; the submitted-version controls do not expose that drawer. Final application of the reviewer materials remains unverified. Published 1.0.1 remains live.
- Complete optional OAuth configuration on the public associated app. On October 2 the portal still displays **No authentication**. A newly visible Reconnect action opens a legacy multi-step form with older metadata and a category validation error; it was closed without edits or saving. Real OAuth and native Events qualification currently belongs to the separate test connector. The original [support request](openai-support-draft.md) was escalated to a specialist on September 30. The approved [October 2 follow-up](openai-support-followup-2026-10-02.md) was sent in that same case; public migration and applied reviewer materials remain unresolved.
- Deployed sampler admission, native subscription, signed verification, Resume, periodic real-price observations and actual-host cancellation are confirmed. A genuine threshold-crossing notification remains unobserved. Synthetic observations were confined to disposable qualification tables; no real ChatGPT callback received a fabricated event.
- Provide a dedicated sample account, as required by the current [OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission), and verify its clean password-login flow and applied private reviewer details. The owner agreed on October 2 to provide this account. Credentials must remain outside chat, the ZIP and public repository.
- The superseded **1.1.0 review is canceled**. The October 2 version picker confirms exactly **one active review: 1.2.0**. The latest completed MCP scan visible in the portal remains October 1 at **18:08:16 UTC**, with **zero issues** and all four tools/server instructions **Live**. The October 2 rescan request did not expose a newer completed timestamp. The historical brand-name finding and final review outcome remain for OpenAI to resolve.
- After approval and publication, verify the released host and the **BestPrice** listing name. The released 1.0.1 connection still reflects its older cached metadata.

## Separate ACP deliverable

The current CSS-backed offline sample contains 10,000 items across 20 families, 406 sellers and 247 brands. The October 1 sample excludes the older explicit colour conflicts and has zero export-profile validation errors. A balanced 100-item onboarding sample is also prepared. Browser-UA and explicitly synthetic crawler probes do not prove actual partner-crawler access; default-curl PDP HEAD probes returned 403. See the [onboarding record](acp-onboarding.md) for hashes, market constraints and the prepared application.

The ACP export is outside the plugin ZIP. The [official application receipt](evidence/acp-application-submitted-2026-10-01.json) is confirmed. Partner selection, Greece/EUR comparison-platform approval and feed provisioning remain pending; no feed has been uploaded or accepted by an external commerce partner.
