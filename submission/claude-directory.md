# Claude Connectors Directory handoff

This is copy-ready material for an authorized BestPrice owner submitting the
public remote MCP through **Claude > Organization settings > Directory**. It
does not replace the policy attestations in the portal.

## Connection

| Field | Value |
| --- | --- |
| Name | BestPrice Shopping |
| Server URL | `https://mcp.bestprice.gr/mcp` |
| Transport | Streamable HTTP |
| URL model | One universal URL for every user |
| Authentication | None |
| Access | Read-only |
| Documentation | `https://www.bestprice.gr/mcp` |
| Support | `https://www.bestprice.gr/contact` |
| Privacy | `https://www.bestprice.gr/policies/privacy` |
| Terms | `https://www.bestprice.gr/policies/terms` |
| Allowed link origin | `https://www.bestprice.gr` |

Suggested tagline:

> Search products, compare delivered prices, and check price history in Greece.

Suggested description:

> BestPrice Shopping gives Claude read-only access to product search, current
> offer comparison, and price history for selected technology, appliance, and
> home categories in the Greek market. Search prices exclude shipping;
> comparisons show item price, shipping, and delivered total separately.

## Inventory

- `search_products`: finds grouped BestPrice products from a natural-language
  query. It returns up to eight results.
- `compare_offers`: compares up to ten merchant offers for a known BestPrice
  product and Greek postal code.
- `get_price_history`: returns 30, 90, or 180 days of observed price context.
- Resource: `ui://bestprice/shopping-results-v1.html`, an optional MCP Apps UI.
- Prompts: none.

All three tools publish a human-readable title plus `readOnlyHint: true`,
`destructiveHint: false`, and `idempotentHint: true`.

## Data-handling notes for review

- BestPrice receives the tool arguments and standard connection metadata, not
  the user's complete Claude conversation.
- The dedicated MCP telemetry records the tool, a bounded client category,
  outcome, latency, and result counts. It drops exact search text, raw IP
  addresses, arbitrary client strings, signed URLs, and user identifiers.
- The service uses a keyed, short-lived network identity for rate limiting.
- The server does not ask for a BestPrice account, Claude credentials, payment
  data, or a test account.
- The submitting owner must confirm the privacy-policy language, retention
  answers, directory terms, and all company attestations in the portal.

## Reviewer paths

Use the five positive and four negative cases in [`test-cases.json`](test-cases.json).
The first three screenshot prompts should be:

1. `Βρες μου Sony WH-1000XM5 έως 300 ευρώ.`
2. `Σύγκρινε τις προσφορές για το προϊόν που επέλεξα, με παράδοση στο 10558.`
3. `Είναι η σημερινή τιμή χαμηλή σε σχέση με τις τελευταίες 180 ημέρες;`

For an MCP Apps listing, attach 3–5 PNG screenshots at least 1000 pixels wide,
cropped to the app response only. Do not include the user's prompt in the image.

Three response-only captures generated from live production tool results are
ready to upload:

- [`claude-search-products.png`](claude-search-products.png)
- [`claude-compare-offers.png`](claude-compare-offers.png)
- [`claude-price-history.png`](claude-price-history.png)

They are evidence for the current interface, not static product claims. Run the
production canary again before submission because prices and availability can
change.

## Human-only finish

The final submitter must have Directory management access in a Claude Team or
Enterprise organization. Before accepting Anthropic's directory terms, confirm
the company identity, launch status, retention answers, screenshots, support
ownership, and the final production canary.
