/**
 * WebMCP tool contracts for BestPrice pages.
 *
 * Each contract is a plain description (name, title, description, annotations, JSON Schema input).
 * `createTools` binds the contracts a page exposes to an `execute` function supplied by the page.
 */

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Tools that only read what is already rendered on the page. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  untrustedContentHint: true,
};

/** Tools that change what the page shows (search, filter, sort, open) without leaving BestPrice. */
const NAVIGATION = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  untrustedContentHint: true,
};

const limitSchema = (maximum, description) => ({ type: 'integer', minimum: 1, maximum, description });
const textSchema = (maxLength, description, minLength = 1) => ({
  type: 'string',
  minLength,
  maxLength,
  description,
});
const objectSchema = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const DEFINITIONS = [
  {
    name: 'search_bestprice',
    title: 'Search BestPrice products',
    description: 'Start a product search in this browser tab.',
    annotations: NAVIGATION,
    inputSchema: objectSchema({ query: textSchema(120, 'Product or shopping need.', 2) }, ['query']),
  },
  {
    name: 'get_visible_products',
    title: 'Products on this page',
    description: 'Return up to eight products currently rendered on this listing.',
    annotations: READ_ONLY,
    inputSchema: objectSchema({ limit: limitSchema(8, 'Maximum products to return.') }),
  },
  {
    name: 'open_visible_product',
    title: 'Open a visible product',
    description: 'Open a visible product using an ID returned by get_visible_products.',
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      { product_id: { type: 'string', pattern: '^\\d{1,20}$', description: 'Visible numeric product ID.' } },
      ['product_id'],
    ),
  },
  {
    name: 'get_listing_filters',
    title: 'Available filters',
    description: 'Return selected and available filters currently rendered on this listing.',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'apply_listing_filter',
    title: 'Apply a filter',
    description: 'Apply a currently visible filter value.',
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      { filter: textSchema(64, 'Visible filter name.'), value: textSchema(72, 'Visible filter value.') },
      ['filter', 'value'],
    ),
  },
  {
    name: 'clear_listing_filters',
    title: 'Clear filters',
    description: 'Clear the filters currently applied to this listing.',
    annotations: NAVIGATION,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'get_listing_sort_options',
    title: 'Available sorting options',
    description: 'Return sorting choices currently rendered on this listing.',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'apply_listing_sort',
    title: 'Sort this product listing',
    description: 'Apply a currently visible sorting option.',
    annotations: NAVIGATION,
    inputSchema: objectSchema({ sort: textSchema(72, 'Visible sorting option.') }, ['sort']),
  },
  {
    name: 'get_page_product',
    title: 'Product details on this page',
    description: 'Return the product facts currently rendered on this item page.',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'compare_page_offers',
    title: 'Compare offers on this page',
    description: 'Compare up to four visible offers by delivered price.',
    annotations: READ_ONLY,
    inputSchema: objectSchema({ limit: limitSchema(4, 'Offers to return.') }),
  },
  {
    name: 'get_product_specifications',
    title: 'Product specifications',
    description: 'Return structured specifications for the product on this page.',
    annotations: READ_ONLY,
    inputSchema: objectSchema({
      section: textSchema(48, 'Visible section name or all.'),
      limit: limitSchema(16, 'Facts to return.'),
    }),
  },
  {
    name: 'summarize_price_history',
    title: 'Price history summary',
    description: 'Summarize the visible product price history.',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'show_price_history',
    title: 'Show this product price history',
    description: 'Open or focus the price-history chart on this page.',
    annotations: NAVIGATION,
    inputSchema: EMPTY_SCHEMA,
  },
];

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/** Tool names each page type exposes, in registration order. */
export const PAGE_TOOL_NAMES = deepFreeze({
  home: ['search_bestprice'],
  listing: [
    'search_bestprice',
    'get_visible_products',
    'open_visible_product',
    'get_listing_filters',
    'apply_listing_filter',
    'clear_listing_filters',
    'get_listing_sort_options',
    'apply_listing_sort',
  ],
  product: [
    'search_bestprice',
    'get_page_product',
    'compare_page_offers',
    'get_product_specifications',
    'summarize_price_history',
    'show_price_history',
  ],
});

const DEFINITIONS_BY_NAME = new Map(DEFINITIONS.map(definition => [definition.name, deepFreeze(definition)]));

/** Every distinct tool name across all pages. */
export const TOOL_NAMES = Object.freeze([...DEFINITIONS_BY_NAME.keys()]);

// Fail at module load if the page lists and the definitions ever drift apart.
for (const [page, names] of Object.entries(PAGE_TOOL_NAMES)) {
  for (const name of names) {
    if (!DEFINITIONS_BY_NAME.has(name))
      throw new Error(`Page "${page}" lists an undefined WebMCP tool: ${name}`);
  }
}
for (const name of TOOL_NAMES) {
  if (!Object.values(PAGE_TOOL_NAMES).some(names => names.includes(name))) {
    throw new Error(`WebMCP tool "${name}" is defined but exposed on no page`);
  }
}

/**
 * Builds the WebMCP tool objects for a page.
 *
 * @param {{ page: 'home' | 'listing' | 'product', execute: (name: string, args: object) => unknown }} options
 * @returns {Array<{ name: string, title: string, description: string, annotations: object, inputSchema: object, execute: (args: object) => unknown }>}
 * @throws {TypeError} for an unknown page type.
 */
export function createTools({ page, execute }) {
  const names = PAGE_TOOL_NAMES[page];
  if (!names) throw new TypeError(`Unknown WebMCP page type: ${page}`);
  return names.map(name => ({ ...DEFINITIONS_BY_NAME.get(name), execute: args => execute(name, args) }));
}
