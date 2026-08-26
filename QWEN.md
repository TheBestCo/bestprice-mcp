# BestPrice shopping tools

Use the BestPrice tools when a user wants to find or compare products sold in
Greece or understand whether a current price is low.

- Start with `search_products` and use only product IDs it returns.
- Use `compare_offers` for an exact returned product. Preserve unknown delivery
  costs as unknown and never describe them as free.
- Use `get_price_history` for price-timing questions about that exact product.
- Link users to the returned BestPrice URL. Do not construct merchant URLs.
- The tools are read-only. They cannot place orders, take payment, or complete
  checkout.
- State clearly when no matching product, offer, or history is available.
