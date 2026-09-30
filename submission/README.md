# OpenAI plugin release 1.2.0

`openai/` is the replacement ZIP source for the existing BestPrice plugin. It preserves the assigned package identity and public MCP URL. Its version is independent of the distribution/WebMCP package version.

The draft uses **BestPrice** branding, native-workspace screenshots, the existing brand asset, current-task-only shopping instructions, and seven positive/four negative review cases. Ordinary shopping remains anonymous and read-only. Optional OAuth is limited to `events:subscribe`.

## Verified in production

- The public shopping/native canary passed all 51 checks on revision `6e5a2865de8`, including modern and legacy transport, the four public tools, native launch, compatibility resources, and cross-host AI Catalog/ARD parity.
- Both `/.well-known/oauth-protected-resource` and `/mcp/oauth-protected-resource` return the canonical metadata. GET/HEAD return 200 and OPTIONS returns 204. [Operations #498](https://github.com/TheBestCo/Operations/issues/498) is closed after these acceptance checks passed.
- ChatGPT automatically discovers the official CIMD client, exact callback, PKCE S256, issuer, resource, and single Events scope. No manual callback exception is needed.
- The new optional-OAuth connection successfully connects with **Use without an account**. Its production native workspace completes live product search, offer comparison, expansion of other stores, and observed price history.
- The [reviewer demo](https://github.com/TheBestCo/bestprice-mcp/blob/main/submission/evidence/native-workspace-demo-2026-09-30.mp4) records these interactions in the actual ChatGPT host. It contains public catalog data, excludes the account avatar, and does not claim OAuth or Events delivery.
- The real OAuth flow exposed ChatGPT's `ui_locales` display hint. Website fix `44c6b439f2` removes this bounded hint before strict grant validation. Seven HTTP regression checks passed, including malformed input, foreign callbacks, consent and CSRF binding. Jenkins 18162 and production promotion 24451 passed. Public authorization controls with and without the locale hint now both reach sign-in. The real ChatGPT flow reaches the BestPrice consent page; approval is pending.
- The browser then displayed `access_denied` on the first-party consent endpoint. A real Chrome form control reproduces `Origin: null` under `no-referrer`, which the exact-origin check correctly rejects. Website fix `9900764b4e` uses `strict-origin` for the consent HTML only, preserving query privacy and keeping `no-referrer` on callback/token responses. Four regression tests pass, including rejection of missing/null/foreign origins. Build 18164 and production promotion 24452 passed. Live anonymous authorization and rejected-token controls preserve `no-store` and `no-referrer`. A later retry still reported `access_denied`; account linking is not yet verified.

- A production cancellation POST returned 303, proving the consent guard passed, but Chrome blocked the return under `form-action 'self'`. The real consent page and unchanged service worker reproduce this locally; allowing the exact callback reaches the isolated callback. Website fix `5abf4d6335` permits only the server-validated ChatGPT callback. Three regression suites pass after rebase; build and promotion are pending. No service-worker change is needed. A read-only production aggregate finds one newly created grant and zero consumed codes, consistent with accepted consent followed by a blocked callback.

[Qualification evidence](evidence/live-qualification-2026-09-30.json) records the current results and preserves the earlier canary. Anonymous shopping checks do not prove OAuth grants or Events delivery.

## Finish before submission

- Complete real ChatGPT account linking after approval at the first-party consent page.
- Qualify Events subscription and signed callback delivery before activation.
- Supply dedicated OAuth reviewer access. Credentials and gateway secrets must stay outside the ZIP.
- The draft Events guidance requires an explicit user-selected product and item-price threshold, advertised Events support and account linking. Qualify this review case, freeze the ZIP from `openai/` only, cancel the superseded review, upload the replacement, check the MCP scan, and complete the final submission.
- Verify the released host after publication. The published 1.0.1 connection remains cached until the replacement is released.

The downloaded 1.1.0 package and portal review supplied the existing listing identity. The earlier review has not been cancelled. Events remains disabled and 1.2.0 remains unsubmitted until the integration gates pass.

## Separate ACP deliverable

The CSS-backed offline export contains 10,000 items across 20 families, 406 sellers and 246 brands. Twenty representative PDPs and twenty images returned HTTP 200 under browser-UA HEAD checks; full crawler qualification is not claimed. The local bundle is `/Users/gp/Downloads/bestprice-acp-css-2026-09-30.zip`.

The ACP export is outside the plugin ZIP. No feed has been uploaded or accepted by an external commerce partner.
