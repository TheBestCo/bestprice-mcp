# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package version follows
[Semantic Versioning](https://semver.org/). The hosted server has its own version, recorded
in `server.json`; see the Versioning section of the README.

## [Unreleased]

## [1.4.1] - 2026-09-25

WebMCP contract 1.9 as the storefront revised it the same day (bestprice.gr `971aa25d79`, `b550a849e8`;
registration revision 2026-09-25.7). The contract version and the 16 tools are unchanged.

### Changed

- **`search_bestprice` narrows by price, stock, deals and order**: optional `min_price_eur`, `max_price_eur`,
  `sort` (`relevance`, `price_asc`, `price_desc`, `biggest_price_drop`, `most_stores`, `newest`),
  `in_stock_only` and `deals_only`; the result reports each requested constraint as `applied` or `not_applied`,
  with why.
- **One product id form everywhere, digits only** (`^\d{1,20}$`): `compare_page_offers`, `get_product_details`
  and `open_visible_product` share one schema, and the MCP server's `bp_<id>` is refused with the digits to send.
- **`get_product_details` can open the product** (`navigate`), so it is annotated as a navigation, not a read.
- **Descriptions** follow the storefront's one scannable shape, at most 250 characters, and name only tools
  their page registers: the item page registers its own wording for `search_bestprice` and
  `get_shopping_decision` (`TOOL_DEFINITIONS[name].pageDescriptions`, registered by `createTools`). Input field
  wording follows the storefront's.
- **Dataset 11.0.0** is the default evaluation set: 10.0.0 with argument rules regenerated from the revision.
  `get_product_details` stays an admitted extra read only as a read (`navigate: false`); the grader now checks
  number arguments. 10.0.0 is frozen with its first-1.9 argument rules recorded; `runs.v11.json` starts empty.
- The demo implements the constraints (its results page offers the two orders its listing renders, and reports
  the others `not_offered`), the single id form and `navigate`, within the published output schemas, and passes
  11.0.0 with the same 6 refusals as before.
- Parity and the release conformance check cover each page's own wording (`pages[].descriptions`); the
  storefront reader resolves constants imported through the bundler's aliases and re-exports.

## [1.4.0] - 2026-09-25

WebMCP contract 1.9, as the BestPrice.gr storefront registers it (bestprice.gr `b43f47d55b`, after `867fcffe5a`).

### Added

- **`get_product_details` — 16 tools.** On the home page, listings and every other public page (not the item
  page, whose own tools cover the product in view), it reads one product by `product_id` — numeric, or `bp_<id>` —
  without moving the tab: its facts, up to four offers ranked by delivered price, key specifications and the
  price-history summary; `include` picks the sections. It is read-only.
- **The `site` page type.** Every other public BestPrice page — articles and guides, deals, lists, stores, brands,
  collections, comparisons, stories — registers `search_bestprice`, `get_product_details` and
  `get_shopping_decision`. `PAGE_TOOL_NAMES.site` and `createTools({ page: 'site' })` publish it; the home page now
  registers 5 tools and listings 10.
- **Dataset 10.0.0**, the default evaluation set: 9.0.0 graded against contract 1.9 — `get_product_details` admitted
  as an extra read in every case (reading a product before opening it no longer fails a chain), and argument rules
  regenerated from 1.9, whose `include` list the grader now checks by length and items. 9.0.0 stays frozen, with
  its 1.8 argument rules recorded; `runs.v10.json` starts empty. No case starts on a `site` page yet.

### Changed

- `get_shopping_decision` returns the page tools' numeric product ids instead of the MCP server's `bp_<id>`, and
  `search_bestprice` names `get_product_details` among the tools its results page offers; the words and output
  schemas follow the storefront's.
- The demo implements both from its fixture, within the published output schemas: `get_product_details` for any
  fixture product, and an article page with the site-wide tools. It passes 10.0.0 with 41 passed and the same 6
  refusals as before.
- The storefront reader follows the tool into `product-details-tool.js` and reads `Object.freeze([...])` lists and
  list spreads (`enum: [...DETAIL_SECTIONS]`); the page lists fold the storefront's `site` page type.

## [1.3.0] - 2026-09-25

WebMCP contract 1.8, as the BestPrice.gr storefront registers it (bestprice.gr `e0be10690f`).

### Added

- **`get_shopping_decision` on every page — 15 tools.** It asks the BestPrice Shopping Brain (the public MCP
  endpoint's tool of the same name) with the shopper's own words (`message`, 1–2000 characters) and an optional
  Greek `postal_code` (10000–85999), and returns the outcome, the pick with its lowest price before shipping and
  BestPrice link, up to three alternatives, reasons, tradeoffs, unknowns, and a clarifying question when one is
  needed. It is read-only and never moves the tab.
- **`search_bestprice` answers with its results.** New optional `limit` (1–8, default 6) and `navigate` (default
  true; `false` only reads); the result carries the product cards, the results page and its kind, whether the tab
  moved, and the tools the results page registers.
- **The home page browses its sections**: it registers `get_visible_products` and `open_visible_product` too (4
  tools). Listing pages register 9 tools and item pages 8, each with search first and the Shopping Brain last.
- **Further result pages and named products.** `get_visible_products` takes `load_more` to load a listing's next
  result page and reports the pages loaded; `compare_page_offers` takes the `product_id` a decision names
  (`bp_<id>` or numeric; another product is refused with where to find it), states its `ranking_basis`, and names
  the unknown-shipping offer it leaves out; `get_product_specifications` reads a fact by its common English name.
- **Output schemas.** Every tool publishes the storefront's own output schema, a closed `oneOf` of its success and
  its refusal; `createTools` returns it as `outputSchema`. `TOOL_DEFINITIONS` and `WEBMCP_CONTRACT_VERSION` are
  exported from `webmcp/src/contracts.js`.
- **Dataset 9.0.0**, the default evaluation set: 8.0.0 graded against contract 1.8 — argument rules and admitted
  reads regenerated from the 1.8 contract, and `home-001`, `home-002`, `home-005` and `listing-012` check the
  structured search result (`results_url`, `results_kind`, `products`, `navigated`) instead of `action`, which
  1.8 no longer returns. 1.0.0–8.0.0 stay frozen with their runs; `runs.v9.json` starts empty.
- `npm run webmcp:snapshot -- <storefront checkout>` regenerates the storefront snapshot and
  `webmcp/src/storefront-catalog.js`, the words and output schemas the contracts publish.

### Changed

- Every title and description is the storefront's rewritten wording, at most 500 characters (what the tool does,
  when to use it, what it returns, what it changes), and input field descriptions match what the pages register
  word for word. Annotations are the storefront's exactly: every tool declares `consequentialHint: false`, and the
  read-only page tools carry `readOnlyHint`/`consequentialHint`/`untrustedContentHint` only.
- Contract parity now covers every field. `webmcp/src/contract-parity.js` reads each tool's words and output
  schema from the storefront's generated `extra/mcpDiscovery/webmcp-tools.json`, its input schema and annotations
  from the page modules that register it (template literals, regular-expression and string bounds, and imported
  constants resolved), and each page type's tools from the manifest the storefront's PHP builder renders. The
  committed snapshot is now `storefront-tools.v2.json`; the sibling re-check runs on a checkout that contains the
  snapshot's source commit and names the one it lacks otherwise. The release conformance check also holds the
  served manifest's tool order, page lists, words and output schemas to the published contract.
- The demo adapter returns only results its tool's published output schema admits (a new test validates every
  tool on every page, refusals included), accepts every argument the contracts declare (`show_offer.offer_ref`
  was refused), browses the home page's section, and answers `get_shopping_decision` from its fixture or an
  injected `decide`, never the network on its own. It passes dataset 9.0.0: 41 passed, and the same 6 refusals
  the page makes on 2.0.0.
- The evaluation driver sets admitted reads aside when it counts a chain, as the grader does, and a scripted run
  of a case that expects no call ends in a refusal; the grader refuses a non-boolean boolean argument.
- The native read smoke takes each page's expected tools from the published contract, and an evidence record's
  implementation fingerprint also covers `webmcp/src/storefront-catalog.js`, where the tools' words now live.

## [1.2.8] - 2026-09-25

### Fixed

- **The stdio bridge connects again on Node 24, 25 and 26.** Since 1.2.1, `node stdio.mjs` failed every handshake on
  current Node (undici 7.12 and later): the MCP SDK cancels the empty body of the 202 that answers
  `notifications/initialized`, and the UTF-8 response guard reported that cancellation as an upstream stream failure,
  which aborted the shared upstream connection before `tools/list`. Hosts saw the fallback `bestprice-mcp-stdio`
  server and "This operation was aborted" on every call. A body the consumer discards is no longer a failure; invalid
  UTF-8, oversize and truncated bodies, and real read errors, are still reported exactly once. Node 20 to 23 were
  unaffected.

### Added

- CI now also runs the full test suite on the current Node line (26), so a runtime change like undici 7.12 cannot
  break the bridge unnoticed again.

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

[Unreleased]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.4.1...HEAD
[1.4.1]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.8...v1.3.0
[1.2.8]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.7...v1.2.8
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
