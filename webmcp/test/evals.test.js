import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PAGE_TOOL_NAMES, TOOL_NAMES } from '../src/contracts.js';
import { validateEvidenceFile, validateRunRecord } from '../evals/run-evidence.js';

const read = version =>
  JSON.parse(
    readFileSync(new URL(`../evals/natural-language-cases.v${version}.json`, import.meta.url), 'utf8'),
  );
const readEvidence = version =>
  JSON.parse(readFileSync(new URL(`../evals/runs.v${version}.json`, import.meta.url), 'utf8'));

/* A definition is what the case *is*; `runs` is where evidence used to be
 * crammed. Definitions are compared without it, so recording a real run can
 * never require editing a published case. */
const definitionOf = item => {
  const { runs, ...definition } = item;
  return definition;
};

/* 1.0.0 is frozen: its cases and empty run logs stay exactly as imported.
 * 2.0.0 is the current dataset and carries every 1.0.0 case unchanged. */
const v1 = read(1);
const v2 = read(2);
const DATASETS = [
  {
    version: 1,
    dataset: v1,
    size: 43,
    split: { homepage: 6, listing: 12, product: 10, negative: 8, multi_step: 7 },
  },
  {
    version: 2,
    dataset: v2,
    size: 47,
    split: { homepage: 6, listing: 12, product: 12, negative: 9, multi_step: 8 },
  },
];
const GROUP_PAGES = { homepage: 'home', listing: 'listing', product: 'product' };
const groupCounts = dataset => {
  const counts = {};
  for (const item of dataset.cases) counts[item.group] = (counts[item.group] ?? 0) + 1;
  return counts;
};

describe('natural-language evaluation dataset', () => {
  for (const { version, dataset, size, split } of DATASETS) {
    it(`v${version} has the documented size and group split`, () => {
      assert.equal(dataset.dataset, 'webmcp-natural-language-cases');
      assert.equal(dataset.datasetVersion, `${version}.0.0`);
      assert.equal(dataset.cases.length, size);
      assert.deepEqual(groupCounts(dataset), split);
    });

    it(`v${version} uses unique ids, both prompt languages, and only bestprice.gr start URLs`, () => {
      const ids = dataset.cases.map(item => item.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const item of dataset.cases) {
        assert.ok(item.prompt_el?.length > 0, item.id);
        assert.ok(item.prompt_en?.length > 0, item.id);
        assert.match(item.starting_url, /^https:\/\/www\.bestprice\.gr\//u, item.id);
        assert.ok(Array.isArray(item.runs), item.id);
      }
    });

    it(`v${version} only references tools that exist and that the starting page exposes`, () => {
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
  }

  it('carries every 1.0.0 definition into 2.0.0 unchanged', () => {
    const byId = new Map(v2.cases.map(item => [item.id, item]));
    for (const item of v1.cases) {
      assert.deepEqual(
        definitionOf(byId.get(item.id)),
        definitionOf(item),
        `${item.id} drifted between dataset versions`
      );
    }
    assert.equal(v2.sourceContracts.includes('14 contextual tools'), true);
    assert.equal(v1.sourceContracts.includes('13 contextual tools'), true);
  });

  it('keeps execution evidence out of the frozen definitions', () => {
    for (const dataset of [v1, v2]) {
      for (const item of dataset.cases) {
        assert.deepEqual(item.runs, [], `${item.id} carries evidence inside a frozen definition`);
      }
    }

    /* The evidence store is where a real run goes. It is validated against the
     * current dataset, and the validator itself is exercised both ways so an
     * empty file cannot hide a broken check. */
    const evidence = readEvidence(2);
    const knownCaseIds = new Set(v2.cases.map(item => item.id));
    assert.deepEqual(validateEvidenceFile(evidence, knownCaseIds), []);
    assert.equal(evidence.casesRef, 'natural-language-cases.v2.json');

    const usable = {
      caseId: 'product-011',
      datasetVersion: '2.0.0',
      agent: 'Model Context Tool Inspector',
      model: 'example-agent-1',
      browser: 'Chromium 144',
      implementationRevision: 'a'.repeat(40),
      date: '2026-09-12',
      outcome: 'passed',
      evidence: 'artifacts/product-011-run1.json',
    };
    assert.equal(validateRunRecord(usable, knownCaseIds), null);
    assert.match(validateRunRecord({ ...usable, caseId: 'product-999' }, knownCaseIds), /unknown case id/u);
    assert.match(validateRunRecord({ ...usable, outcome: 'maybe' }, knownCaseIds), /outcome/u);
    assert.match(validateRunRecord({ ...usable, date: '12/09/2026' }, knownCaseIds), /YYYY-MM-DD/u);
    assert.match(validateRunRecord({ ...usable, evidence: '' }, knownCaseIds), /evidence/u);
    assert.deepEqual(validateEvidenceFile({ runs: [usable, { caseId: 'nope' }] }, knownCaseIds), [
      'runs[1]: datasetVersion must be a non-empty string',
    ]);
  });

  it('covers the item-page action verb on the product page', () => {
    const showOffer = v2.cases.filter(item => item.expected_tools.includes('show_offer'));
    assert.ok(showOffer.length >= 4, 'the action verb needs named, refused, and journey coverage');
    assert.ok(showOffer.every(item => item.page === 'product'));
    assert.ok(
      showOffer.some(item => item.expected_tools.length === 1 && item.expected_tools[0] === 'show_offer'),
      'a case must exercise show_offer without a preceding read',
    );
    assert.ok(
      showOffer.some(item => item.group === 'negative'),
      'a case must pin the refusal when the named merchant is not rendered',
    );
    for (const item of showOffer) {
      assert.ok(
        item.prohibited_behavior.some(line => /merchant URL|merchant page|BestPrice page/u.test(line)),
        `${item.id} must prohibit leaving the page or exposing a merchant link`,
      );
    }
  });
});
