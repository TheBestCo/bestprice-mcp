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

- Public shopping/native UI qualification passed: 51 checks on production
  revision `fab1f8f217c`, including the native launch, compatibility resources,
  four public tools, and strict cross-host AI Catalog/ARD parity. Website
  `9ec574b5d0` branding is now confirmed live.
- Complete [Operations #498](https://github.com/TheBestCo/Operations/issues/498),
  assigned to Gabriel: forward the standard protected-resource metadata path
  to `bp-agent-commerce`, then retry automatic OAuth discovery in ChatGPT.
- Qualify real ChatGPT account linking, Events subscription and callback.
- Final v5 screenshots now come from the development connection to the same
  native UI using live production catalog data. The released 1.0.1 host remains
  cached until replacement publication; verify the published host after release.
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

Production serves BestPrice/v5 metadata and the OAuth ingress correction
through `/mcp/oauth-protected-resource`. Website `8e21467bb8` serves the styled,
body-correct OAuth responses. The issuer discovery checks pass, and a valid
ChatGPT authorization request now returns HTTP 303 to first-party sign-in.
The CIMD fetch/Agent pairing is corrected by `8ef33b78bdd`; controlled metadata
failure descriptions are in `697ce242319`, deployed by successful Jenkins
28275. The normal pre-push closure of 227 files passed. Twelve live checks on
that exact revision pass across modern and legacy MCP, covering the anonymous
home, four read-only tools, absence of conversation-history input, and native
workspace compatibility resources.

[Current qualification evidence](evidence/live-qualification-2026-09-30.json)
keeps account linking and Events delivery explicitly unverified. The strict
cross-host public canary is now 51/51 green. Browser access is restored; the
actual ChatGPT New Plugin form exposes the remaining OAuth discovery gap.
`/.well-known/oauth-protected-resource` returns Apache 404 on the public MCP
host, while `/mcp/oauth-protected-resource` returns the correct application
JSON. The issuer metadata on `www.bestprice.gr` also returns 200 with CIMD and
PKCE S256. Operations #498 requests the missing edge route and defines the
acceptance checks. Keep the exact canonical CIMD callback policy; do not widen
it to the unrelated callback offered by the manual-client fallback.

After Operations confirms the route is live, retry discovery in the preserved
OAuth qualification form, select CIMD and optional OAuth, then complete real
linking and delivery qualification. Events remains disabled; the replacement
ZIP remains unsubmitted until those gates pass. The 51 public checks are not
proof of OAuth linking or Events delivery.
