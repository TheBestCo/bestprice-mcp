/**
 * Dataset 12.0.0 — 11.0.0 graded against WebMCP contract 1.9 as revised on 2026-09-25 (bestprice.gr
 * 116ed10e75, fd7b2bbb71, 6645a4e1c1; registration revision 2026-09-25.12). The contract version did
 * not change; what an agent may send did:
 *
 * - new optional arguments: `compare_page_offers.offset` (and `limit` up to 12),
 *   `clear_listing_filters.filter` and `.value`, `summarize_price_history.show_chart`. 11.0.0 refuses
 *   them as unexpected arguments or out of bounds, so an agent reading a product's fifth offer, or
 *   removing one filter the way the page now supports, failed its case;
 * - `show_offer.merchant_id` is no longer published (the page still takes it, unannounced): an agent
 *   may send offer_ref or merchant_name, as the page now asks;
 * - `get_visible_products` (`load_more`) and `summarize_price_history` (`show_chart`) change the page
 *   when asked, so they are no longer read-only. They stay admitted extra reads — as reads: where one
 *   is not an expected tool, the argument that makes it an action admits `false` alone, as 11.0.0 did
 *   for `get_product_details.navigate`. An extra call that loads more results or opens the chart is
 *   an extra action and fails, as any other extra action does.
 *
 * `apply_listing_sort.sort` now takes a key as well as a label; both are strings within the same
 * bounds, so its rule does not change. `allowed_args` are regenerated from the published input
 * schemas. Prompts, chains, criteria, required properties and admitted reads are 11.0.0's. 11.0.0 is
 * not rewritten; it stays frozen with its runs as the history of revisions .7 to .9.
 *
 * 12.0.0 is frozen in turn: contract 2.0 (bestprice.gr 2a849a63f1, 2026-09-25) removed four tools and
 * added open_product — which dataset 13.0.0 grades (dataset-v13.js). So the argument rules 12.0.0 was
 * generated with (release 1.5.0) are recorded below rather than read from the live contract.
 *
 *   node webmcp/evals/dataset-v12.js   # rewrites natural-language-cases.v12.json from v11
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V11_PATH } from './dataset-v11.js';

export const DATASET_V12_VERSION = '12.0.0';
/* The contract this dataset grades, and the storefront revision of it. */
export const DATASET_V12_CONTRACT = '1.9';
export const DATASET_V12_REVISION = '2026-09-25.12';
export const V12_PATH = fileURLToPath(new URL('./natural-language-cases.v12.json', import.meta.url));

/* The tools that are admitted extra reads only while they read: the argument that makes each an action. */
export const READ_ONLY_UNLESS = Object.freeze({
  get_product_details: 'navigate',
  get_visible_products: 'load_more',
  summarize_price_history: 'show_chart',
});

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/* The argument rules of contract 1.9 at registration revision 2026-09-25.12 (bestprice.gr 6645a4e1c1,
 * release 1.5.0), as `argumentRules` generated them from webmcp/src/contracts.js at 2c26397; each
 * acting argument as generated, before an extra read's restriction. */
export const CONTRACT_1_9_REV12_ARGUMENT_RULES = deepFreeze({
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
  get_listing_sort_options: {},
  get_page_product: {},
  get_product_details: {
    product_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
    },
    include: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'string',
        enum: ['offers', 'specifications', 'price_history'],
      },
    },
    navigate: {
      type: 'boolean',
    },
  },
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
  show_price_history: {},
  summarize_price_history: {
    show_chart: {
      type: 'boolean',
    },
  },
});

/** One tool's argument rules in one case: an admitted extra read may not use the argument that acts. */
export const caseArgumentRules = (tool, expectedTools, rules = CONTRACT_1_9_REV12_ARGUMENT_RULES) => {
  const generated = structuredClone(rules[tool]);
  const flag = READ_ONLY_UNLESS[tool];
  if (flag && !expectedTools.includes(tool) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

export function deriveDatasetV12(v11 = JSON.parse(readFileSync(V11_PATH, 'utf8'))) {
  const cases = v11.cases.map(item => {
    const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
    return {
      ...item,
      allowed_args: Object.fromEntries(
        tools.map(tool => [tool, caseArgumentRules(tool, item.expected_tools)]),
      ),
      runs: [],
    };
  });
  return {
    ...v11,
    datasetVersion: DATASET_V12_VERSION,
    generatedAt: '2026-09-25T16:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(CONTRACT_1_9_REV12_ARGUMENT_RULES).length} contextual tools, contract ${DATASET_V12_CONTRACT}, storefront revision ${DATASET_V12_REVISION})`,
    derivedFrom:
      'natural-language-cases.v11.json + webmcp/src/contracts.js (WebMCP contract 1.9, revision 2026-09-25.12), by webmcp/evals/dataset-v12.js — argument rules regenerated (offer offset and limit 12, single-filter removal, show_chart, show_offer without merchant_id; load_more and show_chart admitted false only as extra reads)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V12_PATH, serializeDataset(deriveDatasetV12()));
}
