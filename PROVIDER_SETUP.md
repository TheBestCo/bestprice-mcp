# Connect BestPrice Shopping

BestPrice exposes one public, read-only MCP server for every compatible provider:

```text
https://mcp.bestprice.gr/mcp
```

- Transport: Streamable HTTP over HTTPS
- BestPrice authentication: none
- Published tools: `get_shopping_decision`, `search_products`,
  `compare_offers`, `get_price_history`
- Mutations, checkout, payment, direct merchant links: not available
- Search scope: safe physical products across the main BestPrice catalog;
  digital products, services, and prohibited or age-restricted categories are excluded
- Price semantics: search prices exclude shipping; comparisons separate item,
  shipping, and delivered total

## OpenAI

Use the endpoint as a remote MCP tool in the Responses API. Because the four
published tools are read-only, the integration can skip per-call approval while
still restricting the imported tool inventory:

```js
const response = await client.responses.create({
  model: process.env.OPENAI_MODEL,
  input: 'Βρες μου μια καλή OLED τηλεόραση έως 1.000 ευρώ.',
  tools: [{
    type: 'mcp',
    server_label: 'bestprice',
    server_description: 'Read-only shopping decisions, product search, offers, and price history for Greece.',
    server_url: 'https://mcp.bestprice.gr/mcp',
    require_approval: 'never',
    allowed_tools: ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'],
  }],
});
```

For ChatGPT, add the same URL as a custom connector in developer mode. Public
directory availability is a separate review and publishing process.

Official references: [remote MCP tools](https://developers.openai.com/api/docs/guides/tools-connectors-mcp),
[plugin testing](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Gemini

Gemini CLI accepts the bundled `gemini-extension.json` or a direct HTTP MCP
configuration. Google also supports remote MCP servers in Antigravity and the
Gemini Agents API. Keep the allowlist fixed to the reviewed read-only surface:

```js
const tools = [{
  type: 'mcp_server',
  name: 'bestprice',
  url: 'https://mcp.bestprice.gr/mcp',
  allowed_tools: ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'],
}];
```

Official references: [Gemini Antigravity MCP servers](https://ai.google.dev/gemini-api/docs/antigravity-agent),
[Gemini Agents API](https://ai.google.dev/api/agents),
[Gemini CLI MCP servers](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md).

## Claude

[Connect BestPrice to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=BestPrice&connectorUrl=https%3A%2F%2Fmcp.bestprice.gr%2Fmcp),
then review and add the prefilled public endpoint.

For Claude Code, add and verify the same remote server from a terminal:

```sh
claude mcp add --transport http bestprice-shopping \
  https://mcp.bestprice.gr/mcp
claude mcp get bestprice-shopping
```

The repository's [`.mcp.json`](.mcp.json) contains the equivalent
project-scoped configuration. Claude discovers the live tool inventory from
the endpoint; do not hard-code a stale local allowlist.

In an individual Claude account, open **Customize > Connectors**, choose
**Add custom connector**, and enter the BestPrice endpoint. Team and Enterprise
workspaces require an owner to add the URL under **Organization settings > Connectors**.
Custom connectors are separate from Anthropic's reviewed public Connectors
Directory; an individual account can still add and use this public endpoint.

Claude may identify the connection as `claude-ai`, `Anthropic`, or
`claude-code`. BestPrice uses that unauthenticated label only for aggregate
telemetry and never for access control.

Anthropic's public Connectors Directory uses a separate submission portal in
organization settings. Submission requires a Team or Enterprise organization
and an Owner, Primary Owner, or delegated Directory role. An individual account
can connect and test BestPrice, but cannot submit it to the directory.

Official references: [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp),
[Connectors Directory submission](https://claude.com/docs/connectors/building/submission).

## Perplexity

Open **Account Settings > Connectors**, choose **+ Custom connector**, then
select **Remote**. Enter:

- Name: `BestPrice Shopping`
- MCP server URL: `https://mcp.bestprice.gr/mcp`
- Authentication: `None`
- Transport: `Streamable HTTP`
- Description: `Read-only shopping decisions, product search, offers, and price history for Greece.`
- Icon: `submission/bestprice-mcp-logo-1024.png`

The square icon is 35 KB, below Perplexity's 128 KB limit. After adding the
connector, open its card to enable it and select it as a source in a new
conversation. Organization administrators can add and share the same remote
connector for their workspace.

Perplexity's current documentation describes individual and organization-managed
custom remote connectors. It does not describe a public third-party connector
directory submission. Connecting BestPrice therefore does not imply a public
Perplexity listing or endorsement.

Official references: [Perplexity custom remote connectors](https://www.perplexity.ai/help-center/es/articles/13915507-anadir-conectores-remotos-personalizados),
[Perplexity account settings](https://www.perplexity.ai/help-center/en/articles/10352993-account-settings).

## Grok

Open `grok.com/connectors`, choose **New Connector > Custom**, and enter the
BestPrice endpoint. Grok discovers the tool schemas from the server. Grok CLI
can add the same remote server, and the xAI Responses API can call it directly.

Official references: [Grok MCP servers](https://docs.x.ai/build/features/mcp-servers),
[xAI remote MCP tools](https://docs.x.ai/developers/tools/remote-mcp).

## Qwen

Qwen Code can connect to the production Streamable HTTP endpoint directly:

```sh
qwen mcp add --scope user --transport http bestprice-shopping \
  https://mcp.bestprice.gr/mcp
```

The public BestPrice extension can also be installed in Qwen Code. Its manifest
keeps the imported tools restricted to the reviewed read-only surface:

```sh
qwen extensions install https://github.com/TheBestCo/bestprice-mcp --consent
```

Alibaba Cloud Model Studio's Responses API currently documents remote MCP over
legacy SSE only, so it cannot call the canonical Streamable HTTP endpoint
directly. Use Qwen Code or another Streamable HTTP-capable host instead of
silently placing a protocol proxy in the shopping path.

Official references: [Qwen Code MCP](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md),
[Qwen Code extensions](https://github.com/QwenLM/qwen-code/blob/main/docs/users/extension/introduction.md),
[Model Studio MCP](https://www.alibabacloud.com/help/en/model-studio/mcp).

## DeepSeek

DeepSeek's public Chat Completions API accepts function tools, while its
Responses API currently ignores tools declared as `mcp`. The official DeepSeek
Harness provides the MCP bridge instead. Add one plugin instance to `cordis.yml`:

```yaml
- id: mcp-bestprice
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: bestprice
    transport: streamable-http
    url: https://mcp.bestprice.gr/mcp
    headers:
      X-MCP-Client-Name: DeepSeek Harness
    toolCallTimeoutMs: 30000
    failOnStartupError: true
```

The bridge discovers the same four tools and exposes them to the model under
the `mcp__bestprice__*` namespace. This connects DeepSeek-powered Harness agents;
it does not imply that the consumer chat at deepseek.com imports public MCPs.

For an isolated one-shot check, use the bundled patch layer:

```sh
dsh --profile headless --patch examples/deepseek-harness.patch.yml \
  "Use BestPrice to find Sony WH-1000XM5 in Greece."
```

This exact path has been exercised against the production server with the
official `@deepseek-ai/dsh` 0.1.1-rc.2 release. It returned the live grouped
product, item price, and a signed BestPrice landing URL through
`mcp__bestprice__search_products`.

Official references: [DeepSeek Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md),
[DeepSeek Responses API](https://api-docs.deepseek.com/guides/responses_api/),
[DeepSeek API tool calls](https://api-docs.deepseek.com/guides/tool_calls).

## Z.ai and GLM

Z.ai's general Chat Completions API can discover and call the four BestPrice
tools directly through Streamable HTTP:

```python
import os
from zai import ZaiClient

client = ZaiClient(api_key=os.environ["ZAI_API_KEY"])
response = client.chat.completions.create(
    model=os.environ.get("ZAI_MODEL", "glm-4.6"),
    messages=[{"role": "user", "content": "Βρες μου ένα καλό κινητό έως 500 ευρώ."}],
    tools=[{
        "type": "mcp",
        "mcp": {
            "server_label": "bestprice",
            "server_url": "https://mcp.bestprice.gr/mcp",
            "transport_type": "streamable-http",
            "allowed_tools": ["get_shopping_decision", "search_products", "compare_offers", "get_price_history"],
            "headers": {"X-MCP-Client-Name": "Z.AI GLM"},
        },
    }],
    tool_choice="auto",
)
print(response.choices[0].message.content)
```

Use the general Z.ai API endpoint for this integration. The GLM Coding Plan
endpoint is contractually limited to its supported coding tools and is not the
general application endpoint.

Official references: [Z.ai MCP calling](https://docs.z.ai/guides/capabilities/mcp-call),
[Z.ai API endpoints](https://docs.z.ai/api-reference/introduction).

## GitHub Copilot and VS Code

Copilot CLI can add the reviewed remote surface directly:

```sh
copilot mcp add --transport http \
  --tools get_shopping_decision,search_products,compare_offers,get_price_history \
  bestprice-shopping https://mcp.bestprice.gr/mcp
```

VS Code can use the same endpoint from `.vscode/mcp.json`:

```json
{
  "servers": {
    "bestprice-shopping": {
      "type": "http",
      "url": "https://mcp.bestprice.gr/mcp"
    }
  }
}
```

One-click install:
[Add BestPrice Shopping to VS Code](vscode:mcp/install?%7B%22name%22%3A%22bestprice-shopping%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.bestprice.gr%2Fmcp%22%7D)

VS Code displays the decoded server configuration for review before adding it.

## Cursor

Use the reviewable one-click installer:

[Add BestPrice Shopping to Cursor](https://cursor.com/install-mcp?name=bestprice-shopping&config=eyJ1cmwiOiJodHRwczovL21jcC5iZXN0cHJpY2UuZ3IvbWNwIn0%3D)

Cursor displays the decoded remote-server configuration before adding it. The
same endpoint can be entered manually under **Settings > Tools & MCP**. Verify
that Cursor discovers the four reviewed read-only tools before relying on the
connection.

## Microsoft Copilot Studio

Copilot Studio supports existing Streamable HTTP MCP servers through its MCP
onboarding wizard. On the agent's **Tools** page, choose **Add a tool > New tool
> Model Context Protocol**, then enter:

- Server name: `BestPrice Shopping`
- Server description: `Read-only shopping decisions, product search, offers, and price history for Greece.`
- Server URL: `https://mcp.bestprice.gr/mcp`
- Authentication: `None`

Create the connection, add it to the agent, enable generative orchestration,
and verify the discovered inventory before publishing the agent. Connecting an
external server does not imply Microsoft review or endorsement.

Official reference: [connect an existing MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent).
