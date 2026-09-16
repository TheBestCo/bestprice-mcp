import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { CORRECTIONS, DATASET_V4_VERSION, deriveDatasetV4, V4_PATH } from '../evals/dataset-v4.js';
import { serializeDataset, V3_PATH } from '../evals/dataset-v3.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const withoutRuns = item => {
  const { runs, ...definition } = item;
  return definition;
};

describe('dataset 4.0.0', () => {
  const v3 = read(V3_PATH);
  const v4 = read(V4_PATH);
  const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));

  it('is exactly what the generator derives from 3.0.0', () => {
    assert.equal(readFileSync(V4_PATH, 'utf8'), serializeDataset(deriveDatasetV4(v3)));
    assert.equal(v4.datasetVersion, DATASET_V4_VERSION);
  });

  it('corrects the two unanswerable cases and changes nothing else', () => {
    /* A corrected benchmark is only honest if the correction is confined to what was broken. Every
     * other case definition must be byte-identical to 3.0.0, and the set of corrected ids must be
     * exactly the set the generator declares. */
    const before = byId(v3);
    const after = byId(v4);
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'same 47 case ids');

    const changed = [...after.keys()].filter(
      id => JSON.stringify(withoutRuns(after.get(id))) !== JSON.stringify(withoutRuns(before.get(id))),
    );
    assert.deepEqual(changed.sort(), Object.keys(CORRECTIONS).sort());
    assert.deepEqual(changed.sort(), ['neg-003', 'product-012']);
  });

  it('product-012 now names the shop it asks for, in both languages', () => {
    const item = byId(v4).get('product-012');
    const named = /«([^»]+)»/u.exec(item.prompt_el)?.[1];
    assert.ok(named, 'the Greek prompt names a merchant');
    assert.ok(item.prompt_en.includes(named), 'the English prompt names the same merchant');
    assert.deepEqual(item.expected_tools, ['show_offer'], 'still a show_offer case');
  });

  it('neg-003 expects no tool, matching its own terminal-only criteria', () => {
    const item = byId(v4).get('neg-003');
    assert.deepEqual(item.expected_tools, []);
    assert.match(item.deterministic_criteria, /explains/u, 'its criteria are a terminal explanation');
  });

  it('leaves 3.0.0 frozen', () => {
    assert.equal(v3.datasetVersion, '3.0.0');
    assert.deepEqual(byId(v3).get('neg-003').expected_tools, ['compare_page_offers']);
  });
});
