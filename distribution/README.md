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

## Cline Marketplace

`cline/bestprice-shopping/entry.json` matches the current PR-based `cline/marketplace` MCP schema.
It is intended to be copied to `registry/mcps/bestprice-shopping/entry.json` in a fork of that
repository. The install command resolves directly to the public zero-auth Streamable HTTP endpoint;
`verified` and `featured` stay false because those are Cline review decisions.

## Registry mirrors

MCP Harbor mirrors the official MCP Registry every six hours. Because `gr.bestprice/mcp` is already
published there, Harbor rejects a duplicate local submission as `name is already published`. Keep
the official registry record current instead of maintaining a second Harbor payload.

## Other directories

Smithery currently requires an authenticated publisher namespace/API key for explicit publication.
Glama already has source metadata in `glama.json`; any stale public Glama snapshot is crawler/claim
state rather than a second BestPrice contract. Do not fork the canonical tool descriptions into
directory-specific files unless the directory requires them.
