/**
 * Dataset 16.0.0 — 15.0.0 graded against WebMCP contract 2.6 (bestprice.gr 762f0a4bc7), which covers
 * contracts 2.3 to 2.6.
 *
 * - 2.3 and 2.4 add the product page's shopper actions — add_to_shopping_list, add_to_comparison,
 *   open_price_alert, remove_from_shopping_list, remove_from_comparison — for this page's product. They
 *   act, so no case admits them as extra calls, and no case's prompt asks for one; cases for them are new
 *   prompts, an owner's decision, not a grading change.
 * - 2.4 gives get_shopping_decision structured inputs beside `message` — `max_price_eur` and `must_have`
 *   (1–6 features) — and one result field, `outcome` (`status` is gone). No case required `status`; the
 *   inputs join its argument rules, so an agent that states a budget in them is not refused.
 * - 2.5 adds two reads, get_shopping_list (every page) and get_comparison (the product page). Both are
 *   read-only, so they join every case's admitted extra reads under the owner's rule of 2026-09-15
 *   (extra read-only calls are fine), as search_bestprice did in 14.0.0.
 * - 2.6 drops get_shopping_decision's `catalog_candidates` and `search_url` (no case required them) and
 *   rewords descriptions; neither changes grading.
 *
 * `allowed_args` are regenerated from the published 2.6 input schemas; `show_chart` stays admitted `false`
 * only where summarize_price_history is an extra read. Chains, prompts, criteria and required properties
 * are 15.0.0's. 15.0.0 is not rewritten; it stays frozen with its runs as the history of contract 2.2.
 *
 * Contract 2.8 (bestprice.gr 1a601f6b16; 2.7 was a reverted trial) changes no grading: get_product_
 * specifications takes English section names too, and its rows and partial reads carry them, but no
 * input's rule changes (only the `section` description) and no case requires what changed. 16.0.0
 * grades it as it is, and its generator reproduces it under either contract.
 *
 *   node webmcp/evals/dataset-v16.js   # rewrites natural-language-cases.v16.json from v15
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { argumentRules, serializeDataset } from './dataset-v3.js';
import { V15_PATH } from './dataset-v15.js';

export const DATASET_V16_VERSION = '16.0.0';
/* The contract this dataset grades, and the storefront release of it. */
export const DATASET_V16_CONTRACT = '2.6';
/* Later contracts this dataset grades unchanged: their argument rules are 2.6's. */
export const DATASET_V16_ALSO_GRADES = Object.freeze(['2.8']);
export const DATASET_V16_SOURCE = '762f0a4bc7';
export const V16_PATH = fileURLToPath(new URL('./natural-language-cases.v16.json', import.meta.url));

/* The tools that are admitted extra reads only while they read: the argument that makes each an action. */
export const READ_ONLY_UNLESS = Object.freeze({ summarize_price_history: 'show_chart' });

/* The reads contract 2.5 added, admitted as extra reads in every case. */
export const CONTRACT_2_5_ADDED_READS = Object.freeze(['get_comparison', 'get_shopping_list']);

/** One tool's argument rules in one case: an admitted extra read may not use the argument that acts. */
export const caseArgumentRules = (tool, expectedTools) => {
  const generated = argumentRules(TOOL_DEFINITIONS[tool]);
  const flag = READ_ONLY_UNLESS[tool];
  if (flag && !expectedTools.includes(tool) && generated[flag]) {
    generated[flag] = { ...generated[flag], enum: [false] };
  }
  return generated;
};

export function deriveDatasetV16(v15 = JSON.parse(readFileSync(V15_PATH, 'utf8'))) {
  if (![DATASET_V16_CONTRACT, ...DATASET_V16_ALSO_GRADES].includes(WEBMCP_CONTRACT_VERSION)) {
    throw new Error(
      `dataset ${DATASET_V16_VERSION} grades contract ${DATASET_V16_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const cases = v15.cases.map(item => {
    const extras = [...new Set([...item.extra_calls_allowed, ...CONTRACT_2_5_ADDED_READS])].sort();
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    return {
      ...item,
      allowed_args: Object.fromEntries(
        tools.map(tool => [tool, caseArgumentRules(tool, item.expected_tools)]),
      ),
      runs: [],
      extra_calls_allowed: extras,
    };
  });
  return {
    ...v15,
    datasetVersion: DATASET_V16_VERSION,
    generatedAt: '2026-09-26T04:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${Object.keys(TOOL_DEFINITIONS).length} contextual tools, contract ${DATASET_V16_CONTRACT}, bestprice.gr ${DATASET_V16_SOURCE})`,
    derivedFrom:
      'natural-language-cases.v15.json + webmcp/src/contracts.js (WebMCP contract 2.6), by webmcp/evals/dataset-v16.js — get_shopping_list and get_comparison admitted as extra reads, argument rules regenerated (get_shopping_decision max_price_eur and must_have)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V16_PATH, serializeDataset(deriveDatasetV16()));
}
