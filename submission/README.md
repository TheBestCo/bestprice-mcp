# OpenAI plugin release 1.2.0

`openai/` is the replacement ZIP source for the existing BestPrice
plugin, preserving its assigned package identity and public MCP URL. This
plugin version is independent of the distribution/WebMCP package version.

The draft includes native-workspace screenshots, the existing brand asset,
current-task-only shopping instructions, and six positive/three negative
review cases. The baseline backend release is `b5182ac5b9f`; follow-up `3199380c5b2` adds
BestPrice branding, v5 workspace compatibility and the OAuth activation default; ordinary shopping remains
anonymous and read-only. OAuth is limited to `events:subscribe`.

## Finish before submission

- Verify the deployed native workspace with the production canary.
- Promote BestPrice.gr OAuth build 18151 (body fix) to production and verify discovery.
- Qualify real ChatGPT account linking, Events subscription and callback.
- Replace qualification screenshots with final production screenshots.
- Supply a reviewer-accessible demo recording and dedicated reviewer access
  for OAuth. Never include reviewer credentials or gateway secrets in the ZIP.
- Freeze a ZIP from `openai/` only, cancel the superseded review, upload the
  replacement, check the live scan and complete the final submission.

The downloaded 1.1.0 package and portal review served as the listing source.
No existing review was cancelled during preparation. The ACP deliverable is
the separately validated offline 10,000-product export; no feed is uploaded.

The separate CSS-backed sample is now validated: 10,000 items, 20 represented
families, 406 sellers and 246 brands. All 20 representative PDPs and 20 images
returned HTTP 200 under browser-UA HEAD checks; full crawler qualification is
not claimed. A local export bundle is saved as
`/Users/gp/Downloads/bestprice-acp-css-2026-09-30.zip`. It is outside the plugin ZIP.
