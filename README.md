# BestPrice MCP

Connect compatible AI applications to live product search, offer comparison,
and price history from [BestPrice.gr](https://www.bestprice.gr/). The public
service is read-only and does not require a BestPrice account or API key.

- MCP endpoint: `https://mcp.bestprice.gr/mcp`
- Official Registry ID: `gr.bestprice/mcp`
- Public guide: `https://www.bestprice.gr/mcp`
- Tools: `search_products`, `compare_offers`, `get_price_history`

## Install for Gemini CLI

```sh
gemini extensions install https://github.com/TheBestCo/bestprice-mcp
```

## Install for Qwen Code

```sh
qwen extensions install TheBestCo/bestprice-mcp
```

Or add only the remote server:

```sh
qwen mcp add --scope user --transport http bestprice-shopping \
  https://mcp.bestprice.gr/mcp
```

## Use with Z.ai and GLM

Z.ai's general API supports third-party Streamable HTTP MCP servers. A complete
Python example is available at [`examples/zai-glm.py`](examples/zai-glm.py).
It needs a Z.ai API key, but the BestPrice server itself needs no credentials.

## Other clients

See [`PROVIDER_SETUP.md`](PROVIDER_SETUP.md) for OpenAI, ChatGPT, Claude, Grok,
Gemini, Qwen, Z.ai and GLM connection examples. Every integration points to the
same endpoint and imports only the three published read-only tools.

## A safe first test

1. Ask: `Βρες μου Sony WH-1000XM5 έως 300 ευρώ.`
2. Pass a returned `product_id` to `compare_offers` with postal code `10558`.
3. Pass the same `product_id` to `get_price_history` for 180 days.

Clients should never invent a product ID, treat unknown delivery as free, make
a purchase, or expose a direct merchant URL.

Privacy: [bestprice.gr/policies/privacy](https://www.bestprice.gr/policies/privacy)  
Terms: [bestprice.gr/policies/terms](https://www.bestprice.gr/policies/terms)
