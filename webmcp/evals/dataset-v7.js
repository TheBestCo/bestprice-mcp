/**
 * Dataset 7.0.0 — 6.0.0 with four case definitions corrected (owner's decision, 2026-09-18).
 *
 * Measured on deepseek-chat, twenty passes at fa57431 on 2026-09-16, after the edge's 429 throttle
 * was separated out as a harness fault (webmcp-native-runner, bestprice.gr a5a69836cc):
 *
 *   home-003     criteria: "PASS when the agent either asks one clarifying question or calls
 *   multi-006    search_bestprice …" / "either asks what kind of gift, or searches …". Both accept a
 *                clarification, and the grader could not: a question in place of search_bestprice was
 *                `blocked` as an unfinished journey (home-003: the one blocked run that was not a
 *                429). They now declare `clarification_passes`, which journey.js honours in place of
 *                the expected call only. This is the grader capability 6.0.0 recorded as missing for
 *                multi-006. It does not lift multi-006 by itself: its 9 failures on 2026-09-16 apply a
 *                price filter the shopper never stated («κάτι όχι πολύ ακριβό» → a bound), which the
 *                case does not admit, and that stays a failure.
 *
 *   multi-002    criteria: "PASS when the agent searches, filters to the visible Apple value, applies
 *                the visible cheapest sort, and reports the re-read products ascending by price." The
 *                expected chain also made get_listing_filters and get_listing_sort_options mandatory
 *                steps, which the criteria never ask for — an agent whose filter was accepted without
 *                reading the options first failed. The chain is now the four steps the criteria name;
 *                both reads stay admitted extras (they already were).
 *
 *   multi-008    «Σύγκρινε τις προσφορές, δείξε μου τη φθηνότερη με μεταφορικά και πες μου αν η τιμή
 *                είναι χαμηλή ιστορικά» asks for three things, none of which depends on another's
 *                order, and 7 of 20 runs did all three with the history read before show_offer — each
 *                `blocked` as "only 2 of 3 in order". It is now `unordered`: every tool must still be
 *                observed, in any order.
 *
 * listing-011 is NOT changed: refusing from the options list without calling apply_listing_sort never
 * exercises the page's refusal the case exists to test (6.0.0's reasoning, and the owner's decision).
 *
 * 6.0.0 is not rewritten; it has 1,880 runs.
 *
 *   node webmcp/evals/dataset-v7.js   # rewrites natural-language-cases.v7.json from v6
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V6_PATH } from './dataset-v6.js';

export const DATASET_V7_VERSION = '7.0.0';
export const V7_PATH = fileURLToPath(new URL('./natural-language-cases.v7.json', import.meta.url));

export const CORRECTIONS = Object.freeze({
  'home-003': item => ({ ...item, clarification_passes: true }),
  'multi-006': item => ({ ...item, clarification_passes: true }),
  'multi-002': item => ({
    ...item,
    expected_tools: [
      'search_bestprice',
      'apply_listing_filter',
      'apply_listing_sort',
      'get_visible_products',
    ],
  }),
  'multi-008': item => ({ ...item, sequence_mode: 'unordered' }),
});

export function deriveDatasetV7(v6 = JSON.parse(readFileSync(V6_PATH, 'utf8'))) {
  const cases = v6.cases.map(item => {
    const correct = CORRECTIONS[item.id];
    return { ...(correct ? correct(item) : item), runs: [] };
  });
  return {
    ...v6,
    datasetVersion: DATASET_V7_VERSION,
    generatedAt: '2026-09-18T12:00:00+03:00',
    derivedFrom:
      'natural-language-cases.v6.json, by webmcp/evals/dataset-v7.js — four case definitions corrected, nothing else changed',
    schema: {
      ...v6.schema,
      clarification_passes:
        'optional; true when the criteria accept a clarifying question in place of the expected call',
    },
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V7_PATH, serializeDataset(deriveDatasetV7()));
}
