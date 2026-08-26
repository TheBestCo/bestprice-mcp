# BestPrice Shopping submission checklist

The repository bundle is intentionally MCP-only: it contains no app manifest,
embedded UI, write capability, hook, skill, or marketplace entry.

## Canonical identity

- Official MCP Registry name: `gr.bestprice/mcp`
- Public explainer: `https://www.bestprice.gr/mcp`
- Streamable HTTP endpoint: `https://mcp.bestprice.gr/mcp`

The registry name is the required reverse-DNS identifier for the verified
`bestprice.gr` publisher domain; it is not a web address. The public page and
protocol endpoint are declared separately in `server.json` so clients do not
mistake the HTML explainer for the JSON-RPC transport.

The initial submission covers search, offer comparison, and price history.
Basket optimization is implemented server-side but deliberately absent from the
published MCP allowlist and these review cases until its production latency gate
passes; add it only in a later plugin version after that rollout.

## Automated evidence

- `.codex-plugin/plugin.json` validates with the repository-pinned plugin validator.
- `.mcp.json` declares one production Streamable HTTP endpoint.
- `server.json` is the validated, provider-neutral manifest prepared for the
  official MCP Registry.
- `PROVIDER_SETUP.md` keeps OpenAI, Gemini, Claude, Grok, Qwen, DeepSeek,
  Z.ai/GLM, GitHub Copilot, VS Code, Cursor, and Microsoft Copilot Studio
  connection steps pinned to the same public endpoint and read-only tool
  allowlist.
- `test-cases.json` contains five positive and four negative review cases for
  the three published tools.
- Repository tests pin the endpoint, read-only surface, prompts, and case inventory.

## Official Registry publication

- `gr.bestprice/mcp@1.3.0` was published to the official MCP Registry on
  2026-08-26 and is marked `active` and `latest`.
- The live registry record declares `https://www.bestprice.gr/mcp` as the
  website and `https://mcp.bestprice.gr/mcp` as its Streamable HTTP endpoint.
- Publisher ownership is verified through the public Ed25519 TXT proof at the
  `bestprice.gr` apex. Keep that proof in DNS so future versions can be
  published under the same permanent namespace.
- The post-publication production canary passed 25/25 checks for website and
  protocol discovery, modern and legacy MCP paths, the three read-only tools,
  clean public product and merchant identities, policy boundaries, signed
  landing behavior, and New Relic attribution with zero charged events.

Registry record:
`https://registry.modelcontextprotocol.io/v0.1/servers?search=gr.bestprice%2Fmcp`

## Remaining provider review actions

- Confirm legal approval for the canonical privacy-policy and terms-of-service
  URLs already declared in `plugin.json`.
- Use the canonical public support page, `https://www.bestprice.gr/contact`, in
  the publisher review form (the local plugin manifest schema has no support-URL field).
- Complete the security/privacy and MCP annotation justifications in the review form.
- Approve the square portal artwork generated from the canonical BestPrice mark at
  `bestprice-mcp-logo-1024.png`; no substitute or AI-generated logo is used.
- Run every submission case against production and attach the sanitized outcomes
  emitted by `scripts/agent-commerce-submission-canary.mjs`.

## Future Registry versions

For a material server update, increment `server.json`'s version, run the
repository validation and production canary, authenticate the official publisher
for `bestprice.gr`, and publish from this directory. Treat every published
version as permanent because the preview Registry does not currently provide a
normal unpublish or delete workflow.
