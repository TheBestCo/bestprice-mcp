/**
 * Dataset 4.0.0 — 3.0.0 with two case definitions corrected.
 *
 * Two cases in 3.0.0 cannot be satisfied by any agent, for reasons internal to the case text rather
 * than anything an agent or the product does. Each blocked 100% of its runs across every 3.0.0
 * cohort collected on 2026-09-15/16 — 40 runs each, not one of them completed — and because the
 * release target also requires a 0.95 completion rate, no sample size could ever lift them. They
 * held the reachable ceiling at 45 of 47.
 *
 *   product-012  "I want to see the offer from the shop I named, not another one" — and no shop is
 *                named anywhere in the case. `show_offer` cannot be called correctly without a
 *                merchant, so the only honest move is to ask which, which the case grades as an
 *                unfinished chain. The prompt now names one. Both branches its own criteria already
 *                allow stay valid: focus that merchant when the page renders it, refuse clearly
 *                when it does not.
 *
 *   neg-003      criteria: "PASS when the agent explains offers have no direct merchant URL and the
 *                shopper chooses on the BestPrice page itself" — no tool call required — while
 *                `expected_tools` demanded `compare_page_offers`. The agent gave that explanation
 *                verbatim and was graded blocked for not calling a tool the criteria never mention.
 *                `expected_tools` is now empty, which is how this dataset already expresses a
 *                terminal-only case (neg-002).
 *
 * 3.0.0 is NOT rewritten. The ledger's rules forbid it — "every frozen case file is compared
 * against the trusted merge-base copy, so a published definition cannot be rewritten" — and its
 * 2,961 runs stay bound to its digests. A corrected dataset is a new version with its own ledger,
 * exactly as v2 → v3 was.
 *
 *   node webmcp/evals/dataset-v4.js   # rewrites natural-language-cases.v4.json from v3
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset, V3_PATH } from './dataset-v3.js';

export const DATASET_V4_VERSION = '4.0.0';
export const V4_PATH = fileURLToPath(new URL('./natural-language-cases.v4.json', import.meta.url));

/* The merchant product-012 names. A concrete name is what makes the case answerable at all; which
 * name it is matters less, because the case's own criteria accept either outcome — focus it when
 * the page renders it, refuse clearly when it does not. Observed on the qualification product on
 * 2026-09-16, so the positive branch is reachable rather than theoretical. */
const NAMED_MERCHANT = 'Electroholic';

export const CORRECTIONS = Object.freeze({
  'product-012': item => ({
    ...item,
    prompt_el: `Θέλω να δω την προσφορά του καταστήματος «${NAMED_MERCHANT}», όχι κάποια άλλη.`,
    prompt_en: `I want to see the offer from the shop "${NAMED_MERCHANT}", not another one.`,
  }),
  'neg-003': item => ({ ...item, expected_tools: [] }),
});

export function deriveDatasetV4(v3 = JSON.parse(readFileSync(V3_PATH, 'utf8'))) {
  const cases = v3.cases.map(item => {
    const correct = CORRECTIONS[item.id];
    return { ...(correct ? correct(item) : item), runs: [] };
  });
  return {
    ...v3,
    datasetVersion: DATASET_V4_VERSION,
    generatedAt: '2026-09-16T13:00:00+03:00',
    derivedFrom:
      'natural-language-cases.v3.json, by webmcp/evals/dataset-v4.js — two case definitions corrected, nothing else changed',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V4_PATH, serializeDataset(deriveDatasetV4()));
}
