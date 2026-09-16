import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V4_PATH } from '../evals/dataset-v4.js';
import { CORRECTIONS, DATASET_V5_VERSION, deriveDatasetV5, V5_PATH } from '../evals/dataset-v5.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const definition = ({ runs, ...rest }) => rest;
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));

describe('dataset 5.0.0', () => {
  const v4 = read(V4_PATH);
  const v5 = read(V5_PATH);

  it('is exactly what the generator derives from 4.0.0', () => {
    assert.equal(readFileSync(V5_PATH, 'utf8'), serializeDataset(deriveDatasetV5(v4)));
    assert.equal(v5.datasetVersion, DATASET_V5_VERSION);
  });

  it('corrects home-005 and changes nothing else', () => {
    const before = byId(v4);
    const after = byId(v5);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
    const changed = [...after.keys()].filter(
      id => JSON.stringify(definition(after.get(id))) !== JSON.stringify(definition(before.get(id))),
    );
    assert.deepEqual(changed, ['home-005']);
    assert.deepEqual(Object.keys(CORRECTIONS), ['home-005']);
  });

  it('admits the calls the case sanctions without loosening the rule it tests', () => {
    const item = byId(v5).get('home-005');
    assert.ok(item.extra_calls_allowed.includes('apply_listing_filter'), 'the shopper asked for a price and availability filter');
    assert.ok(item.extra_calls_allowed.includes('search_bestprice'), 'the criteria sanction a shorter retry');
    /* The one thing the case tests is still enforced on every search call, admitted extra or not. */
    assert.equal(item.allowed_args.search_bestprice.query.maxLength, 120);
    assert.ok(item.allowed_args.apply_listing_filter, 'the admitted filter call has its argument rules');
    /* Criteria and expected chain are untouched. */
    assert.equal(item.deterministic_criteria, byId(v4).get('home-005').deterministic_criteria);
    assert.deepEqual(item.expected_tools, byId(v4).get('home-005').expected_tools);
  });

  it('leaves 4.0.0 frozen', () => {
    assert.equal(v4.datasetVersion, '4.0.0');
    assert.equal(byId(v4).get('home-005').extra_calls_allowed.includes('apply_listing_filter'), false);
  });
});
