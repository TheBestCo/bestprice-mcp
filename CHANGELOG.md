# Changelog

All notable changes to this repository are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package version follows
[Semantic Versioning](https://semver.org/). The hosted server has its own version, recorded
in `server.json`; see the Versioning section of the README.

## [Unreleased]

### Added

- Timestamped Shopping Brain v12 production verification with the full serving revision,
  sanitized canary results, and explicit limits on what was tested.
- A release workflow tags every package version that reaches `main` and creates the GitHub
  Release from the matching changelog section.

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

[Unreleased]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/TheBestCo/bestprice-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/TheBestCo/bestprice-mcp/releases/tag/v1.0.0
