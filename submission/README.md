# BestPrice Shopping submission checklist

The repository contains two separate read-only integration surfaces: the
remote MCP connection bundle and the browser-native WebMCP challenge layer.
It has no checkout capability, hook, or account credential. Provider-specific
connection metadata and a vendor-neutral Agent Plugin manifest point to the
remote service; `webmcp/` contains the Apache-2.0 page-tool source, evaluator,
and tests.

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
- `plugin.json` and `mcp.json` conform to Agent Plugins 1.0 and declare the
  same public Streamable HTTP endpoint without credentials or write tools.
- `server.json` is the validated, provider-neutral manifest prepared for the
  official MCP Registry.
- `PROVIDER_SETUP.md` keeps OpenAI, Gemini, Claude, Perplexity, Grok, Qwen,
  DeepSeek, Z.ai/GLM, GitHub Copilot, VS Code, Cursor, and Microsoft Copilot
  Studio connection steps pinned to the same public endpoint and read-only tool
  allowlist.
- `test-cases.json` contains five positive and four negative review cases for
  the three published tools.
- `claude-directory.md` contains the copy-ready Claude Directory field map,
  data-handling notes, three response-only screenshots generated from live MCP
  results, and the human-only submission gates.
- `perplexity-connector.md` contains the copy-ready individual and organization
  connector fields plus an end-to-end acceptance check.
- Repository tests pin the endpoint, read-only surface, prompts, and case inventory.

## Official Registry publication

- `gr.bestprice/mcp@1.5.1` was published to the official MCP Registry on
  2026-08-27. The public Registry API lists every release from `1.2.0` through
  `1.5.1` under the verified `gr.bestprice/mcp` identity.
- The live registry record declares `https://www.bestprice.gr/mcp` as the
  website and `https://mcp.bestprice.gr/mcp` as its Streamable HTTP endpoint.
- Publisher ownership is verified through the public Ed25519 TXT proof at the
  `bestprice.gr` apex. Keep that proof in DNS so future versions can be
  published under the same permanent namespace.
- The current post-publication production canary passed 29/29 checks for
  website and protocol discovery, modern and legacy MCP paths, the three
  read-only tools, clean public product and merchant identities, the ad-free
  offer contract, policy boundaries, MCP Apps UI, and signed landing behavior.
  It followed no merchant redirect and invoked no checkout tool.

Registry record:
`https://registry.modelcontextprotocol.io/v0.1/servers?search=gr.bestprice%2Fmcp`

## Downstream discovery status

Checked on 2026-08-27:

- Glama indexes the public GitHub repository and endpoint at
  `https://glama.ai/mcp/servers/TheBestCo/bestprice-mcp`.
- MCP Toplist has ingested the official Registry record at
  `https://mcptoplist.com/server/gr.bestprice%2Fmcp`.
- Smithery exposes `bestprice/shopping`, but its release UI still marks a URL
  publication as failed even though Smithery's own tool client can enumerate
  all three tools. A fresh publication with release ID
  `204c3f7d-bac2-4bac-8623-a35418669cd4` reproduced the platform error on
  Smithery CLI 4.11.1. The reproducible issue is tracked at
  `https://github.com/arcadeai-labs/smithery-cli/issues/808`.
- MCP.Directory has already accepted the repository and reports it queued for
  review at `https://mcp.directory/submit`.
- APIs.io accepted the MCP/API listing for review under reference `5fea127f`.
- MCPServers.org accepted the public endpoint and repository for editorial
  review on 2026-08-27.
- FutureTools accepted the public launch page for editorial review on
  2026-08-27.
- PulseMCP has paused direct submissions and says official Registry entries
  will be ingested when submissions resume.
- The WebMCP Registry has indexed all twelve browser tools for
  `www.bestprice.gr` and verified domain ownership on 2026-08-27.
- WebMCP.com independently detects all twelve tools from the production site
  and classifies the surface as Commerce.
- WebMCP Directory accepted the domain but its scanner currently reports no
  surface even though Chrome runtime tests prove the page registers 1 home,
  7 listing, and 6 product-page tools. Do not alter the working runtime to
  satisfy that third-party scanner.
- AgenticSkills currently has no configured submission review queue, so its
  form cannot accept any listing. MCP Server Space requires authorization of
  an unverified, low-adoption GitHub OAuth app; it was deliberately not
  authorized. Stork requires either a paid listing or a reciprocal production
  badge, and mcp.so requires a paid listing; neither is justified for this
  pilot.
- BestPrice publishes both the AI Catalog predecessor document and the current
  ARD document. `/.well-known/ard.json`, the `rel="ard"` HTML link, and the
  `Agentmap` robots directive expose directly addressable capabilities and five
  representative queries for semantic discovery.

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
- In a Claude Team or Enterprise organization, use `claude-directory.md` to
  complete the saved Directory draft and attach 3–5 response-only MCP Apps
  screenshots. An authorized owner must accept the directory terms.
- Add and verify the remote Perplexity connector from an eligible account or
  organization after the production origin allowlist includes Perplexity's
  exact hosted origins. Perplexity currently documents no public directory
  submission for third-party custom connectors.

## Future Registry versions

For a material server update, increment `server.json`'s version, run the
repository validation and production canary, authenticate the official publisher
for `bestprice.gr`, and publish from this directory. Treat every published
version as permanent because the preview Registry does not currently provide a
normal unpublish or delete workflow.
