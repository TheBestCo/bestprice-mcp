"""Call the public BestPrice MCP server from Z.ai's general GLM API."""

import os

from zai import ZaiClient


client = ZaiClient(api_key=os.environ["ZAI_API_KEY"])
response = client.chat.completions.create(
    model=os.environ.get("ZAI_MODEL", "glm-4.6"),
    messages=[
        {
            "role": "user",
            "content": "Βρες μου ένα καλό κινητό έως 500 ευρώ από το BestPrice.",
        }
    ],
    tools=[
        {
            "type": "mcp",
            "mcp": {
                "server_label": "bestprice",
                "server_url": "https://mcp.bestprice.gr/mcp",
                "transport_type": "streamable-http",
                "allowed_tools": [
                    "get_shopping_decision",
                    "search_products",
                    "compare_offers",
                    "get_price_history",
                ],
                "headers": {"X-MCP-Client-Name": "Z.AI GLM"},
            },
        }
    ],
    tool_choice="auto",
)

print(response.choices[0].message.content)
