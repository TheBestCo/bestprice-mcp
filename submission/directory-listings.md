# Directory listing field map

Use the same identity everywhere. Do not rename the endpoint, imply a provider
partnership, or describe the service as covering the whole BestPrice catalog.

## Canonical listing

- Name: `BestPrice Shopping`
- Registry ID: `gr.bestprice/mcp`
- Endpoint: `https://mcp.bestprice.gr/mcp`
- Website: `https://www.bestprice.gr/mcp`
- Repository: `https://github.com/TheBestCo/bestprice-mcp`
- Logo: `https://www.bestprice.gr/images/logo.svg`
- Support: `https://www.bestprice.gr/contact`
- Contact: `feedback@bestprice.gr`
- Category: `E-Commerce` or `Shopping`
- Transport: `Streamable HTTP`
- Authentication: `None`
- Pricing: `Free`
- Status: `Active`
- License: `Apache-2.0`
- Tags: `shopping, ecommerce, price-comparison, greece, read-only`

Short description:

> Read-only product search, delivered-price offer comparison, and price
> history for the Greek market.

Long description:

> BestPrice Shopping gives compatible AI assistants three read-only tools for
> reviewed product search, current offer comparison by delivered total, and
> price history in Greece. It uses a public Streamable HTTP endpoint with no
> BestPrice account or API key. It cannot check out, modify a basket, select a
> merchant, or expose direct merchant URLs.

Portable configuration:

```json
{
  "mcpServers": {
    "bestprice-shopping": {
      "url": "https://mcp.bestprice.gr/mcp"
    }
  }
}
```

## MCP Server Finder

Submission method: email `info@mcpserverfinder.com`.

Subject:

```text
MCP Server Listing Request: BestPrice Shopping
```

Body:

```text
Hello,

Please consider BestPrice Shopping for the MCP Server Finder directory.

Server name: BestPrice Shopping
Description: Read-only product search, delivered-price offer comparison, and price history for the Greek market.
Official Registry ID: gr.bestprice/mcp
Endpoint: https://mcp.bestprice.gr/mcp
Repository: https://github.com/TheBestCo/bestprice-mcp
Website: https://www.bestprice.gr/mcp
Category: ecommerce, shopping, price comparison
Transport: Streamable HTTP
Authentication: none
Logo: https://www.bestprice.gr/images/logo.svg

The production endpoint and its server card are public. The integration does not perform checkout or basket changes.

Thank you,
BestPrice.gr
```

## AllMCPs

Submission form: `https://allmcps.com/submit`

- GitHub URL: `https://github.com/TheBestCo/bestprice-mcp`
- Name: `BestPrice Shopping`
- Email: `feedback@bestprice.gr`
- Website URL: `https://www.bestprice.gr/mcp`
- Description: use the long description above
- Category: `🛒 E-Commerce`
- Tags: `shopping, ecommerce, price-comparison, greece, read-only`
- Pricing: `free`
- Authentication: `none`
- Status: `active`
- License: `Apache-2.0`
- Support URL: `https://www.bestprice.gr/contact`
- Remote endpoint: `https://mcp.bestprice.gr/mcp`
- Transport capability: Streamable HTTP

Do not opt into the directory newsletter as part of the submission.

## FindMCP.app

Submission form: `https://findmcp.app/submit`

- Name: `BestPrice Shopping`
- Repository: `https://github.com/TheBestCo/bestprice-mcp`
- Description: use the long description above
- Installation snippet: use the portable configuration above
- Category: `E-Commerce`
- Transport: `http`
- Email: `feedback@bestprice.gr`

## MCPub

Submission page and MCP endpoint: `https://mcpub.dev/`

- Endpoint: `https://mcp.bestprice.gr/mcp`
- Description: use the short description above

Both `https://mcp.bestprice.gr/.well-known/mcp.json` and the endpoint are live,
which satisfies the directory's public verification prerequisites.

## Developers Digest MCP Directory

Submission method: public GitHub issue at
`https://github.com/developersdigest/dd-mcp-directory/issues/new`.

Issue title:

```text
New server submission: BestPrice Shopping
```

Issue body:

```markdown
## Server name

BestPrice Shopping

## GitHub URL

https://github.com/TheBestCo/bestprice-mcp

## Description

Read-only product search, delivered-price offer comparison, and price history for the Greek market.

## Install command

Connect over Streamable HTTP: https://mcp.bestprice.gr/mcp

## Category

api

## Tags

ecommerce, shopping, price-comparison, greece, read-only, streamable-http
```

This route uses an issue, not a pull request.

## WebMCP refreshes

The live manifest is `https://www.bestprice.gr/.well-known/webmcp.json` and has
13 tools.

- WebMCP Registry update: `https://webmcp-registry.dev/submit?domain=www.bestprice.gr`
- webmcp.com site refresh: `https://webmcp.com/submit`
- Web MCP Registry: `https://webmcpregistry.org/submit`
- WebMCP Directory: `https://webmcpdirectory.com/submit`

For a webmcp.com resource suggestion, use `https://www.bestprice.gr/mcp` and:

> BestPrice exposes 13 contextual WebMCP tools across product search, visible
> listing filters and sorting, product details, delivered-price comparison,
> specifications and price history. The implementation is live, read-only and
> open source.

## Additional free directories

Checked or submitted on 2026-08-27:

- MCP Market: already live at `https://mcpmarket.com/server/bestprice`.
- MyMCPTools: free submission accepted for review; stated review window is
  24–48 hours.
- ClawTools: free submission accepted as project `11139559`; status is
  `waiting approval`.
- Kiprio: repository and contact submitted for the next weekly refresh. The
  form cleared without issuing a durable receipt.
- MCP Server Hub: name, repository, category, and Streamable HTTP
  configuration submitted. The form cleared without issuing a durable receipt.
- WebMCP List: site, public URL, description, email, and one representative
  tool submitted. The form reset but issued no durable receipt; its category
  control had no available options, matching the directory's empty public
  category index at submission time.
- IndexMCP: form completion failed server-side with `Could not find the
  'category' column of 'submissions' in the schema cache`.
- MCPServe: `https://mcpserve.com/submit` returned `ERR_EMPTY_RESPONSE`.
- MCPCMD: the listing form is valid but its reCAPTCHA-protected submission did
  not produce a confirmation. Do not claim a pending listing without a receipt.
- ClaudeRules and MCPInstall: each free route requires a new third-party OAuth
  grant. Do not authorize either application without a separate account-owner
  decision.
- DReview: requires creating a password-based account. Credential creation is
  intentionally left to the account owner.
- ClaudePluginHub: Cloudflare presented an interactive browser challenge.
  Complete it manually before attempting its listing form.

## Programme and challenge status

- Chrome Built-in AI Early Preview Program: submitted successfully on
  2026-08-27 using the BestPrice production WebMCP implementation as the live
  use case.
- The WebMCP Challenge on Devpost: project `1156703` is complete and publicly
  previewable at
  `https://devpost.com/software/bestprice-shop-with-the-page-not-around-it`.
  The story, production testing instructions, source link, Built With tags,
  organization details, thumbnail, gallery artwork, and public demo have all
  been saved. Final submission is waiting only for the account owner to accept
  the challenge's Official Rules and Devpost Terms of Service.
- The public demo is live at `https://youtu.be/guJ836IGfNA`.
- The GitHub repository social preview uses the production BestPrice MCP share
  image from `extra/mcpLanding/assets/bestprice-mcp-share.png` in the
  `bestprice.gr` repository.

## Deliberately skipped

- MCP Find requires a package name and creates a pull request. BestPrice is a
  remote-only server, and this launch does not use pull requests.
- GoogleChromeLabs and W3C awesome lists require pull requests.
- Developers Digest's pull-request route is unnecessary because its issue route
  accepts the same submission.
- Paid listings and reciprocal production badges are not justified until the
  attribution report shows meaningful usage.
- Do not submit to a directory that cannot fetch the endpoint, has no visible
  review process, or asks to authorize an unverified GitHub application.
