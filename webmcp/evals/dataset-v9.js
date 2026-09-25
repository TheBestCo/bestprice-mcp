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
 * `webmcp/test/dataset-v9.test.js` fails when the committed file and this derivation disagree —
 * which is what a contract change does to an argument rule: the next dataset version is the answer.
 *
 *   node webmcp/evals/dataset-v9.js   # rewrites natural-language-cases.v9.json from v8
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTools, PAGE_TOOL_NAMES, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import {
  argumentRules,
  CONTRACT_1_6_READ_ONLY_TOOLS,
  readOnlyTools,
  serializeDataset,
} from './dataset-v3.js';
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

const publishedDefinitions = () => {
  const byName = new Map();
  for (const page of Object.keys(PAGE_TOOL_NAMES)) {
    for (const definition of createTools({ page, execute: () => {} }))
      byName.set(definition.name, definition);
  }
  return byName;
};

export function deriveDatasetV9(v8 = JSON.parse(readFileSync(V8_PATH, 'utf8'))) {
  if (WEBMCP_CONTRACT_VERSION !== DATASET_V9_CONTRACT) {
    throw new Error(
      `dataset ${DATASET_V9_VERSION} grades contract ${DATASET_V9_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const definitions = publishedDefinitions();
  const addedReads = readOnlyTools(definitions).filter(tool => !CONTRACT_1_6_READ_ONLY_TOOLS.includes(tool));
  const cases = v8.cases.map(item => {
    const extras = [...new Set([...(item.extra_calls_allowed ?? []), ...addedReads])].sort();
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    const required = SEARCH_RESULT_CASES.includes(item.id)
      ? { ...item.required_result_properties, search_bestprice: [...SEARCH_RESULT_PROPERTIES] }
      : item.required_result_properties;
    return {
      ...item,
      allowed_args: Object.fromEntries(tools.map(tool => [tool, argumentRules(definitions.get(tool))])),
      required_result_properties: required,
      extra_calls_allowed: extras,
      runs: [],
    };
  });
  return {
    ...v8,
    datasetVersion: DATASET_V9_VERSION,
    generatedAt: '2026-09-25T15:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${definitions.size} contextual tools, contract ${DATASET_V9_CONTRACT})`,
    derivedFrom:
      'natural-language-cases.v8.json + webmcp/src/contracts.js (WebMCP contract 1.8), by webmcp/evals/dataset-v9.js — argument rules and admitted reads regenerated from contract 1.8, and four search cases grade its structured result',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V9_PATH, serializeDataset(deriveDatasetV9()));
}
