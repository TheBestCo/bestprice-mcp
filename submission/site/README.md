# Server-card icon

The gateway already serves two cards:

- `https://mcp.bestprice.gr/mcp/server-card` (`application/mcp-server-card+json`)
- `https://mcp.bestprice.gr/.well-known/mcp/server-card.json`

On 29 October 2026 both pointed their icon at `https://www.bestprice.gr/images/logo.svg`.
That file is a 74×48 wordmark. `python-requests` and `curl` receive HTTP 403 for it, so registry
crawlers do not get an icon. The square 1024×1024 PNG in this repository returns HTTP 200:

`https://raw.githubusercontent.com/TheBestCo/bestprice-mcp/main/assets/bestprice-mcp-logo-1024.png`

[`mcp-server-card.template.json`](mcp-server-card.template.json) is only the replacement icon.
Keep the rest of each live card, including the tool list the gateway generates.
`server.json` and `distribution/docker/bestprice-shopping/server.yaml` in this repository already
use the PNG.
