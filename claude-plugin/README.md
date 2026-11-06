# BestPrice

BestPrice is the Claude plugin from BestPrice.gr, the Greek price comparison service. It helps Claude answer shopping questions about physical products available in Greece: what to buy, where a known product is cheapest including shipping, and whether today's price is good compared with its price history.

## What the plugin contains

- One remote MCP server, `bestprice-shopping`, declared in `.mcp.json`. It connects over Streamable HTTP to https://mcp.bestprice.gr/mcp.
- One skill, `bestprice-shopping`, that tells Claude when to use each tool and how to report prices without guessing.

The plugin has no hooks, commands, agents, scripts, or local code, and it installs no packages.

## Install

In Claude Code, install it from the BestPrice marketplace in this repository:

```
/plugin install bestprice-shopping --marketplace TheBestCo/bestprice-mcp
```

## Tools

The server is read-only and needs no account, API key, or sign-in. It exposes four tools:

- `get_shopping_decision`: recommendations, comparisons, and basket plans
- `search_products`: product lookup by name, model, category, or barcode
- `compare_offers`: current Greek merchant offers, shipping, and delivered totals
- `get_price_history`: historical prices for a product

`get_price_history` is historical only. BestPrice does not provide forecasts or target prices. The tools do not place orders or create price alerts.

## Data and privacy

When Claude calls a tool, the plugin sends the tool arguments, such as the shopping request, a product ID, or an optional Greek postcode, to https://mcp.bestprice.gr/mcp, which is operated by BestPrice. It sends nothing else and never reads files or credentials from your machine. See the privacy policy at https://www.bestprice.gr/policies/privacy.

## Support

Setup guides for other clients are at https://www.bestprice.gr/mcp. Source and issues: https://github.com/TheBestCo/bestprice-mcp. Contact: https://www.bestprice.gr/contact.

## License

Apache-2.0. See `LICENSE`.
