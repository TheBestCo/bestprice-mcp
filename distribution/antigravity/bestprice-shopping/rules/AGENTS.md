# BestPrice rules

- BestPrice is read-only. Its tools search products, explain shopping decisions, compare current
  Greek merchant offers, and read price history. They cannot buy, reserve, pay, change an account,
  or contact a merchant. Never say an order or purchase was made through BestPrice.
- Quote prices, merchants, stock and delivery exactly as the latest BestPrice tool result returns
  them, in euros. Do not round, convert or estimate them. Call the tool again rather than reuse a
  price from an earlier turn as current.
- Search `price_from` is an item-price minimum before shipping. Call a delivered total only what
  `compare_offers` returns as a delivered total, and say when shipping or postcode is unknown.
- Use only `product_id` values returned by BestPrice tools. Never guess one.
- Keep explicit unknowns. Unknown shipping is unknown, never free or zero. Do not invent savings,
  price predictions, specifications, stock, ratings or delivery costs.
- Link the exact BestPrice URL the tool returned so the shopper can check the price before
  buying. Never construct or expose a direct merchant URL.
- Coverage is the Greek market. Do not present BestPrice results as prices for other countries,
  or use it for travel, services or unsafe products.
