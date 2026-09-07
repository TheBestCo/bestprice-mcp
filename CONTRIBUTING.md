# Contributing

Thanks for helping improve the BestPrice MCP distribution. This repository holds the client
manifests, the stdio bridge, and the WebMCP layer. The hosted server is developed separately.

## Setup

```sh
git clone https://github.com/TheBestCo/bestprice-mcp.git
cd bestprice-mcp
npm ci
npm run check
npm test
```

Node 20 or newer is required; `.nvmrc` selects 22. Tests run offline.

## Layout

| Path | Purpose |
| --- | --- |
| `stdio.mjs`, `src/bridge.js` | Local stdio MCP server that forwards to the public endpoint |
| `webmcp/` | Browser WebMCP contracts, runtime, demo, and evaluation dataset |
| `*.json`, `.codex-plugin/`, `.cursor-plugin/`, `GEMINI.md`, `QWEN.md` | Per-client manifests; their filenames and root location are fixed by each client |
| `docs/` | Provider setup guide and README images |
| `test/` | Bridge tests, manifest consistency tests, fixtures |

## Making changes

- Run `npm run format` before committing. CI runs `biome ci`, so unformatted code fails.
- Add or update tests with the change. New test files are picked up automatically by
  `node --test` if they end in `.test.js`.
- Keep the manifests in sync: `test/manifests.test.js` fails if a description, endpoint,
  tool list, or version drifts between files.
- Add a line under **Unreleased** in `CHANGELOG.md` for anything a user would notice.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`,
imperative mood, no trailing period. Types in use: `feat`, `fix`, `docs`, `refactor`, `test`,
`chore`, `ci`. Scopes in use: `stdio`, `webmcp`, `manifests`, `registry`, `docs`.

## Versions

Two versions are tracked on purpose.

**Package version** (`package.json`). Bump it when the manifests, bridge, or WebMCP layer
change. These files must carry the same number, and the test suite enforces it:

- `package.json`
- `plugin.json`
- `.codex-plugin/plugin.json`
- `.cursor-plugin/plugin.json`
- `gemini-extension.json`
- `qwen-extension.json`

**Server version** (`server.json`). This is the version the hosted service reports. Update
it, and the "Server version" line in `README.md`, only when the hosted service releases.
It is published to the official MCP Registry by the manual
`publish-mcp-registry` workflow, which requires approval on the `mcp-registry` environment.

## Releasing the package

1. Bump the package version in the six files above and move the **Unreleased** section of
   `CHANGELOG.md` under the new version with today's date.
2. Open a pull request; CI must be green.
3. After merging, tag the merge commit `vX.Y.Z` and push the tag. Clients that install from
   the repository URL pick up `main`; the tag is for the changelog and the Docker image.

## Directory listings

`glama.json` names the Glama maintainer by GitHub handle, as Glama requires; it should point
at an organisation-managed account. Other directory listings are external and are not
tracked in this repository.
