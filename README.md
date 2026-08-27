# BestPrice MCP

Connect compatible AI applications to live product search, offer comparison,
and price history from [BestPrice.gr](https://www.bestprice.gr/). The public
service is read-only and does not require a BestPrice account or API key.
Search currently covers reviewed technology, appliance, and home categories,
not the entire BestPrice catalog. Search prices exclude shipping; offer
comparison reports shipping and delivered totals separately.

- MCP endpoint: `https://mcp.bestprice.gr/mcp`
- Official Registry ID: `gr.bestprice/mcp`
- Public guide: `https://www.bestprice.gr/mcp`
- Support: `https://www.bestprice.gr/contact`
- Security reports: [`SECURITY.md`](SECURITY.md)
- ARD discovery: `https://www.bestprice.gr/.well-known/ard.json`
- WebMCP inventory: `https://www.bestprice.gr/.well-known/webmcp.json`
- Legacy AI Catalog: `https://www.bestprice.gr/.well-known/ai-catalog.json`
- Server card: `https://mcp.bestprice.gr/mcp/server-card`
- Tools: `search_products`, `compare_offers`, `get_price_history`

## Install for Gemini CLI

```sh
gemini extensions install https://github.com/TheBestCo/bestprice-mcp
```

## Install for Qwen Code

```sh
qwen extensions install https://github.com/TheBestCo/bestprice-mcp --consent
```

Or add only the remote server:

```sh
qwen mcp add --scope user --transport http bestprice-shopping \
  https://mcp.bestprice.gr/mcp
```

## Install in VS Code

[Add BestPrice Shopping to VS Code](vscode:mcp/install?%7B%22name%22%3A%22bestprice-shopping%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.bestprice.gr%2Fmcp%22%7D)

VS Code shows the server configuration for review before installing it. The
same configuration can be added manually from [`PROVIDER_SETUP.md`](PROVIDER_SETUP.md).

## Portable Agent Plugin

This repository also follows the vendor-neutral
[Agent Plugins 1.0 specification](https://agent-plugins.org/specification).
Clients that support Agent Plugins can load the root `plugin.json` and
`mcp.json`; the package connects only to the same public, read-only Streamable
HTTP endpoint. Cursor users can also install it from the
[BestPrice Shopping community listing](https://cursor.directory/plugins/bestprice-shopping).

## Use with DeepSeek, Z.ai and GLM

DeepSeek Harness can connect through its official MCP bridge; see
[`examples/deepseek-harness.yml`](examples/deepseek-harness.yml), or run the
ready-to-use [`examples/deepseek-harness.patch.yml`](examples/deepseek-harness.patch.yml)
with `dsh --profile headless --patch`. Z.ai's general API supports third-party
Streamable HTTP MCP servers; a complete Python example is available at
[`examples/zai-glm.py`](examples/zai-glm.py). Provider access needs the relevant
provider account or API key. BestPrice itself needs neither.

## Other clients

See [`PROVIDER_SETUP.md`](PROVIDER_SETUP.md) for OpenAI, ChatGPT, Claude, Grok,
Gemini, DeepSeek, Qwen, Z.ai, GLM, GitHub Copilot, VS Code, Cursor, and Microsoft
Copilot Studio connection examples. Every integration points to the same
endpoint and imports only the three published read-only tools.

## A safe first test

1. Ask: `Βρες μου Sony WH-1000XM5 έως 300 ευρώ.`
2. Pass a returned `product_id` to `compare_offers` with postal code `10558`.
3. Pass the same `product_id` to `get_price_history` for 180 days.

Clients should never invent a product ID, treat unknown delivery as free, make
a purchase, or expose a direct merchant URL.

Privacy: [bestprice.gr/policies/privacy](https://www.bestprice.gr/policies/privacy)  
Terms: [bestprice.gr/policies/terms](https://www.bestprice.gr/policies/terms)
