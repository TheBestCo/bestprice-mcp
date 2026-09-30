# OpenAI plugin release 1.2.0

`openai/` is the replacement ZIP source for the existing BestPrice plugin. It preserves the assigned package identity and public MCP URL. Its version is independent of the distribution/WebMCP package version.

The package uses **BestPrice** throughout, the official square BestPrice logo for light and dark themes, Greek listing text, and three genuine native-workspace screenshots matched to the three starter prompts. Screenshots are JPEG/PNG files, each 706 pixels wide and 400–860 pixels high. The review contains five positive and three negative cases. Additional cases are retained in the evidence directory outside the ZIP.

Shopping remains anonymous and read-only. Optional account linking is limited to `events:subscribe`; it does not grant account-history, order, checkout or payment access. Shopping requests contain only the current task and relevant preferences, never conversation transcripts.

## Verified in production

- The post-Events shopping/native canary passed all **51 checks** on revision `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c`, with 43 stable gateway responses, 60 requests within the 90-request budget, and zero retries. It covers modern and legacy transport, the four public tools, native launch, compatibility resources, and cross-host AI Catalog/ARD parity.
- Both protected-resource discovery paths return canonical metadata: GET/HEAD 200 and OPTIONS 204. [Operations #498](https://github.com/TheBestCo/Operations/issues/498) is closed after these acceptance checks passed.
- ChatGPT discovers the official CIMD client, exact callback, PKCE S256, issuer, resource and Events scope. Anonymous use succeeds through **Use without an account**.
- The actual ChatGPT native workspace completes live product search, offer comparison, expansion of other stores and observed 180-day price history. The [reviewer demo](https://github.com/TheBestCo/bestprice-mcp/blob/main/submission/evidence/native-workspace-demo-2026-09-30.mp4) contains public catalog data, excludes the account avatar and demonstrates anonymous shopping.
- Real BestPrice account linking is verified: approved consent returns to ChatGPT and displays a linked account. A live database aggregate confirms one consumed authorization code and one access/refresh token pair. Website callback fix `5abf4d6335` passed three regression checks, Jenkins 18166 and production promotion 24456. Earlier locale and form-origin fixes are preserved in the timestamped evidence; they are no longer open account-linking blockers.
- OAuth-bound price-drop Events is activated in production. Commit `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c` passed normal hooks, including the 223-file affected test closure, and Jenkins main28315. Live discovery advertises Events. A fresh ChatGPT Work request created the actual `price.dropped` monitor. Production confirmed the exact product and €170 threshold; the signed callback challenge passed and the sampler recorded the actual €185.88 price. ChatGPT Pause then stopped the subscription: the task shows Paused and production confirms zero active subscriptions.

- Native navigation no longer falls back to internal product IDs. Commit `a547b43c773` passed 85 existing native UI tests and the normal 213-file pre-push closure. Five live metadata checks confirm the four public tools, current/older workspace resources and Events discovery on the new production revision. A fresh actual-host history view verifies readable navigation; the final 706×830 PNG review image captures the current renderer with readable controls.

[Qualification evidence](evidence/live-qualification-2026-09-30.json) records current results and timestamped earlier checks. The actual native monitor and production row prove subscription creation. No real matching price drop or delivered ChatGPT notification has yet been observed.

The sampler fix `57e38dbdd8e` removes an unnecessary child-worker heap reservation after live admission refusals. Existing scheduler tests (71), Events lifecycle tests (19) and the normal 494-file affected pre-push closure passed. Deployed sampler verification is still pending: Jenkins 28332 was superseded; successful later builds retained the preceding cron image under the normal hourly batch policy. This is a deployment wait, not a reported test failure.

## Remaining release gates

- The corrected **1.2.0 ZIP is uploaded** as draft `appsub_6abd16a16bb4819193e6e6bdc6337af1`. Downloading that draft confirms all seven files match the source, including the new notes and review cases in `extensions.com.openai`. The legacy Review information drawer still shows the saved 1.1.0 materials after reload. OpenAI documents that explicit scalar values are reapplied on submission; the final applied materials remain unverified.
- Complete optional OAuth configuration on the public associated app. The portal still displays **No authentication** and says individual connection details are unavailable. Its separate package-declared server shows **Connection unknown** without a Connect/Reconnect control. Real OAuth and native Events qualification currently belongs to the separate test connector. The [support request draft](openai-support-draft.md) records the actual UI findings; it has not been sent.
- Verify deployed sampler reliability. Native subscription, the signed verification challenge, the first live price observation and actual-host cancellation are confirmed. A genuine threshold-crossing notification remains unobserved. No fabricated catalog change or notification has been used.
- Complete the private OAuth reviewer login details for the account selected by the owner. Credentials must remain outside the ZIP and public repository.
- The superseded **1.1.0 review is canceled**. The current `get_shopping_decision` finding is the generic **further review required** hold, with the earlier definition still live; it no longer contains the specific conversation-history warning. The metadata finding flags the established BestPrice brand as a superlative. Finish the applicable review and policy attestations; version 1.2.0 is **not submitted**.
- After approval and publication, verify the released host and the **BestPrice** listing name. The released 1.0.1 connection still reflects its older cached metadata.

## Separate ACP deliverable

The CSS-backed offline export contains 10,000 items across 20 families, 406 sellers and 246 brands. Twenty representative PDPs and twenty images returned HTTP 200 under browser-UA HEAD checks; full crawler qualification is not claimed. The local bundle is `/Users/gp/Downloads/bestprice-acp-css-2026-09-30.zip`.

The ACP export is outside the plugin ZIP. No feed has been uploaded or accepted by an external commerce partner.
