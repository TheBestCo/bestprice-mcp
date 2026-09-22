# BestPrice WebMCP

BestPrice adds page-local WebMCP tools to the shopping journey at
[`www.bestprice.gr`](https://www.bestprice.gr/). A compatible agent can search,
inspect the products and controls that are actually on the open page, apply a
visible filter or sorting option, open a returned product, compare rendered
offers, read specifications, inspect price history, and move the shopper's own
tab to one offer the page already shows.

The shopper stays on BestPrice and keeps the final choice. There is no checkout
tool, no background account access, and no direct merchant URL in a tool result.

## Run the evaluator

The evaluator is deliberately dependency-free and uses a small deterministic
fixture. It makes no external request and is not presented as live catalog data.

```sh
git clone https://github.com/TheBestCo/bestprice-mcp.git
cd bestprice-mcp
python3 -m http.server 4173
```

Open `http://localhost:4173/webmcp/demo/`. In a browser with WebMCP, the page
registers native tools. In an ordinary browser, the same contracts are exposed
through the built-in local inspector so every result can still be reviewed.

Run the source and manifest tests with:

```sh
npm test
```

## Source map

- [`src/contracts.js`](src/contracts.js) contains the 14 contextual tool
  contracts, schemas, and safety annotations.
- [`src/runtime.js`](src/runtime.js) owns cancellation, timeout, contextual
  re-registration, and fail-closed rollback.
- [`src/demo-adapter.js`](src/demo-adapter.js) is the deterministic evaluator
  adapter.
- [`demo/app.js`](demo/app.js) renders the human-visible page and exercises the
  same contracts without a framework.
- [`test/webmcp.test.js`](test/webmcp.test.js) pins the contracts, the fail-closed
  runtime, and the full fixture journey; [`test/evals.test.js`](test/evals.test.js)
  validates the dataset below against the contracts.
- [`evals/`](evals/) contains the versioned Greek natural-language dataset
  (v1: 43 cases, frozen; v2: 47 cases, current) and the separate deterministic
  and browser-agent evaluation criteria.

## Production surface

Production registers only the tools relevant to the open page:

| Page | Tools |
| --- | ---: |
| Home | 1 |
| Search, category, or hub listing | 8 |
| Product page | 7 |
| Unique contracts | 14 |

The seventh product-page entry, `show_offer`, is an action verb: it scrolls to
one rendered offer and marks it for the shopper, and it returns no merchant
link.

Contract 1.7 (2026-09-22) makes every bounded read continuable and says how
much of the page it covered: `get_visible_products`, `get_listing_filters` and
`get_product_specifications` take an `offset` and return `next_offset`;
`get_listing_filters` can read one `group` in full, including the values a long
list keeps behind «Εμφάνιση όλων»; and `compare_page_offers` reports
`stores_considered` of `stores_total`, marks a comparison `partial` while more
stores are behind «Όλες οι τιμές», and loads them on `include_all_stores`.
Version 1.6 added `fact` to `get_product_specifications`: a fact name a
previous call returned reads that fact in full.

Parity is checked field by field, not by version string: the storefront tests
the schemas its pages register against the manifest it serves,
`test/contract-parity.test.js` checks this contract against a committed
snapshot of those pages, and the submission canary compares the manifests on
`www.bestprice.gr` and `mcp.bestprice.gr` as one document. The evaluation
datasets up to 8.0.0 grade against contract 1.6; `test/dataset-v3.test.js`
names the arguments published since.

The machine-readable production inventory is available at
[`/.well-known/webmcp.json`](https://www.bestprice.gr/.well-known/webmcp.json).
The inventory is informational; tools are registered by the page runtime, and
their results are derived from current first-party page state.

The BestPrice catalog, ranking system, and commerce backend predate the OpenAI
WebMCP Challenge and remain part of the main BestPrice service. The WebMCP
extension was materially expanded after the challenge opened on August 25,
2026. This directory contains the complete open-source challenge layer and a
self-contained evaluator for it.

## Safety choices

- IDs and URLs must match a product that is currently visible.
- Navigation tools can only use first-party controls that are already on the
  page.
- Read tools return bounded structured output.
- Hidden and cross-origin elements are rejected.
- Shipping that is not known remains `null`; it is never described as free.
- Offer results have no merchant click-through URL. The shopper chooses on the
  BestPrice page.
- The one offer action marks a rendered row only; it never opens a merchant
  page and never returns a merchant URL.
- Partial or timed-out registration aborts the whole contextual tool set.
- Tool measurement is isolated from execution and cannot break a result.

Licensed under the repository's [Apache License 2.0](../LICENSE).
