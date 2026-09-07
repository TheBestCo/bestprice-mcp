import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PAGE_TOOL_NAMES, TOOL_NAMES } from '../src/contracts.js';

const dataset = JSON.parse(
  readFileSync(new URL('../evals/natural-language-cases.v1.json', import.meta.url), 'utf8'),
);
const GROUP_PAGES = { homepage: 'home', listing: 'listing', product: 'product' };

describe('natural-language evaluation dataset', () => {
  it('has the documented size and group split', () => {
    assert.equal(dataset.datasetVersion, '1.0.0');
    assert.equal(dataset.cases.length, 43);
    const counts = {};
    for (const item of dataset.cases) counts[item.group] = (counts[item.group] ?? 0) + 1;
    assert.deepEqual(counts, { homepage: 6, listing: 12, product: 10, negative: 8, multi_step: 7 });
  });

  it('uses unique ids, both prompt languages, and only bestprice.gr start URLs', () => {
    const ids = dataset.cases.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of dataset.cases) {
      assert.ok(item.prompt_el?.length > 0, item.id);
      assert.ok(item.prompt_en?.length > 0, item.id);
      assert.match(item.starting_url, /^https:\/\/www\.bestprice\.gr\//u, item.id);
      assert.ok(Array.isArray(item.runs), item.id);
    }
  });

  it('only references tools that exist and that the starting page exposes', () => {
    for (const item of dataset.cases) {
      for (const name of item.expected_tools) {
        assert.ok(TOOL_NAMES.includes(name), `${item.id} expects unknown tool ${name}`);
      }
      if (item.group in GROUP_PAGES) {
        const exposed = PAGE_TOOL_NAMES[GROUP_PAGES[item.group]];
        for (const name of item.expected_tools) {
          assert.ok(exposed.includes(name), `${item.id} expects ${name}, not exposed on ${item.group}`);
        }
      }
      for (const name of Object.keys(item.allowed_args ?? {})) {
        assert.ok(TOOL_NAMES.includes(name), `${item.id} constrains unknown tool ${name}`);
      }
    }
  });
});
