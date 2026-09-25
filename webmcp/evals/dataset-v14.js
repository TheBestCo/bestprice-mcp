/**
 * Dataset 14.0.0 — 13.0.0 graded against WebMCP contract 2.1 (bestprice.gr 8e13c733ab; registration
 * revision 2026-09-25.14).
 *
 * Contract 2.1 splits every tool that both read and acted (15 tools):
 *
 * - `search_bestprice` only reads: `navigate` is gone and the tab never moves; its result has no
 *   `navigated`, `outcome` or `next_tools`. `open_search_results` (new, every page) moves the tab to the
 *   same search's results and answers with a receipt. A chain that searched and then used the listing
 *   the search moved to — its next expected tool is a listing tool — relied on 2.0's default
 *   `navigate: true`, so its search step becomes `open_search_results` (multi-001, multi-002). The four
 *   search cases that required `navigated` (home-001, home-002, home-005, listing-012) require the rest
 *   of the read: query, results_url, results_kind and products;
 * - `get_visible_products` only reads: `load_more` is gone, and `load_more_products` (new, listings) loads
 *   the next result page. No case expected loading more, so it is not in any chain, and as an action it is
 *   not an admitted extra read;
 * - the listing actions report one status field: `outcome` (with `unchanged`) replaces `action`,
 *   `applied`, `dispatched` and `changed`, so listing-006, listing-008 and listing-010 require `outcome`;
 * - `open_product` returns a receipt (outcome, product_id, title, bestprice_url): its facts are
 *   get_page_product's. neg-001's criteria, which asked the agent to report what the opened page shows,
 *   say where those facts come from now;
 * - `search_bestprice`, now read-only, joins every case's admitted extra reads, under the owner's rule of
 *   2026-09-15 (extra read-only calls are fine) — as get_product_details did in 10.0.0.
 *
 * `allowed_args` are regenerated from the published 2.1 input schemas; `show_chart` stays admitted
 * `false` only where summarize_price_history is an extra read. Prompts, groups, pages, starting URLs,
 * sequence modes and every other case are 13.0.0's. 13.0.0 is not rewritten; it stays frozen with its
 * runs as the history of contract 2.0.
 *
 * 14.0.0 is frozen in turn: contract 2.2 (bestprice.gr 8d040a161a) has open_search_results take the
 * results_url a search returned instead of the query and constraints — which dataset 15.0.0 grades
 * (dataset-v15.js). So the argument rules 14.0.0 was generated with (release 2.1.0) are recorded below
 * rather than read from the live contract.
 *
 *   node webmcp/evals/dataset-v14.js   # rewrites natural-language-cases.v14.json from v13
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V13_PATH } from './dataset-v13.js';

export const DATASET_V14_VERSION = '14.0.0';
/* The contract this dataset grades, and the storefront revision of it. */
export const DATASET_V14_CONTRACT = '2.1';
export const DATASET_V14_REVISION = '2026-09-25.14';
export const V14_PATH = fileURLToPath(new URL('./natural-language-cases.v14.json', import.meta.url));

/* The tools that are admitted extra reads only while they read: the argument that makes each an action. */
export const READ_ONLY_UNLESS = Object.freeze({ summarize_price_history: 'show_chart' });

/* The read 2.1 made read-only, admitted as an extra read in every case. */
export const CONTRACT_2_1_ADDED_READS = Object.freeze(['search_bestprice']);

/* The result properties 2.1 removed from a tool's success, which no case may require any more. */
export const CONTRACT_2_1_REMOVED_PROPERTIES = Object.freeze({
  search_bestprice: Object.freeze(['navigated', 'outcome', 'next_tools']),
  open_product: Object.freeze(['category', 'current_min_price_eur', 'offer_count', 'rating', 'rating_count']),
});
/* The listing actions report one status field since 2.1: `outcome` replaces `action` (and `applied`,
 * `dispatched`, `changed`), so a case that required `action` requires `outcome`. */
export const CONTRACT_2_1_RENAMED_PROPERTIES = Object.freeze(
  Object.fromEntries(
    ['apply_listing_filter', 'clear_listing_filters', 'apply_listing_sort'].map(tool => [
      tool,
      Object.freeze({ action: 'outcome' }),
    ]),
  ),
);

/* A listing's own tools (not search and the Shopping Brain): a search step followed by one of them used
 * the listing 2.0's search moved to. */
export const LISTING_TOOLS = Object.freeze([
  'get_visible_products',
  'load_more_products',
  'get_listing_filters',
  'apply_listing_filter',
  'clear_listing_filters',
  'apply_listing_sort',
]);

const REWORDED = Object.freeze({
  'neg-001': {
    deterministic_criteria:
      'PASS when open_product opens the product by the id the shopper gave (it reads the product page first and confirms its title) and the agent reports only what the tools returned — get_page_product there reads its price, stores and rating — without guessing a URL.',
  },
});

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/* The argument rules of contract 2.1 (bestprice.gr 8e13c733ab, release 2.1.0), as `argumentRules`
 * generated them from webmcp/src/contracts.js at ecbed2b; show_chart as generated, before an extra
 * read's restriction. */
/* Contract 2.1's tools; load_more_products takes no argument and no case admits it, so it has no rule. */
export const CONTRACT_2_1_TOOL_COUNT = 15;
export const CONTRACT_2_1_ARGUMENT_RULES = deepFreeze({
  apply_listing_filter: {
    filter: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    value: {
      type: 'string',
      minLength: 1,
      maxLength: 72,
    },
  },
  apply_listing_sort: {
    sort: {
      type: 'string',
      minLength: 1,
      maxLength: 72,
    },
  },
  clear_listing_filters: {
    filter: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    value: {
      type: 'string',
      minLength: 1,
      maxLength: 72,
    },
  },
  compare_page_offers: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 12,
    },
    offset: {
      type: 'integer',
      minimum: 0,
      maximum: 9007199254740991,
    },
    include_all_stores: {
      type: 'boolean',
    },
    product_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
    },
  },
  get_listing_filters: {
    group: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    offset: {
      type: 'integer',
      minimum: 0,
      maximum: 9007199254740991,
    },
  },
  get_page_product: {},
  get_product_specifications: {
    section: {
      type: 'string',
      minLength: 1,
      maxLength: 48,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 16,
    },
    fact: {
      type: 'string',
      minLength: 1,
      maxLength: 72,
    },
    offset: {
      type: 'integer',
      minimum: 0,
      maximum: 9007199254740991,
    },
  },
  get_shopping_decision: {
    message: {
      type: 'string',
      minLength: 1,
      maxLength: 2000,
    },
    postal_code: {
      type: 'string',
      pattern: '^(?:[1-7][0-9]{4}|8[0-5][0-9]{3})$',
    },
  },
  get_visible_products: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 8,
    },
    offset: {
      type: 'integer',
      minimum: 0,
      maximum: 9007199254740991,
    },
  },
  open_product: {
    product_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
    },
  },
  open_search_results: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: 120,
    },
    min_price_eur: {
      type: 'number',
      minimum: 0,
      maximum: 10000000,
    },
    max_price_eur: {
      type: 'number',
      minimum: 0.01,
      maximum: 10000000,
    },
    sort: {
      type: 'string',
      enum: ['relevance', 'price_asc', 'price_desc', 'biggest_price_drop', 'most_stores', 'newest'],
    },
    in_stock_only: {
      type: 'boolean',
    },
    deals_only: {
      type: 'boolean',
    },
  },
  search_bestprice: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: 120,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 8,
    },
    min_price_eur: {
      type: 'number',
      minimum: 0,
      maximum: 10000000,
    },
    max_price_eur: {
      type: 'number',
      minimum: 0.01,
      maximum: 10000000,
    },
    sort: {
      type: 'string',
      enum: ['relevance', 'price_asc', 'price_desc', 'biggest_price_drop', 'most_stores', 'newest'],
    },
    in_stock_only: {
      type: 'boolean',
    },
    deals_only: {
      type: 'boolean',
    },
  },
  show_offer: {
    offer_ref: {
      type: 'string',
      minLength: 8,
      maxLength: 40,
    },
    merchant_name: {
      type: 'string',
      minLength: 2,
      maxLength: 68,
    },
  },
  summarize_price_history: {
    show_chart: {
      type: 'boolean',
    },
  },
});

/** One tool's argument rules in one case: an admitted extra read may not use the argument that acts. */
export const caseArgumentRules = (tool, expectedTools) => {
  const generated = structuredClone(CONTRACT_2_1_ARGUMENT_RULES[tool]);
  const flag = READ_ONLY_UNLESS[tool];
  if (flag && !expectedTools.includes(tool) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

/** The chain, with a search that 2.0 used to move the tab to its listing shown in the tab instead. */
export const chainOf = item =>
  item.expected_tools.map((tool, index) =>
    tool === 'search_bestprice' &&
    item.sequence_mode === 'ordered' &&
    LISTING_TOOLS.includes(item.expected_tools[index + 1])
      ? 'open_search_results'
      : tool,
  );

const requiredOf = item =>
  Object.fromEntries(
    Object.entries(item.required_result_properties ?? {}).map(([tool, properties]) => [
      tool,
      properties
        .filter(property => !CONTRACT_2_1_REMOVED_PROPERTIES[tool]?.includes(property))
        .map(property => CONTRACT_2_1_RENAMED_PROPERTIES[tool]?.[property] ?? property),
    ]),
  );

export function deriveDatasetV14(v13 = JSON.parse(readFileSync(V13_PATH, 'utf8'))) {
  const cases = v13.cases.map(item => {
    const expected = chainOf(item);
    const extras = [...new Set([...item.extra_calls_allowed, ...CONTRACT_2_1_ADDED_READS])].sort();
    const tools = [...new Set([...expected, ...extras])].sort();
    return {
      ...item,
      expected_tools: expected,
      required_result_properties: requiredOf(item),
      ...REWORDED[item.id],
      allowed_args: Object.fromEntries(tools.map(tool => [tool, caseArgumentRules(tool, expected)])),
      runs: [],
      extra_calls_allowed: extras,
    };
  });
  return {
    ...v13,
    datasetVersion: DATASET_V14_VERSION,
    generatedAt: '2026-09-25T19:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${CONTRACT_2_1_TOOL_COUNT} contextual tools, contract ${DATASET_V14_CONTRACT}, storefront revision ${DATASET_V14_REVISION})`,
    derivedFrom:
      'natural-language-cases.v13.json + webmcp/src/contracts.js (WebMCP contract 2.1, revision 2026-09-25.14), by webmcp/evals/dataset-v14.js — a search the chain used as a listing becomes open_search_results (multi-001, multi-002), navigated and open_product facts no longer required, listing actions’ action required as outcome, search_bestprice admitted as an extra read, argument rules regenerated (no navigate, no load_more)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V14_PATH, serializeDataset(deriveDatasetV14()));
}
