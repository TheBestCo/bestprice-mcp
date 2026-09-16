/**
 * Dataset 5.0.0 — 4.0.0 with one more case definition corrected.
 *
 *   home-005   The shopper writes a long need: wireless ANC headphones, good battery, comfortable,
 *              under two hundred euros, available now in Greece with a warranty. The case's own
 *              criteria test exactly one thing — "PASS when the agent condenses the need into a
 *              ≤120-char query (or the tool rejects a longer one and the agent retries shorter);
 *              FAIL when it silently submits >120 chars."
 *
 *              On 4.0.0 the agent's first call condensed it correctly, e.g.
 *              `search_bestprice {"query": "ασύρματα ακουστικά ενεργή μείωση θορύβου"}`, and then
 *              applied the price and availability filters the shopper had asked for. It failed on
 *              tool-set membership: `apply_listing_filter` was not among the case's admitted extra
 *              calls. 12 of 14 failures on 4.0.0 were that; the other 2 were a second search,
 *              which the criteria name as a PASS path in so many words ("retries shorter").
 *
 *              Both are now admitted for this case: `apply_listing_filter`, because the shopper's
 *              own message states a price ceiling and an availability requirement, and a repeat
 *              `search_bestprice`, because the criteria sanction a retry. Neither loosens what the
 *              case tests — the `maxLength: 120` rule on `query` is enforced on the arguments of
 *              every `search_bestprice` call, admitted extra or not, and a navigation the browser
 *              policy blocks still fails the run whichever call made it.
 *
 * 4.0.0 is not rewritten: it has 940 runs and the same rule as every published case file.
 *
 *   node webmcp/evals/dataset-v5.js   # rewrites natural-language-cases.v5.json from v4
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V4_PATH } from './dataset-v4.js';

export const DATASET_V5_VERSION = '5.0.0';
export const V5_PATH = fileURLToPath(new URL('./natural-language-cases.v5.json', import.meta.url));

/* The case whose admitted calls change, and the calls it gains. Argument rules for each are taken
 * from a case in the same frozen dataset that already carries them, so they are the rules the
 * published contract generated rather than a second, hand-written copy. */
const HOME_005_ADMITTED = Object.freeze(['apply_listing_filter', 'search_bestprice']);

const argumentRulesFor = (cases, tool) =>
  cases.find(item => item.allowed_args?.[tool])?.allowed_args?.[tool] ?? null;

export const CORRECTIONS = Object.freeze({
  'home-005': (item, cases) => {
    const extra = [...new Set([...(item.extra_calls_allowed ?? []), ...HOME_005_ADMITTED])].sort();
    const allowed = { ...item.allowed_args };
    for (const tool of HOME_005_ADMITTED) {
      if (allowed[tool]) continue;
      const rules = argumentRulesFor(cases, tool);
      if (!rules) throw new Error(`no contract-generated argument rules for ${tool} anywhere in 4.0.0`);
      allowed[tool] = rules;
    }
    return { ...item, extra_calls_allowed: extra, allowed_args: allowed };
  },
});

export function deriveDatasetV5(v4 = JSON.parse(readFileSync(V4_PATH, 'utf8'))) {
  const cases = v4.cases.map(item => {
    const correct = CORRECTIONS[item.id];
    return { ...(correct ? correct(item, v4.cases) : item), runs: [] };
  });
  return {
    ...v4,
    datasetVersion: DATASET_V5_VERSION,
    generatedAt: '2026-09-16T15:00:00+03:00',
    derivedFrom:
      'natural-language-cases.v4.json, by webmcp/evals/dataset-v5.js — one case definition corrected, nothing else changed',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V5_PATH, serializeDataset(deriveDatasetV5()));
}
