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
 *   node webmcp/evals/dataset-v10.js   # rewrites natural-language-cases.v10.json from v9
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
import { CONTRACT_1_8_ADDED_READS, V9_PATH } from './dataset-v9.js';

export const DATASET_V10_VERSION = '10.0.0';
/* The contract this dataset grades. A later contract is graded by a later dataset. */
export const DATASET_V10_CONTRACT = '1.9';
export const V10_PATH = fileURLToPath(new URL('./natural-language-cases.v10.json', import.meta.url));

const publishedDefinitions = () => {
  const byName = new Map();
  for (const page of Object.keys(PAGE_TOOL_NAMES)) {
    for (const definition of createTools({ page, execute: () => {} }))
      byName.set(definition.name, definition);
  }
  return byName;
};

export function deriveDatasetV10(v9 = JSON.parse(readFileSync(V9_PATH, 'utf8'))) {
  if (WEBMCP_CONTRACT_VERSION !== DATASET_V10_CONTRACT) {
    throw new Error(
      `dataset ${DATASET_V10_VERSION} grades contract ${DATASET_V10_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const definitions = publishedDefinitions();
  const addedReads = readOnlyTools(definitions).filter(
    tool => !CONTRACT_1_6_READ_ONLY_TOOLS.includes(tool) && !CONTRACT_1_8_ADDED_READS.includes(tool),
  );
  const cases = v9.cases.map(item => {
    const extras = [...new Set([...(item.extra_calls_allowed ?? []), ...addedReads])].sort();
    const tools = [...new Set([...item.expected_tools, ...extras])].sort();
    return {
      ...item,
      allowed_args: Object.fromEntries(tools.map(tool => [tool, argumentRules(definitions.get(tool))])),
      extra_calls_allowed: extras,
      runs: [],
    };
  });
  return {
    ...v9,
    datasetVersion: DATASET_V10_VERSION,
    generatedAt: '2026-09-25T18:00:00+03:00',
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${definitions.size} contextual tools, contract ${DATASET_V10_CONTRACT})`,
    derivedFrom:
      'natural-language-cases.v9.json + webmcp/src/contracts.js (WebMCP contract 1.9), by webmcp/evals/dataset-v10.js — argument rules regenerated from contract 1.9, and get_product_details admitted as an extra read',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V10_PATH, serializeDataset(deriveDatasetV10()));
}
