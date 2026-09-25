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
 *   node webmcp/evals/dataset-v12.js   # rewrites natural-language-cases.v12.json from v11
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTools, PAGE_TOOL_NAMES, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { argumentRules, serializeDataset } from './dataset-v3.js';
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

const publishedDefinitions = () => {
  const byName = new Map();
  for (const page of Object.keys(PAGE_TOOL_NAMES)) {
    for (const definition of createTools({ page, execute: () => {} }))
      byName.set(definition.name, definition);
  }
  return byName;
};

/** One tool's argument rules in one case: an admitted extra read may not use the argument that acts. */
export const caseArgumentRules = (definition, expectedTools) => {
  const generated = argumentRules(definition);
  const flag = READ_ONLY_UNLESS[definition.name];
  if (flag && !expectedTools.includes(definition.name) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

export function deriveDatasetV12(v11 = JSON.parse(readFileSync(V11_PATH, 'utf8'))) {
  if (WEBMCP_CONTRACT_VERSION !== DATASET_V12_CONTRACT) {
    throw new Error(
      `dataset ${DATASET_V12_VERSION} grades contract ${DATASET_V12_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const definitions = publishedDefinitions();
  const cases = v11.cases.map(item => {
    const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
    return {
      ...item,
      allowed_args: Object.fromEntries(
        tools.map(tool => [tool, caseArgumentRules(definitions.get(tool), item.expected_tools)]),
      ),
      runs: [],
    };
  });
  return {
    ...v11,
    datasetVersion: DATASET_V12_VERSION,
    generatedAt: '2026-09-25T16:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${definitions.size} contextual tools, contract ${DATASET_V12_CONTRACT}, storefront revision ${DATASET_V12_REVISION})`,
    derivedFrom:
      'natural-language-cases.v11.json + webmcp/src/contracts.js (WebMCP contract 1.9, revision 2026-09-25.12), by webmcp/evals/dataset-v12.js — argument rules regenerated (offer offset and limit 12, single-filter removal, show_chart, show_offer without merchant_id; load_more and show_chart admitted false only as extra reads)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V12_PATH, serializeDataset(deriveDatasetV12()));
}
