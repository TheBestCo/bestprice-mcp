# Live MCP server defects

Measured on 29 October 2026 against `https://mcp.bestprice.gr/mcp`.
Gateway revision `b33d9166144139000fb1258b666d4c43961dabc3`. `healthz` reported version `1.8.4`.
The server implementation is not in this repository. The checks below are read-only.

## 1. `get_shopping_decision` is titled "BestPrice"

OpenAI's Apps SDK and Anthropic's connector review both want a tool title that says what the tool does.
The other three tools have specific titles. This one uses the server title.

**Actual.** `tools/list` returns:

```json
{
  "name": "get_shopping_decision",
  "title": "BestPrice",
  "annotations": { "title": "BestPrice", "readOnlyHint": true }
}
```

**Expected.** A specific title, for example `Get a BestPrice shopping decision`. Keep `readOnlyHint: true`.

**Repro.**

```sh
curl -sS https://mcp.bestprice.gr/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"audit","version":"1.0.0"}}}'
```

Then `tools/list` with `Accept: application/json`.

## 2. `get_shopping_decision` accepts an empty argument object

The input schema is an `anyOf` of the real object (which requires `message`) and a second branch:

```json
{ "type": "object", "properties": {}, "additionalProperties": false }
```

A client that does not unroll `anyOf` sees no arguments. That is a credible reason some directories still
describe three tools: the fourth tool fails their schema import. A model can also call the tool with `{}`.

**Expected.** One object schema whose `required` array is `["message"]`. Drop the empty branch.

**Repro.** `tools/list`, then inspect `tools[name=get_shopping_decision].inputSchema.anyOf[1]`.

## 3. The served icon is a 74×48 SVG that crawlers cannot fetch

Both live cards and `initialize` `serverInfo.icons` use `https://www.bestprice.gr/images/logo.svg`.

- The SVG root is `width="74" height="48"`. Marketplace review asks for a square logo.
- `User-Agent: python-requests/2.32.3` and `User-Agent: curl/8.5.0` receive HTTP 403.
- A browser `User-Agent` receives HTTP 200 `image/svg+xml`.

Cards checked:

- `GET https://mcp.bestprice.gr/mcp/server-card`
- `GET https://mcp.bestprice.gr/.well-known/mcp/server-card.json`

**Expected.** Point `icons` and `iconUrl` at the square PNG already in this repository:

`https://raw.githubusercontent.com/TheBestCo/bestprice-mcp/main/assets/bestprice-mcp-logo-1024.png`

That URL returned HTTP 200 `image/png` to `SmitheryBot/1.0`. The file is 1024×1024.
[`submission/site/mcp-server-card.template.json`](submission/site/mcp-server-card.template.json) is the
replacement icon only. `server.json` and the Docker `server.yaml` in this repository already use it.
The cards above will keep serving the SVG until the gateway changes.

## 4. Smithery reports initialization HTTP 500; the origin does not

On 29 October 2026 a direct initialize did not return HTTP 500.

```sh
curl -i https://mcp.bestprice.gr/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'user-agent: SmitheryBot/1.0 (+https://smithery.ai)' \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smithery-scanner","version":"1.0.0"}}}'
```

**Actual.** HTTP 200, `content-type: text/event-stream`, a complete `event: message` frame ending in
a blank line, about 150 ms. `https://smithery.ai/servers/bestprice/shopping` showed no deployment.
The same dual `Accept` header selects SSE for every client tested (Cursor, Claude, ChatGPT, VS Code,
Gemini CLI, MCP Inspector, Glama, `python-requests`, an empty User-Agent). `Accept: application/json`
alone returns JSON.

`GET` with `Accept: text/event-stream` returns HTTP 200 and the bytes `: connected\nretry: 300000\n\n`,
then holds the socket. A gateway that waits for that body to end, or that cannot parse the SSE
initialize, can report "Initialization failed with status 500" after the origin has already answered 200.

**Expected for interoperability.** When the JSON-RPC response is a single message and the client
accepts `application/json`, prefer `application/json` over a one-event SSE body. Keep SSE for a
stream that actually stays open. The spec allows either for a POST. Smithery's proxy and CLI shut
down on 2026-10-31; after that, the directory should list this upstream URL and should not proxy it.
See `smithery.yaml`.

The 25 September email to `contact@smithery.ai` is recorded as bounced. This repository has no
delivery receipt.

## 5. Browser origins for Cursor and VS Code are rejected

`OPTIONS` and `POST` with `Origin: https://cursor.com`, `https://vscode.dev`, or
`https://insiders.vscode.dev` return HTTP 403 `Invalid Origin`.

These origins are allowed (HTTP 204 on preflight, and a POST from localhost succeeded):
`http://localhost:6274`, `http://127.0.0.1:6274`, `https://www.bestprice.gr`, `https://smithery.ai`,
`https://server.smithery.ai`, `https://claude.ai`, `https://chatgpt.com`, `https://gemini.google.com`.

Desktop Cursor, VS Code, and Claude Code do not send `Origin`, and those initializes returned HTTP 200.
This is a defect only for browser-hosted clients on the rejected origins. `https://evil.example` is
correctly rejected.

## 6. No A2A agent card

`GET https://mcp.bestprice.gr/.well-known/agent-card.json` and
`GET https://www.bestprice.gr/.well-known/agent-card.json` returned HTTP 404.
`/.well-known/agent.json` on the MCP host also returned HTTP 404.

Do not publish a card that points at the MCP URL. MCP and A2A are different protocols.
[`submission/a2a/agent-card.template.json`](submission/a2a/agent-card.template.json) is a template for
the site team. `https://mcp.bestprice.gr/a2a` was a 404 on the same day. Serve the card only after
that interface exists.

## Observations that are not defects

These were checked on the same revision and behaved as the README describes.

- Protocol negotiation: `2024-10-07`, `2024-11-05`, `2025-03-26`, `2025-06-18`, and `2025-11-25` are
  echoed. `2026-07-28` and an unknown version in the initialize body answer `2025-11-25`.
  A later request whose `MCP-Protocol-Version` header is `2026-07-28` without `_meta` returns
  HTTP 400 and JSON-RPC `-32602`.
- `notifications/initialized` returns HTTP 202 with an empty body.
- `DELETE` returns HTTP 405. A JSON-RPC batch returns HTTP 400. A body over 256 KiB returns HTTP 413.
  Invalid JSON returns HTTP 400. `prompts/list` returns `-32601`. An unknown tool name returns `-32602`.
- Invalid tool arguments return HTTP 200 with `isError: true` (short query, missing query, extra
  property, bad `product_id`, `period_days: 7`, empty `message`).
- `search_products` for `Sony WH-1000XM5` and the Greek query `ακουστικά Sony WH-1000XM5` both
  returned `bp_2157591869` at catalog `price_from` 179.88. A nonsense query returned `products: []`
  and warnings, not an error.
- `compare_offers` for that id with postal code `10558` returned ten offers, objective
  `lowest_total_cost`, item 179.88, known shipping 4, total 183.88. Without a postal code the same
  offer kept `shipping_status: "unknown"` and `shipping_price: null`. Unknown shipping was not zero.
- `get_price_history` for 180 days returned a series of 64 points, `current_price` 179.88, and
  `deal_classification: "record_low"`.
- `get_shopping_decision` in Greek and in English (phone under 500 euros, NFC and 5G required) each
  returned `outcome: "recommendation"` with three products under the budget.
- All four tools advertise `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
  and `openWorldHint: true`, and each has an output schema.
- `Accept: text/event-stream` alone returns HTTP 406 asking for both JSON and SSE. That matches the
  Streamable HTTP rule that the client offers both.
- `resources/list` still includes `ui://bestprice/shopping-workspace-v1.html` and `v4` through `v8`
  next to `ui://bestprice/shopping-results-v1.html`. Worth retiring if those UIs are no longer current.
- `initialize` advertises `capabilities.events` as `{}`. This pass did not call `events/subscribe`.
  Shopping calls succeeded with no token.
- Rechecked 29 October 2026: `tools/list` already sets `readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true`, and `openWorldHint: true` on all four tools. Microsoft 365 Copilot can
  treat a tool as destructive when those hints are missing. No gateway change is required for that
  check. The title and empty `anyOf` branch in defects 1 and 2 are separate.

## What this repository changed without a gateway deploy

Client manifests, the registry `server.json` icon, the Docker icon, the Smithery file, and the
templates under `submission/` do not change the bytes the gateway serves. Defects 1–3 and 6 stay
until the server and site teams deploy.
