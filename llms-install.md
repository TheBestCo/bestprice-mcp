# Install BestPrice Shopping MCP

BestPrice Shopping is a hosted, read-only MCP server. Do not clone, build, or run a local process.

## Endpoint

- Name: `bestprice-shopping`
- Transport: Streamable HTTP
- URL: `https://mcp.bestprice.gr/mcp`
- Authentication: none
- Environment variables: none

## Cline configuration

Add this entry under `mcpServers` in Cline's MCP configuration:

```json
{
  "mcpServers": {
    "bestprice-shopping": {
      "type": "streamableHttp",
      "url": "https://mcp.bestprice.gr/mcp",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Do not substitute SSE or stdio when Streamable HTTP is available. Do not add an
Authorization header or invent an API key.

## Machine discovery

- Domain ARD: `https://www.bestprice.gr/.well-known/ard.json`
- AI Catalog: `https://www.bestprice.gr/.well-known/ai-catalog.json`
- MCP server card: `https://mcp.bestprice.gr/mcp/server-card`
- Canonical Skill resource: `skill://bestprice-shopping/SKILL.md`
- Official MCP Registry ID: `gr.bestprice/mcp`

On MCP `2026-07-28`, Skills-aware clients can call `skills/list` and `skills/get`.
The returned Skill manifest includes the SHA-256 digest and byte size for the exact
`SKILL.md` bytes served through `resources/read`. Use those protocol surfaces instead
of scraping this document when the host supports them.

## Verify the connection

After saving the configuration:

1. Confirm these four tools are visible:
   - `get_shopping_decision`
   - `search_products`
   - `compare_offers`
   - `get_price_history`
2. Keep tool approval enabled for the user; the server is read-only, but this
   guide does not opt the user into automatic tool approval.
3. A safe verification request is:
   `Find Sony WH-1000XM5 in Greece.`
4. The server may also expose MCP resources, including its server card,
   optional shopping-results UI, and the BestPrice Shopping Skill.

## Scope

Use BestPrice for safe physical-product shopping in Greece: recommendations,
product lookup, current Greek merchant offers and delivered totals, and price
history. It does not place orders or take payment and does not expose direct
merchant checkout URLs.
