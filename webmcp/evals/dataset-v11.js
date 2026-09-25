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
 *   node webmcp/evals/dataset-v11.js   # rewrites natural-language-cases.v11.json from v10
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTools, PAGE_TOOL_NAMES, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { argumentRules, serializeDataset } from './dataset-v3.js';
import { V10_PATH } from './dataset-v10.js';

export const DATASET_V11_VERSION = '11.0.0';
/* The contract this dataset grades, and the storefront revision of it. */
export const DATASET_V11_CONTRACT = '1.9';
export const DATASET_V11_REVISION = '2026-09-25.7';
export const V11_PATH = fileURLToPath(new URL('./natural-language-cases.v11.json', import.meta.url));

/* The tool that is an admitted extra read only while it reads: its `navigate` moves the tab. */
export const READ_ONLY_WHEN_NOT_NAVIGATING = Object.freeze({ get_product_details: 'navigate' });

const publishedDefinitions = () => {
  const byName = new Map();
  for (const page of Object.keys(PAGE_TOOL_NAMES)) {
    for (const definition of createTools({ page, execute: () => {} }))
      byName.set(definition.name, definition);
  }
  return byName;
};

export function deriveDatasetV11(v10 = JSON.parse(readFileSync(V10_PATH, 'utf8'))) {
  if (WEBMCP_CONTRACT_VERSION !== DATASET_V11_CONTRACT) {
    throw new Error(
      `dataset ${DATASET_V11_VERSION} grades contract ${DATASET_V11_CONTRACT}; the published contract is ${WEBMCP_CONTRACT_VERSION}`,
    );
  }
  const definitions = publishedDefinitions();
  const cases = v10.cases.map(item => {
    const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
    const rules = tools.map(tool => {
      const generated = argumentRules(definitions.get(tool));
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
    sourceContracts: `bestprice-mcp/webmcp/src/contracts.js (${definitions.size} contextual tools, contract ${DATASET_V11_CONTRACT}, storefront revision ${DATASET_V11_REVISION})`,
    derivedFrom:
      'natural-language-cases.v10.json + webmcp/src/contracts.js (WebMCP contract 1.9, revision 2026-09-25.7), by webmcp/evals/dataset-v11.js — argument rules regenerated (search constraints, digits-only product ids, get_product_details.navigate admitted false only as an extra read)',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V11_PATH, serializeDataset(deriveDatasetV11()));
}
