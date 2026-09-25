# BestPrice WebMCP

BestPrice adds page-local WebMCP tools to the shopping journey at
[`www.bestprice.gr`](https://www.bestprice.gr/). A compatible agent can search
and read the results, inspect the products and controls that are actually on the
open page (the home page's sections included), apply a visible filter or sorting
option, open any product by id (its page read before the tab moves), compare
rendered offers, read specifications, inspect price history and open its chart,
move the shopper's own tab to one offer the page already shows, and ask the
BestPrice Shopping Brain what to buy — from every public BestPrice page, articles
and stores included.

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

- [`src/contracts.js`](src/contracts.js) contains the 13 contextual tool
  contracts of WebMCP contract 2.0: input and output schemas and safety
  annotations. Each tool's title, description, input and output schema come from
  [`src/storefront-catalog.js`](src/storefront-catalog.js), generated from the
  storefront's own catalog.
- [`src/contract-parity.js`](src/contract-parity.js) reads the storefront's
  registered tools and compares them with the published contract.
- [`src/runtime.js`](src/runtime.js) owns cancellation, timeout, contextual
  re-registration, and fail-closed rollback.
- [`src/demo-adapter.js`](src/demo-adapter.js) is the deterministic evaluator
  adapter. Every result it returns fits its tool's published output schema; its
  `get_shopping_decision` answers from the fixture unless the host injects
  `decide`, so it never reaches the network on its own.
- [`demo/app.js`](demo/app.js) renders the human-visible page and exercises the
  same contracts without a framework.
- [`test/webmcp.test.js`](test/webmcp.test.js) pins the contracts, the fail-closed
  runtime, and the full fixture journey; [`test/evals.test.js`](test/evals.test.js)
  validates the dataset below against the contracts.
- [`evals/`](evals/) contains the versioned Greek natural-language dataset
  (v1–v12 frozen; v13, 47 cases grading contract 2.0, current) and the separate deterministic
  and browser-agent evaluation criteria.

## Production surface

Production registers only the tools relevant to the open page:

| Page | Tools |
| --- | ---: |
| Home | 4 |
| Search, category, or hub listing | 8 |
| Product page | 8 |
| Any other public page (articles, deals, stores, brands, …) | 3 |
| Unique contracts | 13 |

Every page registers `search_bestprice` first, `open_product` among its own tools,
and `get_shopping_decision` last. The product page's `show_offer` is an action
verb: it scrolls to one rendered offer and marks it for the shopper, and it
returns no merchant link.

Contract 2.0 (2026-09-25, registration revision 2026-09-25.13) consolidates the
surface to 13 tools. `open_product` opens any BestPrice product by `product_id`
from every page — a search result, a card, the Shopping Brain's pick: it reads
the product page first and answers `outcome: 'confirmed'` with its facts (title,
category, price, store count, rating), then moves the tab; an id BestPrice has no
page for is refused (`not_found`) and one below 2^31, a single store's own offer,
is refused as `store_offer` and never loaded. `get_listing_filters` also returns
the listing's `sort_options` (each with its sort `key`) and the active `sort`;
`summarize_price_history`'s `show_chart` is the one way to open the chart. Four
tools are gone:

| Contract 1.9 | Contract 2.0 |
| --- | --- |
| `open_visible_product` | `open_product` (any product, not only a visible card) |
| `get_product_details` | `open_product`, then the product page's own reads |
| `get_listing_sort_options` | `get_listing_filters` (`sort_options`, `sort`) |
| `show_price_history` | `summarize_price_history` with `show_chart: true` |

Every description is one sentence of at most 160 characters — what the tool does,
what it returns, what it changes — and names no other tool, except that
`search_bestprice` (a named product) and `get_shopping_decision` (advice) point at
each other; one wording serves every page. Rigid boolean consts in the output
schemas are plain booleans.

Contract 1.9 (2026-09-25) reached every public page and every product from it.
Pages without tools of their own — articles and guides, deals, lists, stores,
brands, collections, comparisons, stories — register `search_bestprice`,
`get_product_details` and `get_shopping_decision` (page type `site`).
`get_product_details`, on every page, reads one product's offers (ranked by
delivered price), key specifications and price-history summary by
`product_id`, without moving the tab; `include` picks the sections.
`get_shopping_decision` returns the same numeric product ids as the page tools.
Its 2026-09-25 revision narrows `search_bestprice` by price, stock, deals and
order (`min_price_eur`, `max_price_eur`, `in_stock_only`, `deals_only`, `sort`)
and reports what the page applied; takes one product id form everywhere, digits
only; lets `get_product_details` move the tab to the product (`navigate`); keeps
every description to one scannable shape of at most 250 characters; and gives
the item page its own wording for `search_bestprice` and `get_shopping_decision`,
so a description never names a tool its page does not register
(`TOOL_DEFINITIONS[name].pageDescriptions`; `createTools` registers it). A
further revision (2026-09-25.8) puts `get_product_details` on the item page too
(9 tools, with its own wording there); has every tool that moves or reloads the
tab answer first — `outcome: 'dispatched'` with where the tab is going
(`destination_url` or `bestprice_url`) and the `next_tools` that page registers
— and navigate just after; answers `get_product_details` within its deadline
with the sections it could read (the rest `null`, with why), opening the
product when asked even if the read failed; says `results_kind: 'product'` when
a search lands on one model's own page; and trims the output schemas. Since
2026-09-25.9 the published output schemas are a lean projection of the
storefront's strict contract — types, consts, enums, patterns, required fields
and the success/refusal split kept; bounds, formats, `additionalProperties` and
most descriptions dropped, deeper objects published as their type — about half
the size. The package publishes them exactly so, and its tests still validate
every demo result against the strict contract
(`test/fixtures/storefront-strict-output-schemas.json`).
Revision 2026-09-25.12 reads a navigation's destination before the tab moves:
`apply_listing_filter`, `apply_listing_sort` and `clear_listing_filters` answer
`outcome: 'confirmed'` with the `destination` listing (its URL, total, applied
filters, sort key and first three products), `open_visible_product` with the
`product` page's facts, and a navigating `search_bestprice` or
`get_product_details` with `confirmed` — `dispatched`, with an
`unconfirmed_reason`, only when the destination could not be read first. It
also adds optional inputs: `compare_page_offers` returns up to 12 offers and
continues with `offset`/`next_offset`; `get_listing_sort_options` returns each
option's sort `key`, which `apply_listing_sort` takes as well as a label;
`clear_listing_filters` removes one `filter` (or one `value` of it);
`summarize_price_history` opens the chart too with `show_chart`; and
`show_offer` publishes `offer_ref` or `merchant_name` — one of them, checked by
the tool, with no `anyOf` in any input schema (`merchant_id` is no longer
published). `get_visible_products` (`load_more`) and `summarize_price_history`
(`show_chart`) are no longer marked read-only. Input schemas now have one
source on the storefront, and the package takes them, like the words and output
schemas, from its generated document (`src/storefront-catalog.js`);
`src/contracts.js` adds only each tool's annotations and pages. Every nested
output object is typed, so the lean published schemas are about two thirds of
the strict ones.

Contract 1.8 (2026-09-25) gives every tool an output schema — a closed `oneOf`
of its success and its refusal — and rewrites every title and description (at
most 500 characters) to say what the tool does, when to use it, what it returns
and what it changes.
`search_bestprice` reads the results before it moves the tab: it takes an
optional `limit` (1–8) and `navigate` (false only reads) and returns the
product cards, the results page and whether the tab moved. The home page
registers `get_visible_products` and `open_visible_product` over the products
its sections show. `get_shopping_decision`, on every page, asks the BestPrice
Shopping Brain (the public MCP endpoint's tool of the same name) with the
shopper's own words and an optional Greek postcode, and returns the pick,
alternatives, reasons, tradeoffs and unknowns; it is read-only and does not
move the tab. `get_visible_products` can load a listing's next result page
(`load_more`), `compare_page_offers` accepts the product id a decision names
(`product_id`, as `bp_<id>` or numeric) and names an unknown-shipping offer it
leaves out, and `get_product_specifications` reads a fact by its common English
name. Every tool declares `consequentialHint: false`.

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
`test/contract-parity.test.js` checks every field of this contract — words and
output schemas included — and each page's tool list against a committed
snapshot of those pages (`npm run webmcp:snapshot -- <storefront>`
regenerates it), and the submission canary compares the manifests on
`www.bestprice.gr` and `mcp.bestprice.gr` as one document. Evaluation dataset
13.0.0 grades contract 2.0 and is the default; 1.0.0–12.0.0 stay frozen, with
their runs, as the history of contracts 1.6 to 1.9
([`evals/QUALIFICATION.md`](evals/QUALIFICATION.md)).

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

- A product opens only by an id BestPrice has a page for, and only after that
  page is read; a single store's own offer (an id below 2^31) is refused and never
  loaded, and no tool takes a URL.
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
