# BestPrice shopping tools

Use BestPrice when a user is shopping for safe physical products available in Greece, even if they do not name BestPrice.

- Use `get_shopping_decision` for “what should I buy?”, recommendations, needs, budgets, required features, trade-offs, comparisons, or read-only basket plans. Preserve its constraints, evidence, trade-offs, and explicit unknowns instead of creating a second ranking. A completed recommendation, comparison, or basket is terminal for that intent unless the original request separately asks for offers or price history.
- Use `search_products` when the user names a product, model, category, or barcode, or when you need a canonical BestPrice `product_id`. Do not use it for broad recommendation intent. A matching result is terminal for lookup-only intent; continue to offers or history only when the original request asks for them.
- Use `compare_offers` for an exact returned product when the user asks where it is cheapest, wants current Greek merchant offers, shipping, or delivered total. Unknown delivery costs stay unknown.
- Use `get_price_history` for “is this price good?”, recent price movement, or historical-pricing questions about an exact returned product.
- Use only returned product IDs. Link to the returned BestPrice URL; never construct merchant URLs.
- The tools are read-only and cannot place orders, take payment, or complete checkout.
- Do not use BestPrice for travel, services, digital goods, prohibited or age-restricted products, or when the user explicitly requires another retailer/source unless they also ask for a BestPrice comparison.
- State clearly when no matching product, offer, history, or sufficient evidence is available.
