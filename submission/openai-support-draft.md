# Existing-plugin upgrade: review metadata and OAuth setup

Please help us complete an update to the existing BestPrice plugin without changing its public identity or interrupting its four anonymous shopping tools.

Plugin ID: `plugin_asdk_app_6a8d8ed6e2bc8191b3caaf7214f3c981`

Associated app: `asdk_app_6a8d8ed6e2bc8191b3caaf7214f3c981`

Submitted package: `appsub_6abd16a16bb4819193e6e6bdc6337af1`, version `1.2.0`.

We uploaded the corrected Codex compatibility ZIP with presentation fields at the root and `review` / `publication` under `extensions.com.openai`, following the current submission documentation. Download draft ZIP returns the new 1.2.0 release notes, five positive cases (including OAuth-bound Events), three negative cases, the new demo recording URL and Greek translation. Before submission, the Review information drawer still showed the preceding 1.1.0 release notes, cases, demo URL and translation after a page reload. Version 1.2.0 is now In review. The inspected submitted-version controls no longer expose Review information / Review details, so we cannot verify the final applied reviewer materials. These fields are marked managed by the ZIP. The documentation says explicit scalar values are reapplied on submission; please confirm how the reviewer cases and publication details are applied for this legacy associated app and whether the stale drawer is expected.

The existing associated app shows Authentication: No authentication, with the message “Connection details for individual MCP servers are unavailable.” We need optional OAuth account linking limited to `events:subscribe`; public shopping remains anonymous. The MCP server picker also lists the package-declared BestPrice server at the same public URL, but this selection shows “Complete MCP setup” / “Connection unknown” without a Connect or Reconnect control.

Which supported migration or setup step changes this existing public integration to optional OAuth while preserving its plugin ID and shopping access? A separate private qualification connector has already completed real account linking, native `price.dropped` subscription, signed callback verification, Resume, periodic production catalog observations and Pause against the same server. Native search, offers and history also work with CSP enforcement enabled. No genuine threshold-crossing notification has yet been observed.

MCP endpoint: `https://mcp.bestprice.gr/mcp`

Protected resource metadata: `https://mcp.bestprice.gr/.well-known/oauth-protected-resource`

A fresh MCP scan at 15:27:32 UTC on 30 September reports no issues; all four shopping tools, including get_shopping_decision, are now Live. The new public decision definition has no history input, and the 51-check production canary passes.

The package display name is BestPrice, our established brand and verified business identity. The metadata check flags it as a ranking, superlative or guarantee; please review it as a proper brand name. We do not make a lowest-price guarantee.

No reviewer credentials, account identifier, authorization code, token, callback URL or webhook signing secret are included in this request. The portal confirms that 1.2.0 is In review; the published 1.0.1 release remains live. The package-declared server still shows Connection unknown after submission.
