# OpenAI universal plugin submission handoff

This is the copy-ready, human-gated handoff for submitting BestPrice Shopping
to OpenAI's universal plugin directory. OpenAI accepts an MCP-only plugin and
does not require custom UI. BestPrice's optional MCP Apps resource remains a
portable enhancement; every tool must stay useful from `structuredContent`
without it.

Official references:

- Submission: `https://developers.openai.com/plugins/deploy/submission`
- Plugin package: `https://developers.openai.com/plugins/build/plugins`
- Optional MCP Apps UI: `https://developers.openai.com/plugins/build/chatgpt-ui`

## Canonical listing

| Field | Value |
| --- | --- |
| Name | BestPrice Shopping |
| Developer | BestPrice |
| Category | Shopping |
| MCP server URL | `https://mcp.bestprice.gr/mcp` |
| Transport | Streamable HTTP |
| Authentication | None |
| Country availability | Greece |
| Website | `https://www.bestprice.gr/mcp` |
| Support | `https://www.bestprice.gr/contact` |
| Privacy | `https://www.bestprice.gr/policies/privacy` |
| Terms | `https://www.bestprice.gr/policies/terms` |
| Allowed link origin | `https://www.bestprice.gr` |
| Plugin package | `https://github.com/TheBestCo/bestprice-mcp` |

Short description:

> Make an evidence-backed shopping decision, search products, compare delivered
> prices, and inspect price history across Greek stores.

Long description:

> BestPrice Shopping is a public, read-only MCP plugin for the Greek market. Its
> shared Shopping Brain can recommend or compare products from a user's need,
> budget, and mandatory specifications. The other tools provide bounded product
> lookup, current offer comparison with item price and shipping kept separate,
> and observed 30/90/180-day price history. It never places an order, changes a
> basket, reads BestPrice account history, predicts future prices, or returns a
> direct merchant URL.

## Reviewed inventory

- `get_shopping_decision`: one bounded, evidence-backed recommendation,
  comparison, clarification, or honest no-match from the same Shopping Brain as
  BestPrice Ask.
- `search_products`: up to eight grouped physical products from a bounded
  catalog search.
- `compare_offers`: up to ten current offers; unknown shipping remains `null`.
- `get_price_history`: observed 30/90/180-day context with methodology,
  coverage, and no future-price prediction.
- Optional MCP Apps resource: `ui://bestprice/shopping-results-v1.html`.

All four tools must publish `readOnlyHint: true`, `destructiveHint: false`, and
`idempotentHint: true`. They must remain useful when the host does not render
the optional UI resource.

## Starter prompts

1. `Choose the best phone under €500 for photos, with NFC and 5G required.`
2. `Find a highly rated 55-inch OLED TV under €1,000.`
3. `Compare current offers for this exact product, including delivery.`

Use the positive and negative reviewer cases in [`test-cases.json`](test-cases.json).
The `contradictory-price-bounds` case must clarify without catalog retrieval,
and the `need-based-shopping-decision` case must fail closed on unverified
mandatory attributes.

## Exact pre-submission gate

Submit only after one uninterrupted production run proves all of the following:

1. `initialize` reports `bestprice-agent-commerce` version `1.8.0`.
2. `tools/list` returns exactly the four reviewed tools above, with the expected
   read-only annotations and `get_shopping_decision` output schema.
3. Every positive case succeeds against the same deployed revision; every
   negative case refuses the prohibited behavior.
4. Signed recommendation IDs match `d1.<32 hex jti>.<base64url HMAC>`, each JTI
   matches its signed BestPrice landing token, and the first hop returns `303`
   to a canonical BestPrice product page with `bpref=mcp` and the attribution
   cookie. Do not follow a merchant redirect.
5. No raw prompt, identity, postcode, cookie, merchant URL, raw token, account
   history, or cross-user data leaks into public output or telemetry evidence.
6. The MCP Apps resource loads in a compatible host, but the same result remains
   complete when UI rendering is unavailable.
7. The server manifest, provider allowlists, public guide, repository README,
   and reviewer cases all name version `1.8.0` and the same four tools.

Record the exact deployed revision, UTC timestamps, sanitized results, and any
failed attempts. A public page version string is not deployment proof.

## Human-only finish

An authorized BestPrice submitter with OpenAI organization plugin-submission
write access (currently labelled **Apps Management**) must create the draft,
review the scanned tool metadata, provide the listing fields and test cases,
make the company and policy attestations, and press Submit. Submit the MCP
server as a new MCP-backed plugin even if a custom connector already exists.
This repository and canary do not replace those human attestations.
