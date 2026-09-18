import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V6_PATH } from '../evals/dataset-v6.js';
import { CORRECTIONS, DATASET_V7_VERSION, deriveDatasetV7, V7_PATH } from '../evals/dataset-v7.js';
import { gradeJourney } from '../evals/journey.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const definition = ({ runs, ...rest }) => rest;
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));

/* A trace shaped like the runs recorded on 2026-09-16: each call returns a valid envelope carrying
 * the properties its case requires, and the run ends with the given terminal. */
const trace = (item, tools, type = 'answer') => ({
  steps: tools.map((tool, index) => ({
    step: index + 1,
    tool,
    arguments: {},
    result: {
      ...Object.fromEntries((item.required_result_properties?.[tool] ?? []).map(key => [key, 'observed'])),
      ok: true,
    },
  })),
  terminal: { type, text: 'Η απάντηση του πράκτορα.' },
});

describe('dataset 7.0.0', () => {
  const v6 = read(V6_PATH);
  const v7 = read(V7_PATH);
  const before = byId(v6);
  const after = byId(v7);
  const grade = (dataset, id, tools, type) =>
    gradeJourney(dataset.get(id), trace(dataset.get(id), tools, type));

  it('is exactly what the generator derives from 6.0.0', () => {
    assert.equal(readFileSync(V7_PATH, 'utf8'), serializeDataset(deriveDatasetV7(v6)));
    assert.equal(v7.datasetVersion, DATASET_V7_VERSION);
  });

  it('corrects home-003, multi-002, multi-006 and multi-008, and changes nothing else', () => {
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
    const changed = [...after.keys()]
      .filter(id => JSON.stringify(definition(after.get(id))) !== JSON.stringify(definition(before.get(id))))
      .sort();
    assert.deepEqual(changed, ['home-003', 'multi-002', 'multi-006', 'multi-008']);
    assert.deepEqual(Object.keys(CORRECTIONS).sort(), changed);
    for (const id of changed) {
      assert.equal(after.get(id).deterministic_criteria, before.get(id).deterministic_criteria);
      assert.equal(after.get(id).prompt_el, before.get(id).prompt_el);
    }
  });

  it('home-003 passes the clarifying question its criteria accept, and nothing else changes', () => {
    /* The one home-003 run on 2026-09-16 that was blocked by something other than a 429: it carried a
     * terminal, so under grader v2 (2026-09-18) it is a completed attempt that skipped the call the
     * case asks for — `failed` — not an unfinished journey. The published record stays `blocked`. */
    assert.equal(grade(before, 'home-003', [], 'clarification').outcome, 'failed');
    assert.equal(grade(after, 'home-003', [], 'clarification').outcome, 'passed');
    /* An answer with no search is still no evidence, and a search still passes as before. */
    assert.equal(grade(after, 'home-003', [], 'answer').outcome, 'failed');
    assert.equal(grade(after, 'home-003', ['search_bestprice'], 'answer').outcome, 'passed');
  });

  it('multi-006 can now accept either terminal, and its invented price filter still fails', () => {
    assert.equal(grade(before, 'multi-006', [], 'clarification').outcome, 'failed');
    assert.equal(grade(after, 'multi-006', [], 'clarification').outcome, 'passed');
    assert.equal(
      grade(after, 'multi-006', ['search_bestprice', 'get_visible_products'], 'answer').outcome,
      'passed',
    );
    /* Its nine failures on 2026-09-16: a price bound the shopper never stated. Not admitted. */
    const invented = [
      'search_bestprice',
      'get_visible_products',
      'get_listing_filters',
      'apply_listing_filter',
    ];
    assert.equal(grade(after, 'multi-006', invented, 'answer').outcome, 'failed');
    assert.equal(grade(after, 'multi-006', invented, 'clarification').outcome, 'failed');
  });

  it('multi-002 asks for the four steps its criteria name, and reading the options stays optional', () => {
    assert.deepEqual(after.get('multi-002').expected_tools, [
      'search_bestprice',
      'apply_listing_filter',
      'apply_listing_sort',
      'get_visible_products',
    ]);
    const direct = ['search_bestprice', 'apply_listing_filter', 'apply_listing_sort', 'get_visible_products'];
    assert.equal(grade(before, 'multi-002', direct).outcome, 'failed');
    assert.equal(grade(after, 'multi-002', direct).outcome, 'passed');
    const reading = [
      'search_bestprice',
      'get_visible_products',
      'get_listing_filters',
      'apply_listing_filter',
      'get_listing_sort_options',
      'apply_listing_sort',
      'get_visible_products',
    ];
    assert.equal(grade(after, 'multi-002', reading).outcome, 'passed');
    /* Reporting without re-reading the sorted products is the agent ending the task early. */
    assert.equal(grade(after, 'multi-002', reading.slice(0, -1)).outcome, 'failed');
  });

  it('multi-008 needs all three tools, in any order', () => {
    assert.equal(after.get('multi-008').sequence_mode, 'unordered');
    const swapped = ['get_page_product', 'compare_page_offers', 'summarize_price_history', 'show_offer'];
    assert.equal(grade(before, 'multi-008', swapped).outcome, 'failed');
    assert.equal(grade(after, 'multi-008', swapped).outcome, 'passed');
    assert.equal(
      grade(after, 'multi-008', ['compare_page_offers', 'show_offer', 'summarize_price_history']).outcome,
      'passed',
    );
    assert.equal(
      grade(after, 'multi-008', ['compare_page_offers', 'summarize_price_history']).outcome,
      'failed',
    );
  });

  it('listing-011 is left on its 6.0.0 definition', () => {
    assert.deepEqual(after.get('listing-011'), before.get('listing-011'));
    assert.equal(grade(after, 'listing-011', ['get_listing_sort_options'], 'refusal').outcome, 'failed');
  });

  it('leaves 6.0.0 frozen', () => {
    assert.equal(v6.datasetVersion, '6.0.0');
    assert.equal(before.get('home-003').clarification_passes, undefined);
  });
});
