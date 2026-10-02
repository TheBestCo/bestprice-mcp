# Linked Events privacy disclosure review

The October 2 audit found that the public MCP guide covered anonymous shopping but omitted optional account linking and Events. Website commit `daa8aa12d753c5f2c988e16c599becb22d0acfb0` adds factual Greek and English explanations of data use, cancellation, periodic sampling and retention. The corporate [Privacy Policy](https://www.bestprice.gr/policies/privacy), dated September 16, 2024 in the inspected public page, is managed separately in the policy database. This note supplies implementation facts for aligning that notice and the account-data deletion process; it does not declare legal compliance.

## Facts for the notice

Account linking is optional and limited to creating and canceling selected product price-drop subscriptions. Public shopping tools do not require a BestPrice account. The authorization lasts at most 30 days; each subscription requires host renewal within at most 24 hours.

BestPrice stores an internal account reference, authorization records, selected product and EUR item-price threshold, subscription status and expiry, observed prices, verified notification destination, and delivery status. Authentication records contain hashes of codes and tokens. Notification signing keys are encrypted. Technical account records also coordinate request limits and recent callback-verification attempts.

For the ChatGPT integration, OpenAI receives event and subscription identifiers, product identifier, current and previous item prices, the target price, EUR currency and timestamps. The notification payload excludes name, email, first-party login session token, purchase history and chat transcript. BestPrice account linking does not authorize purchases, payments or access to account history.

Canceling stops queued work and new delivery attempts; an already in-flight request can finish. Revoking authorization invalidates its grant. Stopping or revoking does not immediately erase stored records. Whether ChatGPT's Disconnect action actually invokes the revocation endpoint has not been verified.

## Actual retention behavior

| Record | Current automatic cleanup eligibility |
| --- | --- |
| Subscriptions and OAuth codes, tokens and grants | More than 30 days after their recorded expiry |
| Catalog price observations | More than 30 days after the last check |
| Accepted, failed or stopped deliveries | More than 30 days after record creation |
| Pending or leased deliveries | Excluded from this cleanup query |
| Account reference and callback-verification quota state | No automatic deletion clause in this service; timestamp trimming occurs on a subsequent verification |

Cleanup is bounded to 100 rows per table per pass and depends on worker admission, runtime budget and pool pressure. These thresholds are eligibility rules, not exact deletion deadlines. Proxy/APM log retention, backups and the full account-erasure workflow were not established by this audit. No overdue production deletion incident was inferred from source alone.

## Concrete remaining decisions

1. Incorporate the applicable linked-Events purposes, recipient, categories and actual retention into the database-managed policy through its normal owner workflow.
2. Decide and implement the retention/deletion handling for the account quota reference and unfinished delivery rows, then qualify the account-data deletion path across the new Events/OAuth tables.
3. Verify the host's disconnect/revocation behavior before promising that disconnect alone immediately revokes authorization.

Source custody: `bp-backend-node/apis/agent-commerce/events/_lib/{store,tables,retention,worker.job}.js`, `apis/agent-commerce/oauth/_lib/{service,protocol}.js`, and `services/agent-commerce/{mcp-events,event-webhook}.js`. The website policy route uses `corp/pages/policies/PoliciesPage.php` and the `admin.GetPolicy` RPC; the static FAQ is `extra/mcpLanding/McpFaq.php`.
