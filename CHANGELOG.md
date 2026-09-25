# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package version follows
[Semantic Versioning](https://semver.org/). The hosted server has its own version, recorded
in `server.json`; see the Versioning section of the README.

## [Unreleased]

- Routing guidance now treats completed shopping decisions and lookup-only searches as terminal for their original intent, preventing redundant BestPrice tool calls while preserving explicit offer/history follow-ups.
- Gemini Interactions envelope validation now matches the actual four-tool allowlist, with regression coverage.

### Added

- First full measured Claude selection benchmark: the canonical Skill improved exact positive-case routing from 67.12% to 76.71% (+9.59 pp) on the frozen 186-case corpus; full provenance is recorded in `docs/selection-results-2026-09-24.md`.
- Matched Anthropic selection runner for tools-only versus canonical-Skill routing on the frozen 186-case corpus, using synthetic read-only tool results so the benchmark cannot create commerce side effects.
- CI-pinned Cline Marketplace remote-MCP contribution payload for the canonical BestPrice Shopping endpoint.
- Provider-neutral selection benchmark scorer for actual ChatGPT/Claude/Gemini/Copilot/Grok traces, reporting activation recall, false activation, exact tool routing, optional outcome-quality metrics, and latency percentiles against the frozen 186-case corpus.

### Fixed

- Distribution status is now contract-tested against package/server versions, the four-tool public surface, canonical Skill URL, and the 14-tool WebMCP contract so discovery claims cannot drift silently.
- Agent Finder metadata now uses the upstream-required `owner/repository` `metadata.sourceSet` form.

## [1.2.7] - 2026-09-24

### Added

- CI-pinned GitHub Agent Finder contribution metadata for the canonical BestPrice Shopping Skill.
- CI-pinned Docker MCP Registry remote-server payload with Streamable HTTP, no authentication, and no copied tool inventory.
- Machine-discovery pointers in `llms-install.md` for ARD, AI Catalog, the server card, official MCP Registry identity, and the verified MCP Skill resource.

### Changed

- Public protocol documentation now describes the live `io.modelcontextprotocol/skills` extension, `skills/list`, `skills/get`, and the third `skill://bestprice-shopping/SKILL.md` resource.
- Provider guidance now documents MCP Skill import for OpenAI scanning, canonical root `.mcp.json` project discovery for Grok/VS Code/Copilot-compatible hosts, and the exact external Agent Finder contribution artifact.

### Verification

- Distribution tests pin the Agent Finder identifier/Skill URL and Docker ecommerce remote-server endpoint while rejecting OAuth or copied dynamic-tool configuration.
- The full distribution CI passed before this release bump.


## [1.2.6] - 2026-09-24

### Added

- `.agents/skills/bestprice-shopping/SKILL.md` mirrors the canonical shopping Skill for agent-compatible repository scanners.
- `opencode.json` auto-connects the public BestPrice remote MCP in OpenCode without copying any tool logic.
- `llms-install.md` gives agents a compact, provider-neutral installation guide for the public endpoint.
- Provider setup now includes the Factory Droid marketplace/install path.

### Changed

- Expand the bilingual direct/indirect/negative selection benchmark to 186 cases spanning recommendations, known-product lookup, delivered-price intent, price timing, and out-of-scope negatives.

### Verification

- Manifest tests pin OpenCode to `https://mcp.bestprice.gr/mcp`, require the agent-compatible Skill mirror, and keep every marketplace/extension version synchronized.
- The selection corpus is validated for bilingual coverage and routing-class balance before release.


## [1.2.5] - 2026-09-24

### Added

- Native self-hosted marketplace manifests for GitHub Copilot CLI and Claude Code, both resolving `bestprice-shopping` to the repository root so they reuse the canonical Agent Plugin, MCP configuration, and Skill.
- A checked-in `lhm.plugin.json` describes the hosted four-tool, three-resource BestPrice MCP surface for LobeHub Marketplace submission without relying on crawler inference.
- A bilingual selection benchmark corpus for direct, indirect, and negative shopping-intent routing.

### Changed

- Hosted MCP Registry metadata now tracks server `1.8.1`, the Skills-enabled server that publishes the BestPrice Shopping Skill over MCP alongside the four reviewed shopping tools.
- Glama metadata now advertises recommendations, shopping decisions, delivered-price comparison, and price history rather than the older lookup-only surface.

### Verification

- Anthropic's Claude Code CLI validates the root plugin and self-hosted marketplace.
- GitHub Copilot CLI can add this repository as the `bestprice` marketplace and browse the `bestprice-shopping` plugin.
- MCP Registry publisher successfully published `gr.bestprice/mcp` version `1.8.1`.


## [1.2.4] - 2026-09-24

### Added

- OpenAI portable install-surface metadata under `extensions.com.openai`, with the same reviewed interface as the Codex compatibility manifest.
- The Codex compatibility manifest now points explicitly at the canonical `./skills/` directory.

### Changed

- Tighten the BestPrice Shopping Skill trigger around unbranded Greek shopping intent: what to buy, known-product lookup, cheapest delivered price, and price-timing questions, with explicit travel/services exclusions.
- Re-run Google's official Gemini CLI extension validator whenever the shared `skills/` tree changes, not only when the Gemini manifest or context file changes.

### Verification

- Distribution CI remains green with the portable Skill shared by Claude, Cursor, Gemini/Qwen context, Codex compatibility, and the root Agent Plugins package.
- Gemini CLI 0.61.0 validation remains the provider-native gate for the extension package.


## [1.2.3] - 2026-09-24

### Added

- A provider-neutral `skills/bestprice-shopping/SKILL.md` routes unbranded Greek shopping intent to the four reviewed MCP tools and is shared with Cursor.
- Claude plugin metadata packages the existing remote MCP and the same shopping Skill.
- A compatibility `PROVIDER_SETUP.md` keeps old indexed documentation URLs pointed at the current four-tool guide.
- Gemini extension validation runs with Google's official stable CLI.

### Changed

- Gemini/Qwen context guidance, marketplace metadata, and discovery documentation now describe unbranded recommendation, delivered-price, and price-timing intent explicitly.
- Discovery documentation now treats ARD, the AI Catalog, the server card, the portable Skill, and the official MCP Registry as complementary distribution surfaces.


## [1.2.2] - 2026-09-21

### Fixed

- Keep the stdio protocol alive when a host closes its diagnostic stderr pipe, including
  during startup. Diagnostic failures no longer crash unrelated protocol work.
- Route broken stdout through the existing bounded shutdown and upstream session cleanup.
  Preserve a nonzero exit status even when cleanup does not resolve before Node exits.
- Keep the existing two-second shutdown watchdog, input byte limits and cancellation rules.

### Verification

- Add six real-OS-pipe entrypoint regressions and three separate real-SDK/loopback tests
  requiring exactly one upstream session DELETE after output loss or ordinary EOF.
- Require all 75 installed-package tests on Node 20 and Node 22 before a new release.
- Add a deterministic WebMCP lifecycle soak covering repeated registration, cancellation,
  sibling isolation, late outcomes, confirmation cleanup and refused stale callbacks.
- These are bounded stability checks, not proof of all production allocations, external
  client upgrades, native real-model shopper qualification or memory-leak absence.

## [1.2.1] - 2026-09-21

### Added

- The item page's seventh WebMCP tool, `show_offer`: it scrolls the shopper's own tab to one
  offer the page already renders, marks it for four seconds, and never returns or opens a
  merchant URL. The surface is now 14 contextual contracts, live on production since
  2026-09-11, and the natural-language dataset gains a 47-case v2 that carries every frozen
  v1 case unchanged.

- Timestamped Shopping Brain v12 production verification with the full serving revision,
  sanitized canary results, and explicit limits on what was tested.
- A release workflow tags every package version that reaches `main` and creates the GitHub
  Release from the matching changelog section.

### Fixed

- Validate stdin bytes before SDK parsing, preserve valid UTF-8 exactly, reject malformed or
  truncated input without logging shopper payloads, and bound every raw stdin frame at 8 MiB.
- Close validated stdin promptly even while upstream initialization is stalled.
- Give initialization response streams their own failure and completion lifetime: corrupt,
  oversized or broken initialization responses fail promptly, and a completed initialization
  SSE body closes without ending the negotiated session's event stream.
- Preserve request-local deadlines, cancellation, session recovery and transport cleanup without
  replaying ambiguous failures or cancelling healthy sibling calls.
- Keep WebMCP waiter cancellation private, snapshot invocation options once, refuse invalid signals,
  and adopt accessor-backed thenable results exactly once with their original receiver.

### Verification

- CI and new-version releases test the actual extracted package outside the checkout on Node 20
  and Node 22, using the unchanged release lock and offline dependency installation.
- Installed-package verification includes 72 stdio, UTF-8, framing, SDK and loopback-handshake tests,
  complete file inventories, runtime hashes and dependency-resolution checks. Releases attach
  the verified tarball and per-Node receipts after comparing the two tarballs byte for byte.
- Tag lookup errors fail closed; release checks use genuine Git history. Existing qualification
  datasets, decision rules, evidence ledgers and benchmark-blind review remain unchanged.
- These package and lifecycle checks do not certify external-client adoption, all production
  allocations, native real-model shopper journeys, or Shopping Brain recommendation quality.

## [1.2.0] - 2026-09-07

### Changed

- The stdio entry point is now a full MCP bridge built on the official SDK client. It forwards
  the remote server's identity, instructions, and capabilities at initialize, keeps the remote
  session, relays resources and prompts as well as tools, propagates upstream errors instead of
  returning an empty tool list, and accepts `BESTPRICE_MCP_URL` and `BESTPRICE_MCP_TIMEOUT_MS`.
- Docker image pins Node 22, runs as the `node` user, and no longer falls back to an unlocked
  `npm install`.
- WebMCP contracts declare page membership by name instead of array position and carry the full
  set of safety hints; the demo adapter is split into one handler per tool.
- All plugin manifests share one description and credit BestPrice as the author.
- `PROVIDER_SETUP.md` moved to `docs/provider-setup.md`; README restructured around a tool table
  and per-client quick start.

### Added

- Cursor Marketplace plugin (`.cursor-plugin/`) with an agent skill.
- `glama.json` and a Docker-built stdio entry point so Glama can build and score the server.
- Gemini Interactions API and Genkit examples.
- The 43-case WebMCP natural-language evaluation dataset.
- Biome lint and format, `.editorconfig`, `.nvmrc`, `.dockerignore`, Dependabot, a Node 20/22 CI
  matrix, and `npm run test:coverage`.
- Four Shopping Brain review cases in the fixture: typed OIS evidence, optional feature groups,
  a conversational size correction, and a high-price verdict.
- Bridge tests against an in-process fake remote and child-process tests for the entry point.
- Tests for the WebMCP runtime timeout, cancellation, and teardown paths, the demo adapter's
  validation branches, and the shape of the natural-language evaluation dataset.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull request templates, and this changelog.
- SECURITY.md now states scope, a five-business-day acknowledgement target, a 90-day coordinated
  disclosure window, and a good-faith research statement.

### Fixed

- `examples/gemini-interactions.mjs` crashed on its own error path by assigning to an imported
  binding.
- The Cursor plugin logo path pointed at a directory that does not exist relative to the manifest.
- The Gemini examples allowed three tools while the extensions publish four.

### Removed

- Internal marketplace submission notes, launch plans, and status logs that were checked into
  `submission/` and `CURSOR_MARKETPLACE_SUBMISSION.md`. The review fixture moved to
  `test/fixtures/`, the screenshots to `docs/images/`, and the logo to `assets/`.

## [1.1.0] - 2026-08-31

### Added

- `get_shopping_decision` joins the published tool set in every manifest and guide.

## [1.0.1] - 2026-08-26

### Added

- DeepSeek Harness connection example.

## [1.0.0] - 2026-08-26

### Added

- Initial public release: Gemini CLI and Qwen Code extensions, Codex plugin, Agent Plugin
  manifests, official MCP Registry metadata, provider setup guide, and the WebMCP contracts,
  runtime, and evaluator.

[Unreleased]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.7...HEAD
[1.2.7]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.5...v1.2.6
[1.2.5]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/TheBestCo/bestprice-mcp/releases/tag/v1.0.0
