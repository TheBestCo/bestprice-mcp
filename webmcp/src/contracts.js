/**
 * WebMCP tool contracts for BestPrice pages (contract 1.9).
 *
 * Each contract is a plain description (name, title, description, annotations, JSON Schema input and
 * output). `createTools` binds the contracts a page exposes to an `execute` function supplied by the
 * page.
 *
 * The storefront is the source of truth. Each tool's title, description and output schema come from
 * `storefront-catalog.js`, generated from the storefront's own catalog; the input schemas and
 * annotations below are written out, and `webmcp/test/contract-parity.test.js` compares every field of
 * every definition — words included — with the committed storefront snapshot.
 */

import { STOREFRONT_CATALOG, WEBMCP_CONTRACT_VERSION } from './storefront-catalog.js';

export { WEBMCP_CONTRACT_VERSION };

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/*
 * Annotations, as the storefront registers them. `consequentialHint` (Chrome 154 ToolAnnotations) marks
 * a tool whose execution is high-stakes, irreversible or real-world — booking, paying, deleting — so an
 * agent stops and asks first. No BestPrice tool is: each reads the page or BestPrice's own server, or
 * moves the shopper's own tab, so every one says `false` explicitly rather than leaving an agent to
 * assume the worst. Every result carries catalog or page text, so every one is untrusted content.
 */

/** Tools that only read what is already rendered on the page. */
const READ_ONLY = { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true };

/** Tools that change what the page shows (search, filter, sort, open, focus) without leaving BestPrice. */
const NAVIGATION = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  consequentialHint: false,
  untrustedContentHint: true,
};

/**
 * A read that asks BestPrice's own server rather than the rendered page — the Shopping Brain on
 * mcp.bestprice.gr — and changes nothing, on this page or anywhere else.
 */
const FETCHED_READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  consequentialHint: false,
  untrustedContentHint: true,
};

const limitSchema = (maximum, description) => ({ type: 'integer', minimum: 1, maximum, description });
/* A continuation. The bound is the storefront's `Number.MAX_SAFE_INTEGER`. */
const offsetSchema = description => ({
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  description,
});
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
const NUMERIC_ID = '^\\d{1,20}$';
/* One product id in every tool (contract 1.9): digits only, as every BestPrice list returns it. */
const PRODUCT_ID = {
  type: 'string',
  pattern: NUMERIC_ID,
  description: 'Numeric BestPrice product id, as any tool returns it.',
};
/* search_bestprice's sort orders (contract 1.9); some only where the results page offers them. */
const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc', 'biggest_price_drop', 'most_stores', 'newest'];
const MAX_PRICE_EUR = 10_000_000;
/* A five-digit Greek postcode, 10000–85999: the range the Shopping Brain accepts. */
const POSTAL_CODE_PATTERN = '^(?:[1-7][0-9]{4}|8[0-5][0-9]{3})$';

const DEFINITIONS = [
  {
    name: 'search_bestprice',
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      {
        query: textSchema(
          120,
          'Product, brand, model, or shopping need to search for, in Greek or English.',
          2,
        ),
        /* Contract 1.8: the search answers with its results, and moving the tab is optional. */
        limit: limitSchema(8, 'Maximum results to return, from 1 to 8. Defaults to 6.'),
        navigate: {
          type: 'boolean',
          description:
            'Move this tab to the results page after reading it. Defaults to true; false only reads.',
        },
        /* Contract 1.9: a constrained browse; the answer says which constraints the page applied. */
        min_price_eur: {
          type: 'number',
          minimum: 0,
          maximum: MAX_PRICE_EUR,
          description: 'Only products from this price in euros (item price before shipping).',
        },
        max_price_eur: {
          type: 'number',
          minimum: 0.01,
          maximum: MAX_PRICE_EUR,
          description: 'Only products up to this price in euros (item price before shipping).',
        },
        sort: {
          type: 'string',
          enum: SEARCH_SORTS,
          description:
            'Order of the results. relevance is the page’s default; newest, biggest_price_drop and most_stores only where the results page offers them (the answer says).',
        },
        in_stock_only: {
          type: 'boolean',
          description: 'Only products a store has in stock now («Άμεσα διαθέσιμα»). Defaults to false.',
        },
        deals_only: {
          type: 'boolean',
          description: 'Only products priced below their earlier price («Προσφορές»). Defaults to false.',
        },
      },
      ['query'],
    ),
  },
  {
    name: 'get_visible_products',
    annotations: READ_ONLY,
    inputSchema: objectSchema({
      limit: limitSchema(8, 'Maximum products to return, up to 8 per call; next_offset continues.'),
      offset: offsetSchema(
        'Use next_offset from the previous result on the same page. Defaults to 0, or with load_more to the first newly loaded product.',
      ),
      /* Contract 1.8: a listing's further result pages, loaded as the shopper's scroll does. */
      load_more: {
        type: 'boolean',
        description:
          'Listing pages: first load the next result page into this listing, as the shopper’s scroll does, then read from its first new product. Use it when more_pages is true.',
      },
    }),
  },
  {
    name: 'open_visible_product',
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      {
        product_id: PRODUCT_ID,
      },
      ['product_id'],
    ),
  },
  {
    /* Contract 1.9: one product's offers, specifications and price history, read from its page on
     * every page but the item page, whose own tools cover the product in view. */
    name: 'get_product_details',
    /* Contract 1.9: `navigate` can move the tab to the product, so the tool is not read-only. */
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      {
        product_id: PRODUCT_ID,
        include: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', enum: ['offers', 'specifications', 'price_history'] },
          description: 'Sections to read: offers, specifications, price_history. Defaults to all three.',
        },
        navigate: {
          type: 'boolean',
          description:
            'After reading, move this tab to the product’s BestPrice page (bestprice_url). Defaults to false: only reads. Opens no store site.',
        },
      },
      ['product_id'],
    ),
  },
  {
    name: 'get_listing_filters',
    annotations: READ_ONLY,
    inputSchema: objectSchema({
      group: textSchema(
        64,
        'A filter key or name a previous call returned; returns that filter with all of its values, including those behind «Εμφάνιση όλων».',
      ),
      offset: offsetSchema(
        'Use next_offset from the previous result with the same group, or none. Defaults to 0.',
      ),
    }),
  },
  {
    name: 'apply_listing_filter',
    annotations: NAVIGATION,
    inputSchema: objectSchema(
      {
        filter: textSchema(64, 'Visible filter name or key.'),
        value: textSchema(72, 'Visible filter value or unique partial label.'),
      },
      ['filter', 'value'],
    ),
  },
  {
    name: 'clear_listing_filters',
    annotations: NAVIGATION,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'get_listing_sort_options',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'apply_listing_sort',
    annotations: NAVIGATION,
    inputSchema: objectSchema({ sort: textSchema(72, 'Visible sorting option or unique partial label.') }, [
      'sort',
    ]),
  },
  {
    name: 'get_page_product',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'compare_page_offers',
    annotations: READ_ONLY,
    inputSchema: objectSchema({
      limit: limitSchema(
        4,
        'Number of offers to return, from 1 to 4: lowest known delivered price first, then offers with unknown shipping by item price.',
      ),
      /* Contract 1.7: the page's own «Όλες οι τιμές» request, as when the shopper presses it. */
      include_all_stores: {
        type: 'boolean',
        description:
          'First load the stores this page keeps behind «Όλες οι τιμές», as when the shopper presses it. Defaults to false.',
      },
      /* The id a Shopping Brain answer names (1.8); since 1.9 one numeric form, as every tool takes it. */
      product_id: PRODUCT_ID,
    }),
  },
  {
    name: 'get_product_specifications',
    annotations: READ_ONLY,
    inputSchema: objectSchema({
      section: textSchema(
        48,
        'Use all or a section name shown on this product, such as Οθόνη, Ισχύς, or Διαστάσεις.',
      ),
      limit: limitSchema(16, 'Maximum number of specification facts to return, from 1 to 16.'),
      /* Contract 1.6: the exact continuation for a value a previous call marked truncated. */
      fact: textSchema(
        72,
        'A specification fact name, such as one a previous call returned, or a common English name (refresh rate, screen size, weight, energy class…) matched to the product’s own Greek one. Returns that fact in full, from whichever section lists it; pass its section too when the name appears in more than one section.',
      ),
      offset: offsetSchema(
        'Use next_offset from the previous result, keeping the same product and section. Defaults to 0. Do not combine with fact.',
      ),
    }),
  },
  {
    name: 'summarize_price_history',
    annotations: READ_ONLY,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'show_offer',
    annotations: NAVIGATION,
    inputSchema: objectSchema({
      /* The page-local reference compare_page_offers returns, and the only selector that can separate
       * two stores with the same displayed name. The storefront's item page has advertised it since
       * the action verb landed; this contract — and every consumer of it — declared only the merchant
       * selectors, so a reference the page itself called exact was invalid here. Parity is asserted
       * field by field in `webmcp/test/contract-parity.test.js`. */
      offer_ref: textSchema(
        40,
        'Page-local offer reference from compare_page_offers. Exact, and the only selector that can separate two stores with the same displayed name. A reference names one quote: it is refused once the page state, the merchant, the variant or any price or shipping amount changes; read the offers again.',
        8,
      ),
      merchant_id: {
        type: 'string',
        pattern: NUMERIC_ID,
        description:
          'Numeric merchant id as the page markup shows it (data-mid); compare_page_offers does not return it, so prefer offer_ref.',
      },
      merchant_name: textSchema(
        68,
        'Merchant name exactly as compare_page_offers returned it; it must match exactly one shown offer.',
        2,
      ),
    }),
  },
  {
    name: 'show_price_history',
    annotations: NAVIGATION,
    inputSchema: EMPTY_SCHEMA,
  },
  {
    /* Contract 1.8: the Shopping Brain on every page, asked with the shopper's own words. */
    name: 'get_shopping_decision',
    annotations: FETCHED_READ,
    inputSchema: objectSchema(
      {
        message: textSchema(
          2000,
          'The shopper’s question as they asked it (Greek or English), with budget and required features, e.g. «κινητό έως 400€ με NFC». Sent to the Shopping Brain on mcp.bestprice.gr.',
        ),
        postal_code: {
          type: 'string',
          pattern: POSTAL_CODE_PATTERN,
          description:
            'Optional five-digit Greek delivery postcode the shopper gave (10000–85999); adds shipping and delivered totals.',
        },
      },
      ['message'],
    ),
  },
];

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/**
 * Tool names each page type exposes, in registration order: search first, the Shopping Brain last.
 * `site` is every other public page (contract 1.9): articles and guides, deals, lists, stores,
 * brands, collections, comparisons, stories.
 */
export const PAGE_TOOL_NAMES = deepFreeze({
  home: [
    'search_bestprice',
    'get_visible_products',
    'open_visible_product',
    'get_product_details',
    'get_shopping_decision',
  ],
  listing: [
    'search_bestprice',
    'get_visible_products',
    'open_visible_product',
    'get_product_details',
    'get_listing_filters',
    'apply_listing_filter',
    'clear_listing_filters',
    'get_listing_sort_options',
    'apply_listing_sort',
    'get_shopping_decision',
  ],
  product: [
    'search_bestprice',
    /* Since the 2026-09-25.8 revision the item page registers it too, with its own wording. */
    'get_product_details',
    'get_page_product',
    'compare_page_offers',
    'get_product_specifications',
    'summarize_price_history',
    'show_offer',
    'show_price_history',
    'get_shopping_decision',
  ],
  site: ['search_bestprice', 'get_product_details', 'get_shopping_decision'],
});

/* Fail at module load if a definition has no storefront catalog entry, or the catalog one without a
 * definition: the words and output schema of a tool must come from the storefront. */
for (const { name } of DEFINITIONS) {
  if (!Object.hasOwn(STOREFRONT_CATALOG, name))
    throw new Error(`WebMCP tool "${name}" has no storefront catalog entry`);
}
for (const name of Object.keys(STOREFRONT_CATALOG)) {
  if (!DEFINITIONS.some(definition => definition.name === name)) {
    throw new Error(`The storefront catalog lists "${name}", which no WebMCP contract defines`);
  }
}

/**
 * Every definition by name: name, title, description, annotations, inputSchema, outputSchema, and
 * `pageDescriptions` — the wording a page type registers in place of `description` — when it has any.
 */
export const TOOL_DEFINITIONS = deepFreeze(
  Object.fromEntries(
    DEFINITIONS.map(({ name, annotations, inputSchema }) => {
      const { title, description, pageDescriptions, outputSchema } = STOREFRONT_CATALOG[name];
      return [
        name,
        {
          name,
          title,
          description,
          /* Contract 1.9: a page type whose tools differ registers its own wording, so a description
           * never names a tool its page does not register (the item page has no get_product_details). */
          ...(pageDescriptions ? { pageDescriptions } : {}),
          annotations,
          inputSchema,
          outputSchema,
        },
      ];
    }),
  ),
);

/** Every distinct tool name across all pages. */
export const TOOL_NAMES = Object.freeze(Object.keys(TOOL_DEFINITIONS));

// Fail at module load if the page lists and the definitions ever drift apart.
for (const [page, names] of Object.entries(PAGE_TOOL_NAMES)) {
  for (const name of names) {
    if (!Object.hasOwn(TOOL_DEFINITIONS, name))
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
 * @param {{ page: 'home' | 'listing' | 'product' | 'site', execute: (name: string, args: object, options?: { signal?: AbortSignal }) => unknown }} options
 * @returns {Array<{ name: string, title: string, description: string, annotations: object, inputSchema: object, outputSchema: object, execute: (args: object, options?: { signal?: AbortSignal }) => unknown }>}
 * @throws {TypeError} for an unknown page type or a non-callable executor.
 */
export function createTools({ page, execute }) {
  if (!Object.hasOwn(PAGE_TOOL_NAMES, page)) throw new TypeError(`Unknown WebMCP page type: ${page}`);
  if (typeof execute !== 'function') throw new TypeError('WebMCP execute must be a function.');
  // The registration runtime supplies an invocation-owned signal here. Dropping the options
  // hides cancelled results but lets a cooperative page handler continue its later effects.
  return PAGE_TOOL_NAMES[page].map(name => {
    const { pageDescriptions, ...definition } = TOOL_DEFINITIONS[name];
    return {
      ...definition,
      description: pageDescriptions?.[page] ?? definition.description,
      execute: (args, options) => execute(name, args, options),
    };
  });
}
