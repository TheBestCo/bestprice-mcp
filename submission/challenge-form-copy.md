# WebMCP Challenge form copy

This is the final copy-ready field map for the public video and Devpost entry.
It describes only the browser-native work that is live and reviewable today.

## YouTube

### Title

BestPrice WebMCP: shop with the page, not around it

### Description

BestPrice now exposes contextual WebMCP tools on the shopping page a person
already has open. An agent can search, inspect visible products, use the
filters and sorting choices rendered on the page, open a visible product,
compare delivered prices, read specifications, and summarize price history.

The page remains visible throughout the journey. The tools do not buy, log in,
add to basket, or choose a merchant. Unknown shipping remains unknown, and the
shopper makes the final decision.

Live app: https://www.bestprice.gr/

Public guide: https://www.bestprice.gr/mcp

Source and evaluator: https://github.com/TheBestCo/bestprice-mcp/tree/main/webmcp

#WebMCP #MCP #AgenticWeb #BestPrice

## Devpost

### Project name

BestPrice: shop with the page, not around it

### Tagline

The open shopping page becomes a structured workspace for people and their agents.

### Live app

https://www.bestprice.gr/

### Public repository

https://github.com/TheBestCo/bestprice-mcp

### Project description

BestPrice turns the shopping page a person already has open into a small,
structured workspace for their agent. The available tools follow the page.
The homepage offers product search. A listing offers the products, filters, and
sorting choices currently rendered there. A product page offers product facts,
delivered-price comparison, specifications, and price history.

This is useful because shopping pages contain details an agent should not have
to infer from layout alone. WebMCP lets the page say exactly what can be read or
changed. Every navigation remains visible, and the shopper keeps the decision
about which shop to visit.

The implementation uses `document.modelContext.registerTool` and manages the
tool lifecycle as the page changes. It validates arguments in executable code,
uses only same-origin URLs and visible page state, ignores hidden and decoy
elements, caps individual outputs, rolls back partial registrations, and keeps
telemetry failures away from tool results. The source package includes the 13
tool contracts, a local inspector, a deterministic evaluator, and tests under
Apache License 2.0.

BestPrice and its remote MCP service existed before the challenge. The work
submitted here is the new browser-native WebMCP layer shipped during the
challenge window.

### What people and agents can do together

1. Ask the agent to start a product search on BestPrice.
2. Inspect only the products, filters, and sorting choices visible on the page.
3. Apply a visible filter or sort choice and watch the page update.
4. Open one of the products the page returned.
5. Compare delivered prices, read specifications, and review price history.
6. Let the shopper inspect the same page and choose a shop.

### Safety boundary

The tools do not check out, add to basket, sign in, return direct merchant URLs,
or treat missing shipping as free. A product can be opened only when its exact
ID and canonical BestPrice link are both present in the visible listing.

### Built with

WebMCP, JavaScript, PHP, JSON Schema, Jest, Node.js, New Relic

### Suggested categories

E-commerce/Retail, Machine Learning/AI, Web

### Media

- Demo video: upload `bestprice-webmcp-demo.mp4` as a public YouTube video.
- Project cover: `https://www.bestprice.gr/extra/mcpLanding/assets/bestprice-mcp-share.png`
- Square logo: `submission/bestprice-mcp-logo-1024.png`

