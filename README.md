# BestPrice MCP

[![Test public MCP package](https://github.com/TheBestCo/bestprice-mcp/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/TheBestCo/bestprice-mcp/actions/workflows/test.yml)

![BestPrice MCP: products, offers and price history for AI assistants](https://www.bestprice.gr/extra/mcpLanding/assets/bestprice-mcp-share.png)

Connect compatible AI applications to the BestPrice Shopping Brain, live
product search, offer comparison, and price history from
[BestPrice.gr](https://www.bestprice.gr/). The public
service is read-only and does not require a BestPrice account or API key.
BestPrice helps shoppers make the right shopping decision; MCP makes the same
comparison data available wherever a compatible AI-assisted decision begins.
Search covers safe physical products across the main BestPrice catalog. Digital
products, services, and prohibited or age-restricted categories are excluded.
Search prices exclude shipping; offer comparison reports shipping and delivered
totals separately.

- MCP endpoint: `https://mcp.bestprice.gr/mcp`
- Official Registry ID: `gr.bestprice/mcp`
- Public guide: `https://www.bestprice.gr/mcp`
- Support: `https://www.bestprice.gr/contact`
- Security reports: [`SECURITY.md`](SECURITY.md)
- ARD discovery: `https://www.bestprice.gr/.well-known/ard.json`
- WebMCP inventory: `https://www.bestprice.gr/.well-known/webmcp.json`
- Legacy AI Catalog: `https://www.bestprice.gr/.well-known/ai-catalog.json`
- Server card: `https://mcp.bestprice.gr/mcp/server-card`
- Server version: `1.8.0`
- Tools: `get_shopping_decision`, `search_products`, `compare_offers`,
  `get_price_history`

## Discovery

- [Official MCP Registry record](https://registry.modelcontextprotocol.io/v0.1/servers?search=gr.bestprice%2Fmcp)
- [WebMCP Registry](https://webmcp-registry.dev/domain/www.bestprice.gr)
- [webmcp.com live tool index](https://webmcp.com/sites/bestprice.gr)
- Community indexes: [Glama](https://glama.ai/mcp/servers/TheBestCo/bestprice-mcp),
  [MCP Repository](https://mcprepository.com/thebestco/bestprice-mcp),
  [MCP Toplist](https://mcptoplist.com/server/gr.bestprice%2Fmcp),
  [The MCP Index](https://themcpindex.com/servers/gr-bestprice-mcp), and
  [AgentNDX](https://agentndx.ai/server/bestprice-mcp/)

## Browser-native WebMCP

BestPrice pages also expose 13 contextual WebMCP tools to compatible browsers.
They cover the visible search, filter, sort, product, offer, specification, and
price-history journey while leaving the merchant choice to the shopper. The
Apache-2.0 source, deterministic evaluator, tests, and architecture are in
[`webmcp/`](webmcp/).

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

## Install in Cursor

### Via Cursor Marketplace (Recommended)

Once published, install BestPrice Shopping directly from the [Cursor Marketplace](https://cursor.com/marketplace) with one click. No configuration needed.

### Manual Installation

[Add BestPrice Shopping to Cursor](https://cursor.com/install-mcp?name=bestprice-shopping&config=eyJ1cmwiOiJodHRwczovL21jcC5iZXN0cHJpY2UuZ3IvbWNwIn0%3D)

Cursor shows the decoded remote-server configuration before adding it. The
same endpoint is also available through the
[BestPrice Shopping community listing](https://cursor.directory/plugins/bestprice-shopping).

## Portable Agent Plugin

This repository also follows the vendor-neutral
[Agent Plugins 1.0 specification](https://agent-plugins.org/specification).
Clients that support Agent Plugins can load the root `plugin.json` and
`mcp.json`; the package connects only to the same public, read-only Streamable
HTTP endpoint.

## Use with DeepSeek, Z.ai and GLM

DeepSeek Harness can connect through its official MCP bridge; see
[`examples/deepseek-harness.yml`](examples/deepseek-harness.yml), or run the
ready-to-use [`examples/deepseek-harness.patch.yml`](examples/deepseek-harness.patch.yml)
with `dsh --profile headless --patch`. Z.ai's general API supports third-party
Streamable HTTP MCP servers; a complete Python example is available at
[`examples/zai-glm.py`](examples/zai-glm.py). Provider access needs the relevant
provider account or API key. BestPrice itself needs neither.

## Use with Claude and Perplexity

Both services can add the production endpoint as a custom remote connector.
BestPrice requires no account, OAuth flow, or API key. Claude also has a
separate public Connectors Directory review; Perplexity currently documents
individual and organization-managed connectors. Exact setup values are in
[`PROVIDER_SETUP.md`](PROVIDER_SETUP.md).

## Install in Claude Code

Claude Code can add the public remote server directly:

```sh
claude mcp add --transport http bestprice-shopping \
  https://mcp.bestprice.gr/mcp
claude mcp get bestprice-shopping
```

The included [`.mcp.json`](.mcp.json) provides the equivalent project-scoped
configuration. Claude Code discovers the live read-only tool inventory from
the endpoint.

## Other clients

See [`PROVIDER_SETUP.md`](PROVIDER_SETUP.md) for OpenAI, ChatGPT, Claude,
Perplexity, Grok, Gemini, DeepSeek, Qwen, Z.ai, GLM, GitHub Copilot, VS Code,
Cursor, and Microsoft Copilot Studio connection examples. Every integration
points to the same endpoint and imports only the four published read-only
tools.

[Connect BestPrice to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=BestPrice&connectorUrl=https%3A%2F%2Fmcp.bestprice.gr%2Fmcp)
opens Claude's custom-connector flow with the public endpoint filled in.

## A safe first test

1. Ask `get_shopping_decision`: `Θέλω κινητό έως 500 ευρώ με NFC και 5G υποχρεωτικά.`
2. Or ask `search_products`: `Βρες μου Sony WH-1000XM5 έως 300 ευρώ.`
3. Pass a returned `product_id` to `compare_offers` with postal code `10558`.
4. Pass the same `product_id` to `get_price_history` for 180 days.

Clients should never invent a product ID, treat unknown delivery as free, make
a purchase, or expose a direct merchant URL.

Privacy: [bestprice.gr/policies/privacy](https://www.bestprice.gr/policies/privacy)  
Terms: [bestprice.gr/policies/terms](https://www.bestprice.gr/policies/terms)
