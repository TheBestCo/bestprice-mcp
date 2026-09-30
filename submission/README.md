# OpenAI plugin release 1.2.0

`openai/` is the replacement ZIP source for the existing BestPrice plugin. It preserves the assigned package identity and public MCP URL. Its version is independent of the distribution/WebMCP package version.

The package uses **BestPrice** throughout, the official square BestPrice logo for light and dark themes, Greek listing text, and three genuine native-workspace screenshots matched to the three starter prompts. Screenshots are JPEG files, each 706 pixels wide and 400–860 pixels high. The review contains five positive and three negative cases. Additional cases are retained in the evidence directory outside the ZIP.

Shopping remains anonymous and read-only. Optional account linking is limited to `events:subscribe`; it does not grant account-history, order, checkout or payment access. Shopping requests contain only the current task and relevant preferences, never conversation transcripts.

## Verified in production

- The post-Events shopping/native canary passed all **51 checks** on revision `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c`, with 43 stable gateway responses, 60 requests within the 90-request budget, and zero retries. It covers modern and legacy transport, the four public tools, native launch, compatibility resources, and cross-host AI Catalog/ARD parity.
- Both protected-resource discovery paths return canonical metadata: GET/HEAD 200 and OPTIONS 204. [Operations #498](https://github.com/TheBestCo/Operations/issues/498) is closed after these acceptance checks passed.
- ChatGPT discovers the official CIMD client, exact callback, PKCE S256, issuer, resource and Events scope. Anonymous use succeeds through **Use without an account**.
- The actual ChatGPT native workspace completes live product search, offer comparison, expansion of other stores and observed 180-day price history. The [reviewer demo](https://github.com/TheBestCo/bestprice-mcp/blob/main/submission/evidence/native-workspace-demo-2026-09-30.mp4) contains public catalog data, excludes the account avatar and demonstrates anonymous shopping.
- Real BestPrice account linking is verified: approved consent returns to ChatGPT and displays a linked account. A live database aggregate confirms one consumed authorization code and one access/refresh token pair. Website callback fix `5abf4d6335` passed three regression checks, Jenkins 18166 and production promotion 24456. Earlier locale and form-origin fixes are preserved in the timestamped evidence; they are no longer open account-linking blockers.
- OAuth-bound price-drop Events is activated in production. Commit `0aa5ae3114d9c3548839f6f92c2c6d2e2503747c` passed normal hooks, including the 223-file affected test closure, and Jenkins main28315. Live discovery advertises Events. Production telemetry records one authenticated Events-list request.

- Native navigation no longer falls back to internal product IDs. Commit `a547b43c773` passed 85 existing native UI tests and the normal 213-file pre-push closure. Five live metadata checks confirm the four public tools, current/older workspace resources and Events discovery on the new production revision. Actual-host recapture remains pending.

[Qualification evidence](evidence/live-qualification-2026-09-30.json) records current results and timestamped earlier checks. Anonymous canary results and authenticated Events discovery do not prove a ChatGPT subscription or delivered notification.

## Remaining release gates

- Complete the actual ChatGPT Events subscription and cancellation checks and verify signed callback delivery. The first host attempt reported no available webhook events and created no alert. Connector tools were refreshed and a new chat request was sent; its result still needs verification. The latest live database aggregate contains zero subscriptions and zero deliveries.
- Recapture the final history screenshot from the deployed navigation polish after browser control is restored.
- Supply a dedicated BestPrice OAuth reviewer account. Enter credentials only in OpenAI's secure review form; they must remain outside the ZIP and public repository.
- Freeze and upload the replacement ZIP, inspect the new MCP scan and review details, then complete submission. Cancel the superseded 1.1.0 review only when the concrete replacement is ready. Version 1.2.0 is **not submitted**.
- After approval and publication, verify the released host and the **BestPrice** listing name. The released 1.0.1 connection still reflects its older cached metadata.

## Separate ACP deliverable

The CSS-backed offline export contains 10,000 items across 20 families, 406 sellers and 246 brands. Twenty representative PDPs and twenty images returned HTTP 200 under browser-UA HEAD checks; full crawler qualification is not claimed. The local bundle is `/Users/gp/Downloads/bestprice-acp-css-2026-09-30.zip`.

The ACP export is outside the plugin ZIP. No feed has been uploaded or accepted by an external commerce partner.
