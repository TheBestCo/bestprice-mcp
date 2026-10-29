# BestPrice - Cursor Plugin

This directory contains the Cursor Marketplace plugin manifest for BestPrice.
The same manifest is what the Grok Bot marketplace reads, because that review goes through
[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

## Files

- `plugin.json` - Cursor plugin manifest. `logo`, `skills`, and `mcpServers` are paths from the
  repository root. They do not use `..`.
- `skills/SKILL.md` - The same canonical shopping skill as `skills/bestprice-shopping/SKILL.md`.
  The manifest points at the repository-root skill directory, which is the copy catalog indexers scan.

## MCP Server

`mcpServers` points at the root [`mcp.json`](../mcp.json), the public Streamable HTTP endpoint
`https://mcp.bestprice.gr/mcp`. Shopping does not need an API key.

## Marketplace submission

Publisher of record: The Best Company S.A., publishing as BestPrice (`feedback@bestprice.gr`).

1. Confirm the repository is public and the square logo at `assets/bestprice-mcp-logo-1024.png` is on the default branch.
2. Open https://cursor.com/marketplace/publish and submit `https://github.com/TheBestCo/bestprice-mcp`.
3. Accept the [Cursor Marketplace Publisher Terms](https://cursor.com/marketplace-publisher-terms) (last updated 6 May 2026) in that form. This repository does not store a click-wrap receipt.

The plugin name `bestprice-shopping` is lowercase kebab-case. The logo is a 1024×1024 PNG.

## Tools

- `get_shopping_decision` - Evidence-backed product recommendations
- `search_products` - Search by product name, model, category, or barcode
- `compare_offers` - Compare prices, merchants, and shipping
- `get_price_history` - Price history against the 180-day median

All four tools are read-only.
