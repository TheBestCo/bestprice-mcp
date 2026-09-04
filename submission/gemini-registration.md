# Google Gemini Remote MCP Registration and Integration

Last verified: 2026-09-03

Google Gemini can connect directly to BestPrice's public Streamable HTTP MCP
endpoint. No BestPrice API key or account credential is required.

## Canonical endpoint

| Attribute | Specification |
| --- | --- |
| Service name | `BestPrice Shopping` |
| Registry identity | `gr.bestprice/mcp` |
| Endpoint URL | `https://mcp.bestprice.gr/mcp` |
| Transport | Streamable HTTP over HTTPS |
| Authentication | None (public read-only) |
| Allowed tools | `search_products`, `compare_offers`, `get_price_history` |
| Client identifier | `Gemini CLI` / `Gemini Interactions` |

---

## 1. Gemini CLI registration

Register BestPrice MCP in Gemini CLI using project or user scope:

```bash
# Option A: Install from repo extension manifest
gemini extensions install https://github.com/TheBestCo/bestprice-mcp

# Option B: Register Streamable HTTP remote endpoint directly with read-only tool allowlist
gemini mcp add --transport http --scope project \
  --include-tools search_products,compare_offers,get_price_history \
  bestprice-shopping https://mcp.bestprice.gr/mcp
```

Alternatively, reference the repository's `gemini-extension.json` in
`.gemini/settings.json`:

```json
{
  "mcpServers": {
    "bestprice-shopping": {
      "httpUrl": "https://mcp.bestprice.gr/mcp",
      "headers": {
        "X-MCP-Client-Name": "Gemini CLI"
      },
      "includeTools": [
        "search_products",
        "compare_offers",
        "get_price_history"
      ],
      "timeout": 30000,
      "trust": false
    }
  }
}
```

The `trust: false` setting ensures interactive confirmation is requested for
tool calls where appropriate during development and evaluation.

---

## 2. Google Gemini Interactions API / Deep Research

Gemini Deep Research and agentic workflows support remote MCP servers via the
Google Gen AI Interactions API:

```javascript
import { fetch } from 'node:undici';

const apiKey = process.env.GEMINI_API_KEY;
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-goog-api-key': apiKey,
  },
  body: JSON.stringify({
    agent: 'deep-research-preview-04-2026',
    input: 'Βρες τις χαμηλότερες τιμές για Sony WH-1000XM5 στην Ελλάδα και σύγκρινε μεταφορικά.',
    background: true,
    store: true,
    tools: [
      {
        type: 'mcp_server',
        name: 'bestprice',
        url: 'https://mcp.bestprice.gr/mcp',
        allowed_tools: [
          {
            mode: 'auto',
            tools: ['search_products', 'compare_offers', 'get_price_history'],
          },
        ],
      },
    ],
  }),
});
```

---

## 3. Google Genkit integration

When building with Firebase Genkit (`@genkit-ai/ai`), configure the Streamable
HTTP transport:

```javascript
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
});

// Configure BestPrice MCP remote client
const bestPriceTools = await ai.loadMcpTools({
  name: 'bestprice',
  url: 'https://mcp.bestprice.gr/mcp',
  includeTools: ['search_products', 'compare_offers', 'get_price_history'],
});
```

---

## 4. Acceptance check

1. **Search**: Ask Gemini `"Βρες Sony WH-1000XM5 στο BestPrice"`.
   Verify `search_products` is invoked and returns matching `product_id` (e.g. `bp_...`).
2. **Comparison**: Ask Gemini `"Σύγκρινε τιμές με μεταφορικά για το παραπάνω προϊόν"`.
   Verify `compare_offers` is called with that `product_id`. Verify delivery costs
   are distinguished from item prices and unknown delivery is not declared free.
3. **Price history**: Ask Gemini `"Είναι καλή η σημερινή τιμή σε σχέση με το ιστορικό;"`.
   Verify `get_price_history` is called.
4. **Boundary refusals**: Ask Gemini to `"Αγόρασε το προϊόν"` or `"Βάλε το στο καλάθι"`.
   Gemini must refuse or clarify that BestPrice tools are strictly read-only
   comparison tools and cannot execute purchases or checkout.

---

## Official references

- Gemini Antigravity Agent & MCP: `https://ai.google.dev/gemini-api/docs/antigravity-agent`
- Gemini Deep Research: `https://ai.google.dev/gemini-api/docs/deep-research`
- Gemini Function Calling & Tools: `https://ai.google.dev/gemini-api/docs/function-calling`
- Gemini CLI Tool Configuration: `https://github.com/google-gemini/gemini-cli`
