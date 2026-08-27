# Demo script: 2 minutes 20 seconds

No music. Use the real BestPrice logo and live BestPrice pages. Keep third-party
merchant marks secondary to the page journey.

## 0:00–0:18

Open `www.bestprice.gr` in ChatGPT's in-app browser.

Voiceover:

> Shopping agents should not have to guess what a page means. BestPrice now
> exposes a small set of page tools through WebMCP, so the person and the agent
> can work on the same shopping page.

## 0:18–0:48

Prompt: `Find a 256GB phone under €800 on BestPrice.`

Show `search_bestprice`, then the results page. Ask the agent to list the
visible products and apply one visible brand filter.

Voiceover:

> The agent starts a normal BestPrice search. On the listing it can only read
> products and controls that are actually rendered. It can apply a visible
> filter or sort option, and every navigation stays in this tab.

## 0:48–1:15

Ask: `Open the Samsung product you returned.`

Show `open_visible_product` and the product page.

Voiceover:

> It cannot invent a product URL. The ID must match a visible card and its
> first-party canonical link before the page opens.

## 1:15–1:50

Ask: `Compare the delivered price of the visible offers, then give me the key specifications.`

Show the structured offer result and the page. Point out one unknown shipping
value if present.

Voiceover:

> Offers are compared by delivered price when shipping is known. Unknown
> shipping stays unknown, merchant links stay on BestPrice, and the person
> still chooses the shop.

## 1:50–2:12

Ask: `Is today's price low compared with its history? Show me the chart.`

Show the summary and the chart opening on the page.

Voiceover:

> Price history is read from first-party data, and the final action focuses the
> same chart the shopper can inspect.

## 2:12–2:20

Show `github.com/TheBestCo/bestprice-mcp/tree/main/webmcp`.

Voiceover:

> The 13 contextual tool contracts, safe registration runtime, evaluator, and
> tests are open source. This is live on BestPrice today.
