# Connect BestPrice Shopping

BestPrice exposes one public, read-only MCP server for every compatible provider:

```text
https://mcp.bestprice.gr/mcp
```

- Transport: Streamable HTTP over HTTPS
- BestPrice authentication: none
- Published tools: `search_products`, `compare_offers`, `get_price_history`
- Mutations, checkout, payment, direct merchant links: not available

## OpenAI

Use the endpoint as a remote MCP tool in the Responses API. Because the three
published tools are read-only, the integration can skip per-call approval while
still restricting the imported tool inventory:

```js
const response = await client.responses.create({
  model: process.env.OPENAI_MODEL,
  input: 'Βρες μου μια καλή OLED τηλεόραση έως 1.000 ευρώ.',
  tools: [{
    type: 'mcp',
    server_label: 'bestprice',
    server_description: 'Read-only product search, offer comparison, and price history for Greece.',
    server_url: 'https://mcp.bestprice.gr/mcp',
    require_approval: 'never',
    allowed_tools: ['search_products', 'compare_offers', 'get_price_history'],
  }],
});
```

For ChatGPT, add the same URL as a custom connector in developer mode. Public
directory availability is a separate review and publishing process.

Official references: [remote MCP tools](https://developers.openai.com/api/docs/guides/tools-connectors-mcp),
[plugin testing](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Gemini

Register the server in a remote agent's `tools` array. Keep the allowlist fixed
to the reviewed read-only surface:

```js
const tools = [{
  type: 'mcp_server',
  name: 'bestprice',
  url: 'https://mcp.bestprice.gr/mcp',
  allowed_tools: ['search_products', 'compare_offers', 'get_price_history'],
}];
```

Official reference: [Gemini remote MCP servers](https://ai.google.dev/gemini-api/docs/antigravity-agent#mcp-servers).

## Claude

In an individual Claude account, open **Customize > Connectors**, choose
**Add custom connector**, and enter the BestPrice endpoint. Team and Enterprise
workspaces require an owner to add the URL under **Organization settings > Connectors**.
Enable only the three published tools for conversations that need shopping data.

Official reference: [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Grok

Open `grok.com/connectors`, choose **New Connector > Custom**, and enter the
BestPrice endpoint. Grok discovers the tool schemas from the server. The xAI API
can also use the endpoint as a remote MCP tool.

Official references: [Grok custom MCP connectors](https://docs.x.ai/grok/connectors),
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
qwen extensions install TheBestCo/bestprice-mcp
```

Alibaba Cloud Model Studio's Responses API currently documents remote MCP over
legacy SSE only, so it cannot call the canonical Streamable HTTP endpoint
directly. Use Qwen Code or another Streamable HTTP-capable host instead of
silently placing a protocol proxy in the shopping path.

Official references: [Qwen Code MCP](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md),
[Qwen Code extensions](https://github.com/QwenLM/qwen-code/blob/main/docs/users/extension/introduction.md),
[Model Studio MCP](https://www.alibabacloud.com/help/en/model-studio/mcp).

## Z.ai and GLM

Z.ai's general Chat Completions API can discover and call the three BestPrice
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
            "allowed_tools": ["search_products", "compare_offers", "get_price_history"],
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

## Verify the connection

Ask the client to list the server tools, then try these in order:

1. `Βρες μου Sony WH-1000XM5 έως 300 ευρώ.`
2. Use the returned `product_id` to compare offers for postal code `10558`.
3. Use the same `product_id` to inspect 180 days of price history.

The client should never invent a `product_id`, treat unknown shipping as free,
or expose a direct merchant URL.
