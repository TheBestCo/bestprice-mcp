/**
 * Dataset 15.0.0 — 14.0.0 graded against WebMCP contract 2.2 (bestprice.gr 8d040a161a).
 *
 * Contract 2.2 changes one tool's inputs: `open_search_results` takes exactly one, `results_url` — the
 * address a `search_bestprice` result returned, which carries its constraints — as `open_product` takes
 * the `product_id` a search returned. It no longer takes a query or constraints, so it cannot open results
 * nothing searched for. Its receipt drops `query`, `applied` and `not_applied` (no case required them).
 *
 * The two chains that open search results (multi-001, multi-002) therefore search first: their
 * `open_search_results` step is preceded by `search_bestprice`, whose `results_url` it opens. The search
 * was already an admitted extra read; here it is part of the chain, so skipping it — opening a results
 * page nothing returned — fails. The criteria say so. `allowed_args` are regenerated from the published 2.2
 * input schemas (open_search_results: `results_url` only). The reworded descriptions (search_bestprice's
 * query: a product name, brand, model or category; get_shopping_decision's message: a described need or
 * budget) change no grading. Prompts, groups, pages, starting URLs, sequence modes and every other case are
 * 14.0.0's. 14.0.0 is not rewritten; it stays frozen with its runs as the history of contract 2.1.
 *
 * 15.0.0 is frozen in turn: contracts 2.3 to 2.6 (bestprice.gr 7210e5e554 … 762f0a4bc7) add the product
 * page's shopper actions and the reads of the shopping list and comparisons, and give the Shopping Brain
 * structured inputs — which dataset 16.0.0 grades (dataset-v16.js). So the argument rules 15.0.0 was
 * generated with (release 2.2.0) are recorded below rather than read from the live contract.
 *
 *   node webmcp/evals/dataset-v15.js   # rewrites natural-language-cases.v15.json from v14
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V14_PATH } from './dataset-v14.js';

export const DATASET_V15_VERSION = '15.0.0';
/* The contract this dataset grades, and the storefront release of it. */
export const DATASET_V15_CONTRACT = '2.2';
export const DATASET_V15_SOURCE = '8d040a161a';
export const V15_PATH = fileURLToPath(new URL('./natural-language-cases.v15.json', import.meta.url));

/* The tools that are admitted extra reads only while they read: the argument that makes each an action. */
export const READ_ONLY_UNLESS = Object.freeze({ summarize_price_history: 'show_chart' });

const REWORDED = Object.freeze({
  'multi-001': {
    deterministic_criteria:
      'PASS when the agent searches, opens the results_url the search returned, reads the results, opens the first, and the final answer matches get_page_product for the opened id.',
  },
  'multi-002': {
    deterministic_criteria:
      'PASS when the agent searches, opens the results_url the search returned, filters to the visible Apple value, applies the visible cheapest sort, and reports the re-read products ascending by price.',
  },
});

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/* Contract 2.2's tools; load_more_products takes no argument and no case admits it, so it has no rule. */
export const CONTRACT_2_2_TOOL_COUNT = 15;
/* The argument rules of contract 2.2 (bestprice.gr 8d040a161a, release 2.2.0), as `argumentRules`
 * generated them from webmcp/src/contracts.js at cc2528e; show_chart as generated, before an extra
 * read's restriction. */
export const CONTRACT_2_2_ARGUMENT_RULES = deepFreeze({
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
    results_url: {
      type: 'string',
      minLength: 1,
      maxLength: 2048,
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
  const generated = structuredClone(CONTRACT_2_2_ARGUMENT_RULES[tool]);
  const flag = READ_ONLY_UNLESS[tool];
  if (flag && !expectedTools.includes(tool) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

/** The chain, with every results page it opens searched for first (its results_url comes from there). */
export const chainOf = item =>
  item.expected_tools.flatMap((tool, index) =>
    tool === 'open_search_results' && item.expected_tools[index - 1] !== 'search_bestprice'
      ? ['search_bestprice', tool]
      : [tool],
  );

export function deriveDatasetV15(v14 = JSON.parse(readFileSync(V14_PATH, 'utf8'))) {
  const cases = v14.cases.map(item => {
    const expected = chainOf(item);
    const tools = [...new Set([...expected, ...item.extra_calls_allowed])].sort();
    return {
      ...item,
      expected_tools: expected,
      ...REWORDED[item.id],
      allowed_args: Object.fromEntries(tools.map(tool => [tool, caseArgumentRules(tool, expected)])),
      runs: [],
    };
  });
  return {
    ...v14,
    datasetVersion: DATASET_V15_VERSION,
    generatedAt: '2026-09-25T19:45:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${CONTRACT_2_2_TOOL_COUNT} contextual tools, contract ${DATASET_V15_CONTRACT}, bestprice.gr ${DATASET_V15_SOURCE})`,
    derivedFrom:
      'natural-language-cases.v14.json + webmcp/src/contracts.js (WebMCP contract 2.2), by webmcp/evals/dataset-v15.js — open_search_results opens the results_url a search returned, so multi-001 and multi-002 search first; argument rules regenerated',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V15_PATH, serializeDataset(deriveDatasetV15()));
}
