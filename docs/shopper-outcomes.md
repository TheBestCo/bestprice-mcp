# Synthetic shopping outcomes diagnostic

This is a bounded, opt-in check of real search responses and the machine-side
answer-to-product route. It is not a benchmark, native-browser qualification,
consumer adoption measurement, or proof of incremental revenue.

Six fixed shopping requests cover three named models, an exact phone capacity,
a Greek budget sentence, external versus internal SSD wording, and a manufacturer
part number. The last two are exploratory: missing evidence is `needs_review`,
not a match. An empty required search fails the diagnostic but still requires a
paired catalog/storefront replay before being called a retrieval defect.

The installed SDK executes the requests. The live published schemas and JSON/text
mirror are checked before independent identity, budget, variant and visible-summary
link checks. Products which appear only in the JSON mirror do not pass the summary
link check. Transport success cannot substitute for semantic correctness.

The probe declares `bestprice-release-canary` in initialization and every HTTP
request. Current backend source classifies this existing name as `bestprice_canary`
and `synthetic`. A landing token must name that synthetic client before any route
request is permitted. Prior `public-smoke.mjs` used `bestprice-integrity-canary`,
which the inspected backend classified as unknown. The existing canary now uses
the recognized name; historical events are not rewritten and the amount of past
report contamination is not claimed.

At most three unique products with passing required-case results are inspected.
Their signed landing URLs are fetched as machine GETs with automatic redirects
disabled. The returned Location must identify the exact grouped product. The
query-free canonical product document is then read with the same manual redirect
policy. No merchant destination, small physical-item ID, query action, script,
image, beacon or browser navigation is executed. The final HTML canonical must
still identify the same grouped product. Token decoding is not signature proof;
the application serving the signed route verifies the signature.

These requests may create **synthetic machine landing events**. Exclude them from
adoption reporting. The probe creates no browser landing, merchant click or charge.
It does not test how ChatGPT, Claude or Gemini render the answer, expired-link UI,
attribution propagation in a browser, purchases, or all production allocations.

Limits: six search tool calls, 28 total HTTP requests, at most three signed routes,
15 seconds per finite request and 180 seconds overall, no retries. The workflow
runs once after its own main-branch edit or an explicit dispatch; it has no schedule.
Existing full tests and formatting must pass before live requests. `needs_review`
does not produce a green overall result. Failures and custody metadata are retained.

The report includes only public product labels, IDs, prices, closed-vocabulary
verdicts, revisions, counts, and digests. Full signed URLs, token/session/decision
identifiers, private shopper queries, credentials and raw response bodies are not
retained. New test cases use synthetic envelopes, not harvested shopper transcripts.

Run from a genuine checkout after `npm ci`:

```sh
npm run check
npm test
node scripts/shopper-outcomes.mjs /tmp/shopper-outcomes.json --live
```

Interpret one run as a time-bounded diagnostic. Preserve its exact code, cases,
source revision, backend revision and failures before changing behavior. Do not
change the historical WebMCP release cases, custody rules, prompts, sample counts,
completion-guard preregistration, or benchmark-blind reviewer to improve this result.
