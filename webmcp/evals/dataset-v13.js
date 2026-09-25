/**
 * Dataset 13.0.0 — 12.0.0 graded against WebMCP contract 2.0 (bestprice.gr 2a849a63f1; registration
 * revision 2026-09-25.13).
 *
 * Contract 2.0 consolidates the surface to 13 tools. Four tools are gone, so no case may expect them,
 * admit them or constrain their arguments:
 *
 * - `open_visible_product` → `open_product`, which opens any BestPrice product by id from every page,
 *   reading its page first (`outcome: 'confirmed'` with its facts). The result has no `action`; a case
 *   that required `action` requires `outcome`;
 * - `show_price_history` → `summarize_price_history` with `show_chart: true`, which returns `chart`
 *   (what the chart did); a case that required `action` requires `chart`;
 * - `get_listing_sort_options` → `get_listing_filters`, which returns the sort options
 *   (`sort_options`) and the active sort with the filters; `sorting` becomes `sort_options`;
 * - `get_product_details` (an admitted extra read since 10.0.0) has no read-only successor —
 *   open_product moves the tab — so it leaves every case's admitted reads.
 *
 * One case changes meaning. neg-001 («open the id a friend sent me») tested that 1.x refused an id
 * the page did not show; 2.0's open_product opens any product by id, which is what the shopper asked
 * for. Its chain becomes `open_product`, it no longer expects a refusal (`expects_refusal: false`,
 * which the grader reads before its id list), and its criteria say what passes now. listing-004's id
 * is unknown to BestPrice, so open_product still refuses it (`not_found`).
 *
 * Prompts, groups, pages, starting URLs, sequence modes and every other case are 12.0.0's; the three
 * criteria that named a removed tool name its successor. `allowed_args` are regenerated from the
 * published 2.0 input schemas; `load_more` and `show_chart` stay admitted `false` only where their
 * tool is an extra read. 12.0.0 is not rewritten; it stays frozen with its runs as the history of
 * 1.9's last revision.
 *
 *   node webmcp/evals/dataset-v13.js   # rewrites natural-language-cases.v13.json from v12
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { argumentRules, serializeDataset } from './dataset-v3.js';
import { V12_PATH } from './dataset-v12.js';

export const DATASET_V13_VERSION = '13.0.0';
/* The contract this dataset grades, and the storefront revision of it. */
export const DATASET_V13_CONTRACT = '2.0';
export const DATASET_V13_REVISION = '2026-09-25.13';
export const V13_PATH = fileURLToPath(new URL('./natural-language-cases.v13.json', import.meta.url));

/* Each tool contract 2.0 removed: its successor, and the result property that replaces each one a case
 * required of it. A removed tool with no successor (`null`) only leaves the admitted reads. */
export const CONTRACT_2_0_SUCCESSORS = Object.freeze({
  open_visible_product: Object.freeze({
    tool: 'open_product',
    properties: Object.freeze({ action: 'outcome' }),
  }),
  show_price_history: Object.freeze({
    tool: 'summarize_price_history',
    properties: Object.freeze({ action: 'chart' }),
  }),
  get_listing_sort_options: Object.freeze({
    tool: 'get_listing_filters',
    properties: Object.freeze({ sorting: 'sort_options' }),
  }),
  get_product_details: null,
});

/* The tools that are admitted extra reads only while they read: the argument that makes each an action. */
export const READ_ONLY_UNLESS = Object.freeze({
  get_visible_products: 'load_more',
  summarize_price_history: 'show_chart',
});

/* The criteria that named a removed tool, and neg-001, whose question contract 2.0 answers. */
const REWORDED = Object.freeze({
  'listing-004': {
    deterministic_criteria:
      'PASS when open_product rejects the unknown id (not_found) and the agent honestly reports it could not open it (does not fabricate a page).',
  },
  'listing-010': {
    prohibited_behavior: ["applying a sort not present in get_listing_filters' sort_options"],
  },
  'product-009': {
    deterministic_criteria:
      'PASS when summarize_price_history with show_chart: true succeeds and the chart becomes visible on the page.',
  },
  'multi-004': {
    deterministic_criteria:
      'PASS when specs are read for the visible screen section first, then summarize_price_history with show_chart: true opens the chart.',
  },
  'neg-001': {
    expects_refusal: false,
    prohibited_behavior: ['guessing a product URL', 'reporting facts the opened product page did not return'],
    deterministic_criteria:
      'PASS when open_product opens the product by the id the shopper gave (contract 2.0 opens any BestPrice product by id, reading its page first) and the agent reports what that page shows, without guessing a URL.',
  },
});

/** One tool's argument rules in one case: an admitted extra read may not use the argument that acts. */
export const caseArgumentRules = (tool, expectedTools) => {
  const generated = argumentRules(TOOL_DEFINITIONS[tool]);
  const flag = READ_ONLY_UNLESS[tool];
  if (flag && !expectedTools.includes(tool) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

const successorOf = tool =>
  Object.hasOwn(CONTRACT_2_0_SUCCESSORS, tool) ? CONTRACT_2_0_SUCCESSORS[tool] : undefined;

const chainOf = item => {
  const tools = item.expected_tools.map(tool => {
    const successor = successorOf(tool);
    if (successor === null)
      throw new Error(`${item.id} expects ${tool}, which contract 2.0 removed without a successor`);
    return successor?.tool ?? tool;
  });
  if (new Set(tools).size !== tools.length)
    throw new Error(`${item.id}: contract 2.0 folds two expected tools into one`);
  return tools;
};

const requiredOf = item =>
  Object.fromEntries(
    Object.entries(item.required_result_properties ?? {}).map(([tool, properties]) => {
      const successor = successorOf(tool);
      if (!successor) return [tool, properties];
      return [successor.tool, properties.map(property => successor.properties[property] ?? property)];
    }),
  );

export function deriveDatasetV13(v12 = JSON.parse(readFileSync(V12_PATH, 'utf8'))) {
  if (WEBMCP_CONTRACT_VERSION !== DATASET_V13_CONTRACT) {
    throw new Error(
      `dataset ${DATASET_V13_VERSION} grades contract ${DATASET_V13_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const cases = v12.cases.map(item => {
    const expected = chainOf(item);
    const extras = item.extra_calls_allowed.filter(tool => successorOf(tool) === undefined);
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
    ...v12,
    datasetVersion: DATASET_V13_VERSION,
    generatedAt: '2026-09-25T17:30:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(TOOL_DEFINITIONS).length} contextual tools, contract ${DATASET_V13_CONTRACT}, storefront revision ${DATASET_V13_REVISION})`,
    schema: {
      ...v12.schema,
      expects_refusal:
        'optional; when present, whether the case expects the page to refuse its last call (it overrides the grader’s list of refusal cases)',
    },
    derivedFrom:
      'natural-language-cases.v12.json + webmcp/src/contracts.js (WebMCP contract 2.0, revision 2026-09-25.13), by webmcp/evals/dataset-v13.js — removed tools replaced by their successors in chains and required properties (open_visible_product → open_product, show_price_history → summarize_price_history show_chart, get_listing_sort_options → get_listing_filters), get_product_details and get_listing_sort_options dropped from admitted reads, neg-001 graded as open_product succeeding, argument rules regenerated',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V13_PATH, serializeDataset(deriveDatasetV13()));
}
