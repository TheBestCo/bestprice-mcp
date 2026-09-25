/**
 * Dataset 10.0.0 — 9.0.0 graded against WebMCP contract 1.9 (2026-09-25).
 *
 * Contract 1.9 (bestprice.gr 867fcffe5a, b43f47d55b) added one tool and one page type:
 *
 * - `get_product_details`, a read-only tool on the home page, listings and every other public page (not
 *   the item page): one product's offers, specifications and price history without moving the tab.
 *   An agent that checks a product before opening it on a listing — exactly what the tool is for —
 *   made an extra call 9.0.0 does not admit, and failed the chain. Under the owner's rule of
 *   2026-09-15 (extra read-only calls are fine) it joins every case's admitted reads;
 * - the `site` page type (articles, deals, stores, brands… with search_bestprice, get_product_details and
 *   get_shopping_decision). No case starts on such a page, so no case changes for it; new cases for it
 *   are new prompts, an owner's decision, not a grading change.
 *
 * `allowed_args` are regenerated from the published 1.9 input schemas, which add `include` (a list of
 * sections, graded by its length and items). No argument of a 1.8 tool changed, and 1.9's numeric
 * `get_shopping_decision` ids change no required property. Prompts, chains, criteria and required
 * properties are 9.0.0's. 9.0.0 is not rewritten; it stays frozen with its runs as contract 1.8 history.
 *
 * 10.0.0 is frozen in turn: the storefront's contract 1.9 revision of 2026-09-25 (b550a849e8) gave
 * search_bestprice constraints, one digits-only product id and get_product_details a `navigate` — which
 * dataset 11.0.0 grades (dataset-v11.js). So the argument rules of 1.9 as first published (b43f47d55b)
 * and the read it added are recorded below rather than read from the live contract.
 *
 *   node webmcp/evals/dataset-v10.js   # rewrites natural-language-cases.v10.json from v9
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V9_PATH } from './dataset-v9.js';

export const DATASET_V10_VERSION = '10.0.0';
/* The contract this dataset grades. A later contract is graded by a later dataset. */
export const DATASET_V10_CONTRACT = '1.9';
export const V10_PATH = fileURLToPath(new URL('./natural-language-cases.v10.json', import.meta.url));

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/* The argument rules of contract 1.9 as first published (bestprice.gr b43f47d55b, release 1.4.0), as
 * `argumentRules` generated them from webmcp/src/contracts.js at a444439. */
export const CONTRACT_1_9_ARGUMENT_RULES = deepFreeze({
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
  get_product_details: {
    product_id: {
      type: 'string',
      pattern: '^(?:bp_)?(\\d{1,20})$',
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

/* The read-only tool contract 1.9 added, admitted as an extra read in every case. */
export const CONTRACT_1_9_ADDED_READS = Object.freeze(['get_product_details']);

export function deriveDatasetV10(v9 = JSON.parse(readFileSync(V9_PATH, 'utf8'))) {
  const cases = v9.cases.map(item => {
    const extras = [...new Set([...(item.extra_calls_allowed ?? []), ...CONTRACT_1_9_ADDED_READS])].sort();
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    return {
      ...item,
      allowed_args: Object.fromEntries(
        tools.map(tool => [tool, structuredClone(CONTRACT_1_9_ARGUMENT_RULES[tool])]),
      ),
      extra_calls_allowed: extras,
      runs: [],
    };
  });
  return {
    ...v9,
    datasetVersion: DATASET_V10_VERSION,
    generatedAt: '2026-09-25T18:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(CONTRACT_1_9_ARGUMENT_RULES).length} contextual tools, contract ${DATASET_V10_CONTRACT})`,
    derivedFrom:
      'natural-language-cases.v9.json + webmcp/src/contracts.js (WebMCP contract 1.9), by webmcp/evals/dataset-v10.js — argument rules regenerated from contract 1.9, and get_product_details admitted as an extra read',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V10_PATH, serializeDataset(deriveDatasetV10()));
}
