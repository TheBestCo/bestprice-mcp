/**
 * Dataset 9.0.0 — 8.0.0 graded against WebMCP contract 1.8 (owner's decision, 2026-09-25).
 *
 * Contract 1.8 publishes an output schema for every tool, and `search_bestprice` answers with its
 * results in a closed schema that has no `action` field. Four 8.0.0 cases required `action` from
 * `search_bestprice`, so they failed a 1.8 search that did what the shopper asked:
 *
 *   home-001, home-002, home-005, listing-012   require `query`, `results_url`, `results_kind`,
 *                                               `products` and `navigated` from `search_bestprice`
 *                                               instead: the structured result 1.8 returns.
 *
 * Every case also grades the arguments and admitted reads of the contract it is run against:
 *
 * - `allowed_args` are generated from the published 1.8 input schemas for the same tools, so
 *   `search_bestprice.limit`/`navigate`, `get_visible_products.load_more` and
 *   `compare_page_offers.product_id` are accepted with their bounds;
 * - `extra_calls_allowed` gains the one read-only tool 1.8 added, `get_shopping_decision` (the owner's
 *   rule of 2026-09-15: extra read-only calls are fine); the extras earlier versions admitted per case
 *   (home-005's) are kept.
 *
 * Prompts, chains, criteria and every other required property are 8.0.0's. 8.0.0 is not rewritten; it
 * and the datasets before it stay frozen with their runs as the history of contracts 1.6 and 1.7.
 *
 * 9.0.0 is frozen in turn: contract 1.9 (2026-09-25) added `get_product_details` and the site-wide
 * page type, and grading them is dataset 10.0.0 (dataset-v10.js). So the 1.8 argument rules and the
 * read 1.8 added are recorded below rather than read from the live contract, as 3.0.0 records 1.6's,
 * and `webmcp/test/dataset-v9.test.js` checks the committed file against this recorded derivation.
 *
 *   node webmcp/evals/dataset-v9.js   # rewrites natural-language-cases.v9.json from v8
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V8_PATH } from './dataset-v8.js';

export const DATASET_V9_VERSION = '9.0.0';
/* The contract this dataset grades. A later contract is graded by a later dataset. */
export const DATASET_V9_CONTRACT = '1.8';
export const V9_PATH = fileURLToPath(new URL('./natural-language-cases.v9.json', import.meta.url));

/* What a 1.8 search returns in place of `action`: what it searched, where, what it found, and
 * whether the tab moved. */
export const SEARCH_RESULT_PROPERTIES = Object.freeze([
  'query',
  'results_url',
  'results_kind',
  'products',
  'navigated',
]);
export const SEARCH_RESULT_CASES = Object.freeze(['home-001', 'home-002', 'home-005', 'listing-012']);

/* The argument rules of contract 1.8 for every tool it published, as `argumentRules` generated them
 * from webmcp/src/contracts.js at 289c109 (release 1.3.0). */
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
export const CONTRACT_1_8_ARGUMENT_RULES = deepFreeze({
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
  clear_listing_filters: {},
  compare_page_offers: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 4,
    },
    include_all_stores: {
      type: 'boolean',
    },
    product_id: {
      type: 'string',
      pattern: '^(?:bp_)?(\\d{1,20})$',
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
  get_listing_sort_options: {},
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
    load_more: {
      type: 'boolean',
    },
  },
  open_visible_product: {
    product_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
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
    navigate: {
      type: 'boolean',
    },
  },
  show_offer: {
    offer_ref: {
      type: 'string',
      minLength: 8,
      maxLength: 40,
    },
    merchant_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
    },
    merchant_name: {
      type: 'string',
      minLength: 2,
      maxLength: 68,
    },
  },
  show_price_history: {},
  summarize_price_history: {},
});

/* The read-only tool contract 1.8 added to 1.6's, admitted as an extra read in every case. */
export const CONTRACT_1_8_ADDED_READS = Object.freeze(['get_shopping_decision']);

export function deriveDatasetV9(v8 = JSON.parse(readFileSync(V8_PATH, 'utf8'))) {
  const cases = v8.cases.map(item => {
    const extras = [...new Set([...(item.extra_calls_allowed ?? []), ...CONTRACT_1_8_ADDED_READS])].sort();
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    const required = SEARCH_RESULT_CASES.includes(item.id)
      ? { ...item.required_result_properties, search_bestprice: [...SEARCH_RESULT_PROPERTIES] }
      : item.required_result_properties;
    return {
      ...item,
      allowed_args: Object.fromEntries(
        tools.map(tool => [tool, structuredClone(CONTRACT_1_8_ARGUMENT_RULES[tool])]),
      ),
      required_result_properties: required,
      extra_calls_allowed: extras,
      runs: [],
    };
  });
  return {
    ...v8,
    datasetVersion: DATASET_V9_VERSION,
    generatedAt: '2026-09-25T15:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(CONTRACT_1_8_ARGUMENT_RULES).length} contextual tools, contract ${DATASET_V9_CONTRACT})`,
    derivedFrom:
      'natural-language-cases.v8.json + webmcp/src/contracts.js (WebMCP contract 1.8), by webmcp/evals/dataset-v9.js — argument rules and admitted reads regenerated from contract 1.8, and four search cases grade its structured result',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V9_PATH, serializeDataset(deriveDatasetV9()));
}
