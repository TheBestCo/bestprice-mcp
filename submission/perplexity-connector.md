# Perplexity remote connector handoff

Last verified: 2026-08-27

Perplexity can use the same public BestPrice MCP endpoint as every other
compatible client. No BestPrice account or credential is required.

## Connection

Open **Account Settings > Connectors**, choose **+ Custom connector**, select
**Remote**, and enter:

| Field | Value |
| --- | --- |
| Name | BestPrice Shopping |
| MCP server URL | `https://mcp.bestprice.gr/mcp` |
| Description | Read-only shopping decisions, product search, offers, and price history for Greece. |
| Authentication | None |
| Transport | Streamable HTTP |
| Icon | [`bestprice-mcp-logo-1024.png`](bestprice-mcp-logo-1024.png) |

The icon is 35,717 bytes, below Perplexity's 128 KB limit. Check the custom
connector risk acknowledgement, add the connector, then open its card to enable
it. Select it as a source in a new conversation.

An organization administrator can add the same connector and share it with the
organization. Members can add their own connector only when the administrator
has enabled that permission.

## Acceptance check

Use a fresh conversation and run these in order:

1. `Choose the best phone under €500 with NFC and 5G required on BestPrice.`
2. `Find Sony WH-1000XM5 headphones under €300 on BestPrice.`
3. Using a returned `product_id`, ask: `Compare delivered offers to postcode 11527.`
4. Using the same `product_id`, ask: `Is today's price low compared with the last 180 days?`

Pass only if Perplexity discovers exactly `get_shopping_decision`,
`search_products`, `compare_offers`, and `get_price_history`; each call
succeeds; product links open a canonical BestPrice product path; item price and
shipping stay separate; and unknown shipping is not described as free.

BestPrice records the bounded `perplexity` client label when the client
identifies itself. That label is unauthenticated and is used only for aggregate
usage reporting.

## Distribution status

Perplexity's official help center currently documents custom remote connectors
for individuals and organizations. It does not currently document a public
third-party directory or submission form for them. Do not claim that BestPrice
is publicly listed or endorsed by Perplexity unless Perplexity creates and
approves that path.

Official references:

- `https://www.perplexity.ai/help-center/es/articles/13915507-anadir-conectores-remotos-personalizados`
- `https://www.perplexity.ai/help-center/en/articles/10352993-account-settings`
