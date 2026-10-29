# BestPrice for Antigravity

Official BestPrice plugin for the Antigravity App, CLI and IDE. It connects the agent to the
hosted, read-only BestPrice MCP server for shopping in Greece.

- No BestPrice account, API key or OAuth sign-in. The plugin installs enabled.
- MCP server: Streamable HTTP at `https://mcp.bestprice.gr/mcp` (`mcp_config.json`).
- Skill: `bestprice-shopping`, the canonical BestPrice Shopping Skill
  (same file as [`skills/bestprice-shopping/SKILL.md`](../../../skills/bestprice-shopping/SKILL.md)).
- Rule: `rules/AGENTS.md`, always on: read-only use and exact price reporting.

## Tools

- `get_shopping_decision` - evidence-backed product recommendations, comparisons and basket plans
- `search_products` - search by product name, model, category or barcode
- `compare_offers` - current Greek merchant offers, shipping and delivered totals
- `get_price_history` - price history against the 180-day median

All four tools are read-only.

## Install

```sh
agy plugin install ./distribution/antigravity/bestprice-shopping
agy plugin list
```

Validate with `agy plugin validate --strict ./distribution/antigravity/bestprice-shopping`.

## Support and policies

- Support: feedback@bestprice.gr
- Documentation: https://www.bestprice.gr/mcp
- Privacy policy: https://www.bestprice.gr/policies/privacy
- Terms: https://www.bestprice.gr/policies/terms
- License: Apache-2.0. Publisher: The Best Company S.A., publishing as BestPrice.
