# BestPrice MCP provider setup

The canonical provider setup guide is [`docs/provider-setup.md`](docs/provider-setup.md).

Current public endpoint: `https://mcp.bestprice.gr/mcp`

Current read-only tools:

- `get_shopping_decision` — recommendations, needs, comparisons, and basket plans
- `search_products` — known products, models, categories, and barcodes
- `compare_offers` — current Greek merchant offers, shipping, and delivered totals
- `get_price_history` — historical pricing and “is this price good?” questions

The provider-neutral shopping skill is [`skills/bestprice-shopping/SKILL.md`](skills/bestprice-shopping/SKILL.md).
