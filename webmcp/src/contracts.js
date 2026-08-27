const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };
const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true };
const NAVIGATION = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  untrustedContentHint: true,
};

const definitions = [
  ['search_bestprice', 'Search BestPrice products', 'Start a product search in this browser tab.', NAVIGATION, {
    type: 'object',
    properties: { query: { type: 'string', minLength: 2, maxLength: 120, description: 'Product or shopping need.' } },
    required: ['query'],
    additionalProperties: false,
  }],
  ['get_visible_products', 'Products on this page', 'Return up to eight products currently rendered on this listing.', READ_ONLY, {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 8, description: 'Maximum products to return.' } },
    additionalProperties: false,
  }],
  ['open_visible_product', 'Open a visible product', 'Open a visible product using an ID returned by get_visible_products.', NAVIGATION, {
    type: 'object',
    properties: { product_id: { type: 'string', pattern: '^\\d{1,20}$', description: 'Visible numeric product ID.' } },
    required: ['product_id'],
    additionalProperties: false,
  }],
  ['get_listing_filters', 'Available filters', 'Return selected and available filters currently rendered on this listing.', READ_ONLY, EMPTY_SCHEMA],
  ['apply_listing_filter', 'Apply a filter', 'Apply a currently visible filter value.', NAVIGATION, {
    type: 'object',
    properties: {
      filter: { type: 'string', minLength: 1, maxLength: 64, description: 'Visible filter name.' },
      value: { type: 'string', minLength: 1, maxLength: 72, description: 'Visible filter value.' },
    },
    required: ['filter', 'value'],
    additionalProperties: false,
  }],
  ['clear_listing_filters', 'Clear filters', 'Clear the filters currently applied to this listing.', NAVIGATION, EMPTY_SCHEMA],
  ['get_listing_sort_options', 'Available sorting options', 'Return sorting choices currently rendered on this listing.', READ_ONLY, EMPTY_SCHEMA],
  ['apply_listing_sort', 'Sort this product listing', 'Apply a currently visible sorting option.', NAVIGATION, {
    type: 'object',
    properties: { sort: { type: 'string', minLength: 1, maxLength: 72, description: 'Visible sorting option.' } },
    required: ['sort'],
    additionalProperties: false,
  }],
  ['get_page_product', 'Product details on this page', 'Return the product facts currently rendered on this item page.', READ_ONLY, EMPTY_SCHEMA],
  ['compare_page_offers', 'Compare offers on this page', 'Compare up to four visible offers by delivered price.', READ_ONLY, {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 4, description: 'Offers to return.' } },
    additionalProperties: false,
  }],
  ['get_product_specifications', 'Product specifications', 'Return structured specifications for the product on this page.', READ_ONLY, {
    type: 'object',
    properties: {
      section: { type: 'string', minLength: 1, maxLength: 48, description: 'Visible section name or all.' },
      limit: { type: 'integer', minimum: 1, maximum: 16, description: 'Facts to return.' },
    },
    additionalProperties: false,
  }],
  ['summarize_price_history', 'Price history summary', 'Summarize the visible product price history.', READ_ONLY, EMPTY_SCHEMA],
  ['show_price_history', 'Show this product price history', 'Open or focus the price-history chart on this page.', NAVIGATION, EMPTY_SCHEMA],
];

export const PAGE_TOOL_NAMES = Object.freeze({
  home: ['search_bestprice'],
  listing: definitions.slice(0, 8).map(([name]) => name),
  product: ['search_bestprice', ...definitions.slice(8).map(([name]) => name)],
});

const allDefinitions = new Map(definitions.map(definition => [definition[0], definition]));

export function createTools({ page, execute }) {
  const names = PAGE_TOOL_NAMES[page];
  if (!names) throw new TypeError(`Unknown WebMCP page type: ${page}`);
  return names.map(name => {
    const [, title, description, annotations, inputSchema] = allDefinitions.get(name);
    return {
      name,
      title,
      description,
      inputSchema,
      annotations,
      execute: args => execute(name, typeof args === 'undefined' ? {} : args),
    };
  });
}
