# BestPrice Shopping - Cursor Plugin

This directory contains the Cursor Marketplace plugin configuration for BestPrice Shopping.

## Files

- `plugin.json` - Cursor plugin manifest with metadata, logo, and MCP server reference
- `skills/SKILL.md` - Agent skill that guides effective use of BestPrice Shopping tools

## MCP Server

The MCP server configuration is in the root `mcp.json` file, which defines the public HTTP endpoint at `https://mcp.bestprice.gr/mcp`.

## Marketplace Submission

To submit this plugin to the Cursor Marketplace:

1. Visit https://cursor.com/marketplace/publish
2. Enter the repository URL: `https://github.com/TheBestCo/bestprice-mcp`
3. Follow the submission workflow

## Tools Provided

- `get_shopping_decision` - Evidence-backed product recommendations
- `search_products` - Search by product name, model, or brand
- `compare_offers` - Compare prices, merchants, and shipping options
- `get_price_history` - View price trends over time

All tools are read-only and require no API key or authentication.
