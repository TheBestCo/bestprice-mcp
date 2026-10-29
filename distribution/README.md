# External catalog contribution payloads

A dated machine-readable distribution ledger is kept in [`status.json`](status.json). It distinguishes
public listings from submitted reviews, synchronized-fork preparations, stale third-party snapshots,
and provider/account gates. Update the ledger from observed receipts and public pages; never upgrade a
state just because a payload exists.


These files are canonical, CI-pinned payloads for discovery catalogs whose source of truth lives in
another repository. They make contribution review reproducible; checking them into this repository
does **not** mean the external catalog has accepted or published the entry.

## GitHub Agent Finder

`agentfinder/bestprice-shopping.json` matches the contributor schema for
`github/agentfinder-catalog`. The external catalog requires a fork + pull request. BestPrice's MCP
is already published separately as `gr.bestprice/mcp` in the official MCP Registry.

## Docker MCP Registry

`docker/bestprice-shopping/` contains the three files Docker requires for a remote server:
`server.yaml`, `tools.json`, and `readme.md`. The server is unauthenticated Streamable HTTP,
so the Docker payload deliberately contains no OAuth configuration and no copied tool inventory.
This directory is the canonical metadata. Three pull requests are open on `docker/mcp-registry`:
[#5228](https://github.com/docker/mcp-registry/pull/5228) (`bestprice-shopping`, the one to keep;
update its icon to the square PNG in `server.yaml` here),
[#4900](https://github.com/docker/mcp-registry/pull/4900) (same directory name, no `tools.json`,
a favicon, and `category: productivity`), and
[#4798](https://github.com/docker/mcp-registry/pull/4798) (`servers/bestprice`, a description that
omits shopping decisions, and no `tools.json`). Close #4900 and #4798 so review has one entry.

## Cline Marketplace

`cline/bestprice-shopping/entry.json` matches the current PR-based `cline/marketplace` MCP schema.
It is intended to be copied to `registry/mcps/bestprice-shopping/entry.json` in a fork of that
repository. The install command resolves directly to the public zero-auth Streamable HTTP endpoint;
`verified` and `featured` stay false because those are Cline review decisions. Cline's tag
vocabulary has no shopping id, so this entry uses their `business` and `research` tags. The
description still names the four shopping tools.

## Registry mirrors

MCP Harbor mirrors the official MCP Registry every six hours. Because `gr.bestprice/mcp` is already
published there, Harbor rejects a duplicate local submission as `name is already published`. Keep
the official registry record current instead of maintaining a second Harbor payload.

## Microsoft 365 Copilot

`microsoft-copilot/` is a declarative-agent app package for the public keyless endpoint.
`ai-plugin.json` uses plugin manifest 2.4, runtime `RemoteMCPServer`, and `auth.type: None`.
The sideload and Partner Center steps are in that folder's README. The package is not a claim
that Partner Center has accepted the offer.

## Grok Build plugin marketplace

`grok/marketplace-entry.json` is the object to append to `.grok-plugin/marketplace.json` in
`xai-org/plugin-marketplace`. It is a remote `source.url` entry. `source.sha` is omitted on purpose:
that catalog rejects anything other than the full lowercase commit that reviewers will clone, and the
commit that contains this marketplace-ready tree does not exist until it is on the default branch.
Add the SHA, then open the external pull request. Do not pin a branch name.

## Other directories

Smithery's connection proxy, CLI, and `server.smithery.ai` / `run.tools` hosts shut down on
2026-10-31. What remains is a curated public directory of direct MCP URLs. The root `smithery.yaml`
records the upstream URL and an empty config so a listing does not ask for an API key and does not
build this repository's stdio image. The public `bestprice/shopping` page had no deployment on
2026-10-29. Do not republish through the proxy.
Glama already has source metadata in `glama.json`; any stale public Glama snapshot is crawler/claim
state rather than a second BestPrice contract. Do not fork the canonical tool descriptions into
directory-specific files unless the directory requires them.
