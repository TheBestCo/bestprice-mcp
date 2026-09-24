# External catalog contribution payloads

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

## Other directories

Smithery currently requires an authenticated publisher namespace/API key for explicit publication.
Glama already has source metadata in `glama.json`; any stale public Glama snapshot is crawler/claim
state rather than a second BestPrice contract. Do not fork the canonical tool descriptions into
directory-specific files unless the directory requires them.
