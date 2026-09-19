# Public MCP integrity diagnostic

Run explicitly from an installed checkout:

```sh
npm ci
node scripts/public-smoke.mjs report.json
# Release verification: require the serving artifact's full revision, not merely any healthy build.
node scripts/public-smoke.mjs report.json EXPECTED_40_CHARACTER_REVISION
```

The probe has no credentials or rate-limit exemption and never follows redirects or visits a
returned BestPrice landing or merchant URL. It only requests the fixed production `/healthz`
and `/mcp` endpoints. Do not schedule frequent or concurrent runs on shared egress.

Both lanes use the installed MCP SDK. The JSON lane changes POST Accept to `application/json`;
the dual lane uses the SDK's normal JSON/SSE negotiation. Each lane initializes, lists tools,
searches a known model, compares a returned product's offers with a postcode, reads its history,
and asks for a laptop under a 600 EUR **item-price** budget. The SDK owns protocol/SSE parsing.
The diagnostic's finite response buffering is not a streaming-latency measurement.

The verdict requires the exact four-tool inventory, published input and output schemas,
transport descriptor parity, a consistent text/structured mirror, product/window/postcode
identity, unique results, cent arithmetic, null unknown shipping, and approved HTTPS landing/CDN
URL shapes. URL shape validation is **not** cryptographic signature verification. Positive
smoke tasks require nonempty results; a legitimate empty result still means this positive
control did not pass, not proof of a service defect.

Bounds are 40 requests, 2 MB per finite response, 15 seconds per request and 120 seconds overall.
There are no retries. The SDK's optional event-channel GET may return 405; rate limiting,
server failures or a missing/mixed revision must not disappear into a green overall result.
Only successful sampled responses attest the revision. Rejected responses retain their status
and a revision only when syntactically valid.

Reports include enums, counts, timings, revision and descriptor hashes. They exclude catalog
rows, shopper text, signed URLs and raw exception messages. `qualification: false` is explicit.
Tests inject synthetic corruptions and exercise the real installed client without network calls;
`npm test` never invokes the production CLI automatically.

A pass is one bounded observation. It does not certify catalog recall, ranking optimality,
all product families, all deployed allocations, the modern per-request protocol, native WebMCP
agent behavior, or the completion-guard experiment. Frozen release ledgers and thresholds are
not modified. Native WebMCP and Shopping Brain qualification remain independent workstreams.
