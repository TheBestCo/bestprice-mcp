/**
 * WebMCP tool contracts for BestPrice pages (contract 1.9).
 *
 * Each contract is a plain description (name, title, description, annotations, JSON Schema input and
 * output). `createTools` binds the contracts a page exposes to an `execute` function supplied by the
 * page.
 *
 * The storefront is the source of truth. Each tool's title, description, page wording, input schema
 * and output schema come from `storefront-catalog.js`, generated from the storefront's own single
 * sources (its catalog, `input-schemas.js` since registration revision 2026-09-25.12, and
 * `output-schemas.js`); the annotations below are written out, since the storefront publishes them
 * only on the tools its pages register. `webmcp/test/contract-parity.test.js` compares every field of
 * every definition — words included — with the committed storefront snapshot, and the snapshot with
 * the storefront itself.
 */

import { STOREFRONT_CATALOG, WEBMCP_CONTRACT_VERSION } from './storefront-catalog.js';

export { WEBMCP_CONTRACT_VERSION };

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

/** A read that can load more into the page (get_visible_products' `load_more`): not idempotent. */
const LOADING = { ...NAVIGATION, idempotentHint: false };

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

/*
 * Every tool, in the storefront catalog's order, with its annotations. History the inputs carry:
 * show_offer's `offer_ref` was published after round 4 found this contract without it (the parity
 * test asserts it by name); contract 1.7 made every bounded read continuable (`offset`); contract 1.8
 * added get_shopping_decision and search_bestprice's `limit`/`navigate`; contract 1.9 added
 * get_product_details and the site page type, one digits-only product id, search constraints, and —
 * at revision 2026-09-25.12 — compare_page_offers' `offset` (and `limit` up to 12),
 * clear_listing_filters' `filter`/`value`, summarize_price_history's `show_chart`, sort keys, and a
 * show_offer that takes offer_ref or merchant_name (merchant_id is no longer published).
 */
const DEFINITIONS = [
  { name: 'search_bestprice', annotations: NAVIGATION },
  /* Not read-only since revision .12: `load_more` loads the listing's next result page into it. */
  { name: 'get_visible_products', annotations: LOADING },
  { name: 'open_visible_product', annotations: NAVIGATION },
  /* `navigate` can move the tab to the product, so the tool is not read-only. */
  { name: 'get_product_details', annotations: NAVIGATION },
  { name: 'get_listing_filters', annotations: READ_ONLY },
  { name: 'apply_listing_filter', annotations: NAVIGATION },
  { name: 'clear_listing_filters', annotations: NAVIGATION },
  { name: 'get_listing_sort_options', annotations: READ_ONLY },
  { name: 'apply_listing_sort', annotations: NAVIGATION },
  { name: 'get_page_product', annotations: READ_ONLY },
  { name: 'compare_page_offers', annotations: READ_ONLY },
  { name: 'get_product_specifications', annotations: READ_ONLY },
  /* Not read-only since revision .12: `show_chart` opens the chart for the shopper too. */
  { name: 'summarize_price_history', annotations: NAVIGATION },
  { name: 'show_offer', annotations: NAVIGATION },
  { name: 'show_price_history', annotations: NAVIGATION },
  /* Contract 1.8: the Shopping Brain on every page, asked with the shopper's own words. */
  { name: 'get_shopping_decision', annotations: FETCHED_READ },
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
    DEFINITIONS.map(({ name, annotations }) => {
      const { title, description, pageDescriptions, inputSchema, outputSchema } = STOREFRONT_CATALOG[name];
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
