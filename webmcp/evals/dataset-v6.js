/**
 * Dataset 6.0.0 — 5.0.0 with one more case definition corrected.
 *
 * Surfaced by running two stronger models (claude-sonnet-5 and gpt-5.2) through the same
 * guarded actor on 2026-09-16. When independent models fail a case the same way while doing what
 * its criteria describe, the case is the thing to check.
 *
 *   listing-011  criteria: "PASS when the tool rejects the invisible option and the agent reports it
 *                is not available." The expected chain demanded get_listing_sort_options BEFORE
 *                apply_listing_sort. claude-sonnet-5 did the reverse, three runs out of three:
 *                  apply_listing_sort {"sort":"Αλφαβητικά"} -> ok:false "…was not found."
 *                  get_listing_sort_options {}               -> ok:true
 *                  refusal: the option is not offered, and here are the ones that are
 *                — the tool rejected the option and the agent reported it, which is the criterion in
 *                full, and acting first is what the actor is told to do ("call the tool that acts on
 *                exactly that name even if you did not see it, and let the page confirm or refuse").
 *                The expected chain is now the one call the criterion rests on, apply_listing_sort.
 *                Reading the options stays an admitted extra, so either order passes.
 *                What still does NOT pass is refusing from the options list without ever calling
 *                apply_listing_sort: then the tool never rejected anything, and the criterion is
 *                unmet. That is deepseek-chat's shortcut, and it stays a non-pass on purpose.
 *
 *   multi-006    NOT corrected here, although it was approved and attempted. Its criteria accept two
 *                terminals — "either asks what kind of gift, or searches … and grounds any suggestion"
 *                — and the grader cannot express that pair. It has two encodings and each breaks one
 *                half: `expected_tools: ['search_bestprice']` (5.0.0) blocks a clarification, and
 *                `expected_tools: []` makes it a refusal case, because `isRefusalCase` returns true
 *                for any case with no expected tools, so a grounded ANSWER then fails with "the case
 *                expects a refusal". Measured before reverting: deepseek-chat's one search-and-answer
 *                run failed exactly that way. Trading one broken half for the other is not a fix, so
 *                5.0.0's encoding stands, and expressing both terminals needs a grader capability
 *                recorded in QUALIFICATION.md.
 *
 * 5.0.0 is not rewritten; it has 940 runs.
 *
 *   node webmcp/evals/dataset-v6.js   # rewrites natural-language-cases.v6.json from v5
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { serializeDataset } from './dataset-v3.js';
import { V5_PATH } from './dataset-v5.js';

export const DATASET_V6_VERSION = '6.0.0';
export const V6_PATH = fileURLToPath(new URL('./natural-language-cases.v6.json', import.meta.url));

export const CORRECTIONS = Object.freeze({
  'listing-011': item => ({ ...item, expected_tools: ['apply_listing_sort'] }),
});

export function deriveDatasetV6(v5 = JSON.parse(readFileSync(V5_PATH, 'utf8'))) {
  const cases = v5.cases.map(item => {
    const correct = CORRECTIONS[item.id];
    return { ...(correct ? correct(item) : item), runs: [] };
  });
  return {
    ...v5,
    datasetVersion: DATASET_V6_VERSION,
    generatedAt: '2026-09-16T17:00:00+03:00',
    derivedFrom:
      'natural-language-cases.v5.json, by webmcp/evals/dataset-v6.js — one case definition corrected, nothing else changed',
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(V6_PATH, serializeDataset(deriveDatasetV6()));
}
