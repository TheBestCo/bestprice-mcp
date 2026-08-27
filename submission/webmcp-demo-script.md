# Recorded demo script: 1 minute 33 seconds

No music. Use the real BestPrice logo and live BestPrice pages. Keep third-party
merchant marks secondary to the page journey.

The finished submission video is 93.238 seconds at 1280×720, with H.264 video
and AAC audio. It stays outside Git until it is uploaded to the public video
URL required by the challenge.

## 0:00–0:10

Open `www.bestprice.gr` in ChatGPT's in-app browser.

Voiceover:

> Shopping agents should not have to guess what a page means. BestPrice now
> exposes a small, contextual set of tools through WebMCP. The person and the
> agent work on the same open shopping page, and every navigation remains
> visible.

## 0:10–0:29

Prompt: `Find a 256GB phone under €800 on BestPrice.`

Show `search_bestprice`, then the results page. Ask the agent to list the
visible products and apply one visible brand filter.

Voiceover:

> This evaluator is running with native WebMCP. On the home view, the agent gets
> one tool: search BestPrice. When it starts a phone search, the page becomes a
> listing and the available tool set changes automatically.

## 0:29–0:46

Ask: `Open the Samsung product you returned.`

Show `open_visible_product` and the product page.

Voiceover:

> The agent can inspect only products that are currently visible. It can read
> the filters and sorting choices already rendered on the page, then apply one
> of those choices. It cannot construct a hidden filter or invent a product URL.

## 0:46–1:04

Ask: `Compare the delivered price of the visible offers, then give me the key specifications.`

Show the structured offer result and the page. Point out one unknown shipping
value if present.

Voiceover:

> To open a product, the requested numeric ID must match a visible card and its
> first-party BestPrice link. The product page then replaces the listing tools
> with six product tools.

> The agent can read product facts, compare visible offers, inspect
> specifications, and summarize price history. Shipping that is unknown stays
> unknown, merchant links are not returned, and checkout is deliberately out of
> scope. The shopper still chooses the store.

## 1:04–1:22

Ask: `Is today's price low compared with its history? Show me the chart.`

Show the summary and the chart opening on the page.

Voiceover:

> The price-history action opens the same chart the person can inspect. Read
> outputs are bounded, registration is cancellable and fails closed, and every
> successful tool call is measured without letting analytics break the shopping
> experience.

## 1:22–1:33

Show `github.com/TheBestCo/bestprice-mcp/tree/main/webmcp`.

Voiceover:

> The thirteen contextual tool contracts, executable safety checks,
> deterministic evaluator, and tests are open source under Apache 2.0. The same
> WebMCP journey is live on BestPrice today.
