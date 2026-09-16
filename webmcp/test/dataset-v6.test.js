import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V5_PATH } from '../evals/dataset-v5.js';
import { CORRECTIONS, DATASET_V6_VERSION, deriveDatasetV6, V6_PATH } from '../evals/dataset-v6.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const definition = ({ runs, ...rest }) => rest;
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));

describe('dataset 6.0.0', () => {
  const v5 = read(V5_PATH);
  const v6 = read(V6_PATH);

  it('is exactly what the generator derives from 5.0.0', () => {
    assert.equal(readFileSync(V6_PATH, 'utf8'), serializeDataset(deriveDatasetV6(v5)));
    assert.equal(v6.datasetVersion, DATASET_V6_VERSION);
  });

  it('corrects listing-011 and changes nothing else', () => {
    const before = byId(v5);
    const after = byId(v6);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
    const changed = [...after.keys()]
      .filter(id => JSON.stringify(definition(after.get(id))) !== JSON.stringify(definition(before.get(id))))
      .sort();
    assert.deepEqual(changed, ['listing-011']);
    assert.deepEqual(Object.keys(CORRECTIONS).sort(), changed);
  });

  it('listing-011 expects the rejection its criteria rest on, and reading the options stays optional', () => {
    const item = byId(v6).get('listing-011');
    assert.deepEqual(item.expected_tools, ['apply_listing_sort']);
    assert.ok(item.extra_calls_allowed.includes('get_listing_sort_options'));
    assert.equal(item.deterministic_criteria, byId(v5).get('listing-011').deterministic_criteria);
  });

  it('leaves multi-006 on its 5.0.0 encoding, because the grader cannot express both of its terminals', () => {
    /* expected_tools [] would make it a refusal case (isRefusalCase), failing a grounded answer; the
     * 5.0.0 encoding blocks a clarification instead. Neither is right, so it is not changed here. */
    assert.deepEqual(byId(v6).get('multi-006'), byId(v5).get('multi-006'));
  });

  it('leaves 5.0.0 frozen', () => {
    assert.equal(v5.datasetVersion, '5.0.0');
    assert.deepEqual(byId(v5).get('multi-006').expected_tools, ['search_bestprice']);
  });
});
