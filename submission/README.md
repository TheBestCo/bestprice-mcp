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
- Deploy the CIMD transport correction `8ef33b78bdd` and verify that a valid
  authorization request reaches sign-in or consent. Production issuer and
  protected-resource discovery now return HTTP 200 with the expected metadata.
- Promote website `9ec574b5d0` (Jenkins 18155 passed) to align the AI Catalog
  and ARD display names, then rerun the strict cross-host canary.
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

Production now serves BestPrice/v5 metadata and the OAuth ingress correction
through `/mcp/oauth-protected-resource`. Website `8e21467bb8` is serving the
styled, body-correct OAuth responses; the isolated discovery checks passed on
2026-09-30. The strict canary found one remaining AI Catalog/ARD display-name
mismatch, corrected by `9ec574b5d0`. A valid live authorization request also
exposed compressed CIMD metadata decoding failure; `8ef33b78bdd` pairs fetch
with its installed Undici Agent. Its ten OAuth tests and the normal pre-push
closure of 227 files passed. Deployment and real account linking remain gates;
Events is still disabled and the replacement ZIP has not been submitted.
