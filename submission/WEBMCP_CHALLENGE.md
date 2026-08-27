# OpenAI WebMCP Challenge submission

## Project

**BestPrice: shop with the page, not around it**

Live app: `https://www.bestprice.gr/`

Public guide: `https://www.bestprice.gr/mcp`

Repository: `https://github.com/TheBestCo/bestprice-mcp`

Source and evaluator: `https://github.com/TheBestCo/bestprice-mcp/tree/main/webmcp`

## Short description

BestPrice turns the shopping page a person already has open into a small,
structured workspace for their agent. The agent can use the products, filters,
sorting choices, offers, specifications, and price history that are actually on
that page. The person sees every navigation and keeps the decision about which
shop to visit.

## What changed during the challenge

BestPrice and its remote MCP server existed before August 25, 2026. The
challenge work is the browser-native layer. During the challenge window we:

1. shipped actual `document.modelContext.registerTool` implementations across
   home, listing, hub, and product pages;
2. expanded the surface to 13 contextual tools;
3. added safe filter, sorting, product-opening, offer-comparison,
   specification, and price-history actions;
4. added first-party attribution and operational telemetry;
5. hardened registration with cancellation, timeout, rollback, output limits,
   same-origin checks, hidden-element rejection, and executable validation;
6. published this Apache-2.0 source package and deterministic evaluator.

The public Git history provides dated evidence of those changes.

## Why WebMCP matters here

A shopping assistant should not scrape visual cards, guess a product URL, or
silently choose a merchant. WebMCP lets BestPrice provide the small set of
actions that make sense for the page while the shopper can see the same page
change. The result is more reliable than UI guessing and more collaborative
than a remote API running out of sight.

## Human-agent journey

1. Ask the agent to search for a phone.
2. Ask what is visible, or ask it to apply a visible brand filter and sort by
   the lowest current price.
3. Ask it to open one of the returned products.
4. Ask it to compare delivered prices, read specifications, and summarize
   price history.
5. Review the live BestPrice page and choose a shop yourself.

## Responsible execution

The WebMCP surface is intentionally bounded. It does not buy, add to basket,
log in, expose direct merchant URLs, or turn unknown shipping into zero. A
product can be opened only if the exact product ID and its canonical
first-party link are both present in the visible listing. Read output is capped
for browser-agent use, and a partial registration failure rolls back the full
page tool set.

## Evaluation

```sh
npm test
python3 -m http.server 4173
```

Then open `http://localhost:4173/webmcp/demo/`. The local inspector makes the
13 tool contracts reviewable without experimental browser setup; a WebMCP
browser registers them natively.
