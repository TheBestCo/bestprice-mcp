/**
 * Dataset 11.0.0 — 10.0.0 graded against WebMCP contract 1.9 as revised on 2026-09-25 (bestprice.gr
 * 971aa25d79, b550a849e8; registration revision 2026-09-25.7). The contract version did not change;
 * what an agent may send did:
 *
 * - `search_bestprice` takes `min_price_eur`, `max_price_eur`, `sort`, `in_stock_only` and
 *   `deals_only`. 10.0.0 refuses them as unexpected arguments, so a shopper's «κινητό έως 400€, το πιο
 *   φθηνό» searched the way the page now supports failed its case;
 * - one product id form everywhere, digits only (`^\d{1,20}$`): the `bp_` form 10.0.0 accepted for
 *   `compare_page_offers.product_id` and `get_product_details.product_id` is now refused by the page;
 * - `get_product_details` gained `navigate`, so it is no longer read-only. It stays an admitted extra
 *   read — reading a product before opening it is what it is for — but only as a read: where it is not
 *   an expected tool, its `navigate` rule admits `false` alone, so an extra call that moves the tab is
 *   an extra action and fails, as any other extra action does.
 *
 * `allowed_args` are regenerated from the published input schemas. Prompts, chains, criteria,
 * required properties and admitted reads are 10.0.0's; the reworded descriptions change no grading.
 * 10.0.0 is not rewritten; it stays frozen with its runs as the history of 1.9 as first published.
 *
 * 11.0.0 is frozen in turn (it graded revisions .7 to .9 unchanged): the storefront's revision
 * 2026-09-25.12 (6645a4e1c1) gave several tools new optional arguments, unpublished show_offer's
 * merchant_id and made get_visible_products and summarize_price_history actions when asked — which
 * dataset 12.0.0 grades (dataset-v12.js). So the argument rules 11.0.0 was generated with are recorded
 * below rather than read from the live contract.
 *
 *   node webmcp/evals/dataset-v11.js   # rewrites natural-language-cases.v11.json from v10
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V10_PATH } from './dataset-v10.js';

export const DATASET_V11_VERSION = '11.0.0';
/* The contract this dataset grades, and the storefront revision of it. */
export const DATASET_V11_CONTRACT = '1.9';
export const DATASET_V11_REVISION = '2026-09-25.7';
export const V11_PATH = fileURLToPath(new URL('./natural-language-cases.v11.json', import.meta.url));

/* The tool that is an admitted extra read only while it reads: its `navigate` moves the tab. */
export const READ_ONLY_WHEN_NOT_NAVIGATING = Object.freeze({ get_product_details: 'navigate' });

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

/* The argument rules of contract 1.9 at registration revision 2026-09-25.7 (bestprice.gr b550a849e8,
 * releases 1.4.1 to 1.4.3), as `argumentRules` generated them from webmcp/src/contracts.js at d477d91;
 * get_product_details.navigate as generated, before an extra read's restriction. */
export const CONTRACT_1_9_REV7_ARGUMENT_RULES = deepFreeze({
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

export function deriveDatasetV11(v10 = JSON.parse(readFileSync(V10_PATH, 'utf8'))) {
  const cases = v10.cases.map(item => {
    const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
    const rules = tools.map(tool => {
      const generated = structuredClone(CONTRACT_1_9_REV7_ARGUMENT_RULES[tool]);
      const flag = READ_ONLY_WHEN_NOT_NAVIGATING[tool];
      /* An admitted extra read may not use the argument that makes it an action. */
      if (flag && !item.expected_tools.includes(tool) && generated[flag]) {
        generated[flag] = { ...generated[flag], enum: [false] };
      }
      return [tool, generated];
    });
    return { ...item, allowed_args: Object.fromEntries(rules), runs: [] };
  });
  return {
    ...v10,
    datasetVersion: DATASET_V11_VERSION,
    generatedAt: '2026-09-25T21:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(CONTRACT_1_9_REV7_ARGUMENT_RULES).length} contextual tools, contract ${DATASET_V11_CONTRACT}, storefront revision ${DATASET_V11_REVISION})`,
    derivedFrom:
      'natural-language-cases.v10.json + webmcp/src/contracts.js (WebMCP contract 1.9, revision 2026-09-25.7), by webmcp/evals/dataset-v11.js — argument rules regenerated (search constraints, digits-only product ids, get_product_details.navigate admitted false only as an extra read)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V11_PATH, serializeDataset(deriveDatasetV11()));
}
