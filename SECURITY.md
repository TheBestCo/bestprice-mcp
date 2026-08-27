# Security

## Reporting a vulnerability

Please do not open a public GitHub issue for a suspected vulnerability.

Send the report to [feedback@bestprice.gr](mailto:feedback@bestprice.gr), or use
the [BestPrice contact page](https://www.bestprice.gr/contact). Include “MCP
security report” in the subject when email is available, plus:

- the affected URL or tool;
- clear reproduction steps;
- the impact you observed;
- any request IDs that the service returned;
- a safe way to contact you.

Do not include credentials, payment-card data, personal data that is not needed
for the report, or live exploit traffic against other users. Provide a safe
contact channel so the BestPrice team can coordinate remediation and disclosure
with you.

## Supported version

The hosted service at `https://mcp.bestprice.gr/mcp` is continuously updated.
Only its current production version is supported. The manifests in this
repository describe that hosted service; they are not a separately hosted MCP
implementation.

The canonical machine-readable security contact is published at
[`https://www.bestprice.gr/.well-known/security.txt`](https://www.bestprice.gr/.well-known/security.txt).
