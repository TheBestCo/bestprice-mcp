/*
 * Dataset 3.0.0, derived — never hand-edited — from the frozen 2.0.0 cases and the published contract.
 *
 * A native pass on contract 1.6 (2026-09-15, see QUALIFICATION.md) failed 29 of 47 journeys, and
 * two thirds of those failures described the frozen cases rather than the tools:
 *
 * - `allowed_args` were copied by hand from an older contract, so arguments the published contract
 *   accepts (`show_offer.offer_ref`, `get_product_specifications.limit`, `fact`) failed the run;
 * - every case graded an exact tool list, so one harmless extra read (reading the product before
 *   comparing its offers) failed a journey that did what the shopper asked.
 *
 * 3.0.0 keeps every prompt, expected tool chain and criterion, and changes only those two rules plus
 * five starting pages that 2.0.0 described in prose. The owner decided on 2026-09-15 that extra
 * read-only calls are fine; each case now names the read-only tools it admits, so the decision is
 * frozen into the case digest instead of living in grader code, and 2.0.0 grades exactly as before.
 *
 *   node webmcp/evals/dataset-v3.js   # rewrites natural-language-cases.v3.json from its sources
 *
 * `webmcp/test/dataset-v3.test.js` fails when the committed file and this derivation disagree —
 * which is what a contract change that alters an argument rule does: the next dataset version is
 * the honest response, not an edit of this one.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTools, PAGE_TOOL_NAMES } from '../src/contracts.js';

export const DATASET_V3_VERSION = '3.0.0';
export const V2_PATH = fileURLToPath(new URL('./natural-language-cases.v2.json', import.meta.url));
export const V3_PATH = fileURLToPath(new URL('./natural-language-cases.v3.json', import.meta.url));

/* The preconditions 2.0.0 wrote in prose, as the pages the storefront actually serves for them
 * (filter links read from production on 2026-09-15). */
const STARTING_PAGES = Object.freeze({
  'listing-008': 'https://www.bestprice.gr/cat/806/mobile-phones/f/1_26/samsung.html',
  'listing-012': 'https://www.bestprice.gr/hub/25/iphone/f/625_128000-0/toulachiston-128gb.html',
  'multi-005': 'https://www.bestprice.gr/cat/806/mobile-phones/f/1_26/samsung.html',
  'multi-007': 'https://www.bestprice.gr/cat/806/mobile-phones/f/1_26/samsung.html',
  /* A listing that changes between turns cannot be staged in one native session; the case still
   * tests that the agent re-reads the page instead of answering from memory. */
  'neg-006': 'https://www.bestprice.gr/search?q=iphone',
});

const RULE_KEYS = Object.freeze(['type', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'enum']);

/* The argument rules of contract 1.6, the contract 3.0.0 was derived from, recorded from
 * webmcp/src/contracts.js at faf3bc9 with `argumentRules` below. 3.0.0 is frozen, so its derivation
 * reads these and not the live contract: contract 1.7 (2026-09-22) added arguments, and a dataset
 * that admits them is the next dataset version — an owner's decision — not an edit of this one.
 * `webmcp/test/dataset-v3.test.js` names the arguments published since. */
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
export const CONTRACT_1_6_ARGUMENT_RULES = deepFreeze({
  search_bestprice: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: 120,
    },
  },
  get_visible_products: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 8,
    },
  },
  open_visible_product: {
    product_id: {
      type: 'string',
      pattern: '^\\d{1,20}$',
    },
  },
  get_listing_filters: {},
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
  clear_listing_filters: {},
  get_listing_sort_options: {},
  apply_listing_sort: {
    sort: {
      type: 'string',
      minLength: 1,
      maxLength: 72,
    },
  },
  get_page_product: {},
  compare_page_offers: {
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 4,
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
  },
  summarize_price_history: {},
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
});

const publishedDefinitions = () => {
  const byName = new Map();
  for (const page of Object.keys(PAGE_TOOL_NAMES)) {
    for (const definition of createTools({ page, execute: () => {} }))
      byName.set(definition.name, definition);
  }
  return byName;
};

/** Every read-only tool the published contract defines, sorted. */
export const readOnlyTools = (definitions = publishedDefinitions()) =>
  [...definitions.values()]
    .filter(definition => definition.annotations?.readOnlyHint === true)
    .map(definition => definition.name)
    .sort();

/** One tool's argument rules, straight from its published input schema. */
export const argumentRules = definition =>
  Object.fromEntries(
    Object.entries(definition.inputSchema?.properties ?? {}).map(([name, schema]) => [
      name,
      Object.fromEntries(RULE_KEYS.filter(key => schema[key] !== undefined).map(key => [key, schema[key]])),
    ]),
  );

export function deriveDatasetV3(v2 = JSON.parse(readFileSync(V2_PATH, 'utf8'))) {
  const definitions = publishedDefinitions();
  const extras = readOnlyTools(definitions);
  const cases = v2.cases.map(item => {
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    return {
      ...item,
      starting_url: STARTING_PAGES[item.id] ?? item.starting_url,
      allowed_args: Object.fromEntries(
        tools
          .filter(tool => Object.hasOwn(CONTRACT_1_6_ARGUMENT_RULES, tool))
          .map(tool => [tool, structuredClone(CONTRACT_1_6_ARGUMENT_RULES[tool])]),
      ),
      extra_calls_allowed: extras,
      runs: [],
    };
  });
  return {
    ...v2,
    datasetVersion: DATASET_V3_VERSION,
    generatedAt: '2026-09-15T23:30:00+03:00',
    derivedFrom:
      'natural-language-cases.v2.json + webmcp/src/contracts.js (WebMCP contract 1.6), by webmcp/evals/dataset-v3.js',
    sourceContracts: 'bestprice-mcp/webmcp/src/contracts.js (14 contextual tools, contract 1.6)',
    schema: {
      ...v2.schema,
      allowed_args:
        'per-tool argument rules generated from the published contract for the expected tools and every admitted extra tool',
      extra_calls_allowed:
        'read-only tools the agent may call in addition to the expected chain; they are ignored when the chain is matched, and any other extra call is still a mismatch',
    },
    cases,
  };
}

export const serializeDataset = dataset => `${JSON.stringify(dataset, null, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V3_PATH, serializeDataset(deriveDatasetV3()));
  console.log(`wrote ${V3_PATH}`);
}
