# Connect BestPrice

Every client below uses the same keyless endpoint. No API key, header, or BestPrice account.

```text
https://mcp.bestprice.gr/mcp
```

Transport is Streamable HTTP. The tools are `get_shopping_decision`, `search_products`, `compare_offers`, and `get_price_history`. They are read-only.

Privacy: <https://www.bestprice.gr/policies/privacy>
Support: <https://www.bestprice.gr/contact>

## Perplexity

Perplexity Pro, Max, and Enterprise can add a custom remote connector.

1. Open **Account settings > Connectors**.
2. Choose **+ Custom connector**, then **Remote**.
3. Paste:

| Field | Value |
| --- | --- |
| Name | `BestPrice Shopping` |
| MCP server URL | `https://mcp.bestprice.gr/mcp` |
| Authentication | `None` |
| Transport | `Streamable HTTP` |

4. Save, enable the connector, and select it as a source in a new thread.

Enterprise admins can add the same URL for the workspace. This does not create a public Perplexity listing.

## Claude

Claude.ai, Claude Desktop, and Claude Code:

[Connect BestPrice to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=BestPrice&connectorUrl=https%3A%2F%2Fmcp.bestprice.gr%2Fmcp)

Or paste the URL yourself under **Customize > Connectors > Add custom connector**. Team and Enterprise workspaces need an owner to add it under **Organization settings > Connectors**.

Claude Code:

```sh
claude mcp add --transport http bestprice-shopping https://mcp.bestprice.gr/mcp
claude mcp get bestprice-shopping
```

Project config, from [`.mcp.json`](../.mcp.json):

```json
{
  "mcpServers": {
    "bestprice-shopping": {
      "type": "http",
      "url": "https://mcp.bestprice.gr/mcp"
    }
  }
}
```

## ChatGPT developer mode

The published ChatGPT plugin is temporarily unavailable while the updated version is under review. Developer mode can still add the endpoint as a custom connector on accounts that support custom connectors.

1. Open ChatGPT **Settings > Connectors > Advanced > Developer mode**.
2. Create a custom connector.
3. Name it `BestPrice Shopping` and paste `https://mcp.bestprice.gr/mcp`.
4. Leave authentication empty. Confirm the four read-only tools appear.

For the Responses API, the same URL is a remote MCP tool with no approval required for these read-only tools:

```js
tools: [{
  type: 'mcp',
  server_label: 'bestprice',
  server_url: 'https://mcp.bestprice.gr/mcp',
  require_approval: 'never',
  allowed_tools: ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'],
}]
```

## Gemini CLI

```sh
gemini extensions install https://github.com/TheBestCo/bestprice-mcp
```

Or add the server directly:

```json
{
  "mcpServers": {
    "bestprice-shopping": {
      "httpUrl": "https://mcp.bestprice.gr/mcp"
    }
  }
}
```

The extension's `includeTools` list is the same four tools. Gemini CLI does not need a BestPrice key.

## Copilot

GitHub Copilot CLI:

```sh
copilot mcp add --transport http \
  --tools get_shopping_decision,search_products,compare_offers,get_price_history \
  bestprice-shopping https://mcp.bestprice.gr/mcp
```

VS Code:

[Add BestPrice to VS Code](vscode:mcp/install?%7B%22name%22%3A%22bestprice-shopping%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.bestprice.gr%2Fmcp%22%7D)

Microsoft 365 Copilot does not take this URL in a settings box. The declarative-agent package and the sideload steps are in [`distribution/microsoft-copilot/README.md`](../distribution/microsoft-copilot/README.md). Copilot Studio can also add the same URL as an existing MCP server with authentication **None**.

## Grok Bot

Add a custom MCP connector with URL `https://mcp.bestprice.gr/mcp` and no authentication. Grok reads the tool list from the server.

For a project that already uses MCP config files, the same block as Claude's `.mcp.json` above is enough.

## Cursor

[Add BestPrice to Cursor](https://cursor.com/install-mcp?name=bestprice-shopping&config=eyJ1cmwiOiJodHRwczovL21jcC5iZXN0cHJpY2UuZ3IvbWNwIn0%3D)

Or under **Settings > Tools & MCP** add an HTTP server named `bestprice-shopping` with URL `https://mcp.bestprice.gr/mcp`. The decoded one-click config is only:

```json
{
  "url": "https://mcp.bestprice.gr/mcp"
}
```
