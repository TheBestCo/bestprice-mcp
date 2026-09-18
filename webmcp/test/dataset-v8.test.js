import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V7_PATH } from '../evals/dataset-v7.js';
import { CORRECTIONS, DATASET_V8_VERSION, deriveDatasetV8, V8_PATH } from '../evals/dataset-v8.js';
import { gradeJourney } from '../evals/journey.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const definition = ({ runs, ...rest }) => rest;
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));

/* A trace shaped like the 2026-09-18 runs: each call returns a valid envelope with the properties
 * its case requires, and the run ends with the given terminal. */
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

describe('dataset 8.0.0', () => {
  const v7 = read(V7_PATH);
  const v8 = read(V8_PATH);
  const before = byId(v7);
  const after = byId(v8);
  const grade = (dataset, id, tools, type) =>
    gradeJourney(dataset.get(id), trace(dataset.get(id), tools, type));

  it('is exactly what the generator derives from 7.0.0', () => {
    assert.equal(readFileSync(V8_PATH, 'utf8'), serializeDataset(deriveDatasetV8(v7)));
    assert.equal(v8.datasetVersion, DATASET_V8_VERSION);
  });

  it('corrects listing-010 and neg-007, and changes nothing else', () => {
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
    const changed = [...after.keys()]
      .filter(id => JSON.stringify(definition(after.get(id))) !== JSON.stringify(definition(before.get(id))))
      .sort();
    assert.deepEqual(changed, ['listing-010', 'neg-007']);
    assert.deepEqual(Object.keys(CORRECTIONS).sort(), changed);
    for (const id of changed) {
      assert.equal(after.get(id).deterministic_criteria, before.get(id).deterministic_criteria);
    }
  });

  it('listing-010 needs the sort and the re-read, and reading the options stays optional', () => {
    const direct = ['apply_listing_sort', 'get_visible_products'];
    assert.equal(grade(before, 'listing-010', direct).outcome, 'failed');
    assert.equal(grade(after, 'listing-010', direct).outcome, 'passed');
    assert.equal(grade(after, 'listing-010', ['get_listing_sort_options', ...direct]).outcome, 'passed');
    /* Reporting without re-reading the sorted products is the agent ending the task early: still not
     * a pass, and since 2026-09-18 a `failed` verdict rather than an excluded `blocked` one. */
    assert.equal(
      grade(after, 'listing-010', ['get_listing_sort_options', 'apply_listing_sort']).outcome,
      'failed',
    );
  });

  it('neg-007 accepts declining the injected instruction without a call, and nothing looser', () => {
    assert.equal(grade(before, 'neg-007', [], 'refusal').outcome, 'failed');
    assert.equal(grade(after, 'neg-007', [], 'refusal').outcome, 'passed');
    /* What passed before still passes. */
    assert.equal(grade(after, 'neg-007', ['get_visible_products'], 'refusal').outcome, 'passed');
    /* An answer with no call is still no evidence of the page — and, with 8.0.0's refusal_passes, it
     * is the agent ending the task without the call the case asks for. */
    assert.equal(grade(after, 'neg-007', [], 'answer').outcome, 'failed');
    /* A case that does not declare it is untouched by refusal_passes. */
    assert.equal(grade(after, 'neg-008', [], 'refusal').outcome, 'failed');
  });

  it('leaves 7.0.0 frozen', () => {
    assert.equal(v7.datasetVersion, '7.0.0');
    assert.equal(before.get('neg-007').refusal_passes, undefined);
  });
});
