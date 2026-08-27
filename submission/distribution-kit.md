# BestPrice MCP distribution kit

Use this copy only after the production smoke test is green. Keep the claims
small and verifiable: Greece, read-only tools, live BestPrice data, no checkout,
and no provider endorsement.

## Links by audience

- People and press: `https://www.bestprice.gr/mcp`
- Developers: `https://github.com/TheBestCo/bestprice-mcp`
- MCP clients: `https://mcp.bestprice.gr/mcp`
- WebMCP manifest: `https://www.bestprice.gr/.well-known/webmcp.json`

For public posts, add standard campaign parameters to the guide URL so each
channel can be measured without changing the canonical page:

```text
LinkedIn  ?utm_source=linkedin&utm_medium=social&utm_campaign=bestprice_mcp_launch
X         ?utm_source=x&utm_medium=social&utm_campaign=bestprice_mcp_launch
HN        ?utm_source=hackernews&utm_medium=community&utm_campaign=bestprice_mcp_launch
Reddit    ?utm_source=reddit&utm_medium=community&utm_campaign=bestprice_mcp_launch
ProductHunt ?utm_source=producthunt&utm_medium=launch&utm_campaign=bestprice_mcp_launch
```

## LinkedIn, CEO account

Today we are opening a small experiment from BestPrice.

AI assistants can now use BestPrice to search for products, compare delivered
prices and check price history through a public MCP connection. We have also
added WebMCP tools to the shopping page itself, so a compatible browser
assistant can work with the products, filters and offers a person is already
looking at.

We deliberately kept the first version narrow. It is read-only. It cannot buy,
add something to a basket or choose a shop for you. The person remains in
control of the final decision.

It is live, open source and focused on the Greek market. If you build agents or
work on online shopping, I would genuinely like to hear where it helps and
where it gets in the way.

https://www.bestprice.gr/mcp

## X

We have opened BestPrice to shopping assistants through MCP, and added WebMCP
tools to the page itself.

Search, delivered-price comparison and price history. Read-only, Greece-first,
and the shopper still chooses the shop.

Live now: https://www.bestprice.gr/mcp
Source: https://github.com/TheBestCo/bestprice-mcp

## Show HN

### Title

Show HN: BestPrice MCP and WebMCP for product search and offer comparison

### Body

We have released a public, read-only MCP server for BestPrice, a Greek price
comparison service. It exposes three tools: product search, offer comparison by
delivered price, and price history.

We also ship 13 contextual WebMCP tools on the website. The available tools
follow the open page: search on the homepage, visible products and filters on a
listing, then offers, specifications and price history on a product page.

The main constraint was making the surface useful without letting an agent
silently choose a merchant. There is no checkout, basket mutation or direct
merchant URL. Unknown shipping remains unknown.

Guide: https://www.bestprice.gr/mcp

Source and test harness: https://github.com/TheBestCo/bestprice-mcp

I would be interested in feedback on the tool boundaries and on compatibility
with MCP and WebMCP clients outside the ones we tested.

## Reddit, r/mcp or r/WebMCP_Developers

### Title

We shipped a public MCP plus 13 page-level WebMCP tools for Greek shopping

### Body

BestPrice now has a public Streamable HTTP MCP endpoint for product search,
offer comparison and price history. It requires no BestPrice account or API
key.

The website also registers contextual WebMCP tools. A listing exposes only the
products, filters and sorting choices actually visible there. A product page
exposes product facts, delivered-price comparison, specifications and price
history.

The implementation is intentionally read-only and does not expose checkout or
direct merchant links. Source, schemas, test cases and setup examples are here:
https://github.com/TheBestCo/bestprice-mcp

Live guide: https://www.bestprice.gr/mcp

Feedback and client compatibility reports are welcome.

## Product Hunt

### Name

BestPrice MCP

### Tagline

Live Greek product and offer data for compatible shopping assistants

### Short description

Search BestPrice products, compare delivered prices and inspect price history
through a public read-only MCP server. Compatible browsers can also use 13
contextual WebMCP tools on the open BestPrice page.

### First comment

We built this as a narrow public pilot, not as an autonomous checkout system.
The assistant can help a person gather and compare information, but it cannot
buy, add to basket or select a merchant. We would value feedback from people
building MCP clients, browser agents and shopping experiences.

## English outreach note

Subject: BestPrice opens Greek product and offer data to MCP and WebMCP clients

BestPrice has released a public, read-only MCP server for product search, offer
comparison and price history in Greece. The live website also exposes 13
contextual WebMCP tools across search, listings and product pages.

The integration is deliberately bounded: it cannot check out, modify a basket
or choose a merchant. The source, schemas and test harness are public.

Guide: https://www.bestprice.gr/mcp
Source: https://github.com/TheBestCo/bestprice-mcp

If this is relevant to your coverage or community, I can share the short demo
and answer technical questions.

## Σύντομο σημείωμα για ελληνικά μέσα

Θέμα: Το BestPrice διαθέτει δημόσια σύνδεση MCP για βοηθούς αγορών

Το BestPrice διαθέτει πλέον μια δημόσια σύνδεση MCP, αποκλειστικά για ανάγνωση. Ένας
συμβατός βοηθός μπορεί να αναζητήσει προϊόντα, να συγκρίνει το τελικό κόστος
προσφορών και να δει την πορεία μιας τιμής. Παράλληλα, οι σελίδες του BestPrice
διαθέτουν εργαλεία WebMCP για όσα βλέπει ήδη ο χρήστης στην οθόνη του.

Η πρώτη έκδοση δεν πραγματοποιεί αγορές, δεν προσθέτει προϊόντα στο καλάθι και
δεν επιλέγει κατάστημα. Ο χρήστης διατηρεί τον έλεγχο της απόφασης.

Πληροφορίες: https://www.bestprice.gr/mcp
Κώδικας και παραδείγματα: https://github.com/TheBestCo/bestprice-mcp

## WebMCP resource suggestion

Suggest `https://www.bestprice.gr/mcp` as a live commerce implementation with
this note:

> BestPrice exposes 13 contextual WebMCP tools across product search, visible
> listing filters and sorting, product details, delivered-price comparison,
> specifications and price history. The implementation is live, read-only and
> open source.

## Recommended sequence

1. Refresh the two existing WebMCP indexes and submit the remaining free ones.
2. Publish the short demo and complete the OpenAI WebMCP Challenge entry.
3. Post from the CEO LinkedIn and X accounts on the same day.
4. Share the technical version on Show HN and one relevant subreddit the next
   morning. Answer questions directly and do not repeat the marketing copy.
5. Send the short note to a small, relevant list of Greek technology and retail
   reporters rather than a broad press blast.
6. Publish a factual follow-up after two weeks with real agent calls, landing
   rate, merchant clickouts and the problems found. Do not announce revenue
   before the attribution ledger records it.
