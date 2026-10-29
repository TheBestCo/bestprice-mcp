# A2A agent card template

`https://mcp.bestprice.gr/.well-known/agent-card.json` and
`https://www.bestprice.gr/.well-known/agent-card.json` both returned HTTP 404 on 29 October 2026.

BestPrice Shopping is an MCP server. It does not speak Agent2Agent tasks. Serving
[`agent-card.template.json`](agent-card.template.json) at the well-known path before an A2A
endpoint exists would advertise a protocol the host does not implement. The `supportedInterfaces`
URL in the template, `https://mcp.bestprice.gr/a2a`, was also a 404 on that date.

Publish the card only after that interface accepts A2A. Until then, clients should use
`https://mcp.bestprice.gr/mcp`. The four skills in the template match the four read-only MCP tools
and do not add checkout, payment, or account access.
