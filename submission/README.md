# OpenAI plugin release 1.2.0

`openai/` is the replacement ZIP source for the existing BestPrice Shopping
plugin, preserving its assigned package identity and public MCP URL. This
plugin version is independent of the distribution/WebMCP package version.

The draft includes native-workspace screenshots, the existing brand asset,
current-task-only shopping instructions, and six positive/three negative
review cases. The backend release is `b5182ac5b9f`; ordinary shopping remains
anonymous and read-only. OAuth is limited to `events:subscribe`.

## Finish before submission

- Verify the deployed native workspace with the production canary.
- Promote BestPrice.gr OAuth build 18148 to production and verify discovery.
- Qualify real ChatGPT account linking, Events subscription and callback.
- Replace qualification screenshots with final production screenshots.
- Supply a reviewer-accessible demo recording and dedicated reviewer access
  for OAuth. Never include reviewer credentials or gateway secrets in the ZIP.
- Freeze a ZIP from `openai/` only, cancel the superseded review, upload the
  replacement, check the live scan and complete the final submission.

The downloaded 1.1.0 package and portal review served as the listing source.
No existing review was cancelled during preparation. The ACP deliverable is
the separately validated offline 10,000-product export; no feed is uploaded.
