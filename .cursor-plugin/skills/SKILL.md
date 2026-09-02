---
name: bestprice-shopping
description: Guide for using BestPrice Shopping MCP tools effectively
globs: []
alwaysApply: false
---

# BestPrice Shopping Guide

Use BestPrice Shopping tools when users need help with product research, price comparison, or shopping decisions for products available in Greece.

## When to Use BestPrice Tools

Trigger these tools when the user:
- Asks for shopping recommendations or product advice
- Wants to compare prices for a specific product
- Needs to find the best deal or offers for an item
- Asks about price history or trends
- Mentions Greek shopping, BestPrice.gr, or Greek product availability

## Available Tools

### 1. `get_shopping_decision`
**Purpose:** Get evidence-backed product recommendations based on user requirements.

**When to use:**
- User describes what they need (features, budget, use case)
- User asks "what should I buy?" or "which product is best for..."
- Initial shopping research phase

**Example prompts:**
- "I need a phone under €500 with NFC and 5G"
- "Find me the best noise-canceling headphones for travel"
- "What's a good 55-inch TV for gaming under €1000?"

**Important:** Always ask for Greek text input if the user provides requirements in English. BestPrice works best with Greek queries.

### 2. `search_products`
**Purpose:** Search for specific products by name, model, or brand.

**When to use:**
- User knows exactly what product they want
- User mentions a specific brand/model
- Follow-up after a shopping decision to find specific items

**Example prompts:**
- "Find Sony WH-1000XM5 headphones"
- "Search for iPhone 15 Pro"
- "Look for Samsung Galaxy S24"

### 3. `compare_offers`
**Purpose:** Compare current offers, prices, and shipping for a specific product.

**When to use:**
- After getting a `product_id` from search or decision tools
- User wants to see where to buy and compare merchants
- User asks about delivery options or total price including shipping

**Required:** 
- `product_id` from previous tool calls
- Optional: `postal_code` for accurate shipping calculations

**Important:** Never invent or guess a product_id. Always get it from previous tool results.

### 4. `get_price_history`
**Purpose:** View price trends over time for a specific product.

**When to use:**
- After getting a `product_id`
- User asks if price is good, if they should wait, or about price trends
- User wants to see historical pricing data

**Parameters:**
- `product_id`: from previous tool calls
- `days`: typically 30, 90, or 180 days

## Best Practices

1. **Language:** BestPrice works best with Greek text. If user provides requirements in English, acknowledge and explain that Greek queries will yield better results.

2. **Workflow:** Follow this natural flow:
   ```
   Decision/Search → Get product_id → Compare Offers → Price History
   ```

3. **Never:**
   - Invent or guess product IDs
   - Treat unknown delivery costs as free
   - Provide direct merchant URLs
   - Suggest making purchases directly

4. **Always:**
   - Show the BestPrice.gr links in results
   - Mention that results are read-only
   - Ask for postal code when comparing offers for accurate shipping
   - Respect the bounded search scope (safe physical products only)

## Example Session

**User:** "Θέλω κινητό έως 500 ευρώ με NFC και 5G υποχρεωτικά"

**Agent:**
1. Call `get_shopping_decision` with the Greek text
2. Present the recommended products
3. If user picks one, use its `product_id` to call `compare_offers` (ask for postal code)
4. Optionally show `get_price_history` if user wants price trends

## Limitations

- Products: Safe physical products only (no digital goods, age-restricted items)
- Geography: Greece-focused (prices, merchants, shipping)
- Access: Read-only, no purchases or direct merchant integration
- Shipping: Prices shown exclude shipping unless comparing offers with postal code

## Support

- Documentation: https://www.bestprice.gr/mcp
- Privacy Policy: https://www.bestprice.gr/policies/privacy
- Terms: https://www.bestprice.gr/policies/terms
- Contact: https://www.bestprice.gr/contact
