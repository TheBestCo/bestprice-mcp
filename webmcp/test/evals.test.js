import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { currentRevision, readTrustedBaseline } from '../evals/git-baseline.js';
import {
  caseDigestIndex,
  compareFrozenCases,
  comparePriorRecords,
  DEFAULT_ARTIFACT_ROOT,
  implementationFingerprint,
  validateEvidenceFile,
  validateRunRecord,
} from '../evals/run-evidence.js';
import { PAGE_TOOL_NAMES, TOOL_NAMES } from '../src/contracts.js';

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

/* The evidence ledger and the case files are checked against the copy the merged branch already
 * published, read out of git at the merge base. The working tree is not a baseline: whoever edits
 * a record can re-run the validator on the edited file, but not on the committed one. */
const LEDGER_PATH = 'webmcp/evals/runs.v2.json';
const casesPath = version => `webmcp/evals/natural-language-cases.v${version}.json`;

const ledgerBaseline = () => {
  const baseline = readTrustedBaseline(LEDGER_PATH);
  assert.ok(baseline, `the trusted baseline for ${LEDGER_PATH} must resolve through git`);
  assert.match(baseline.revision, /^[0-9a-f]{40}$/u, 'the baseline must be a real revision');
  assert.notEqual(baseline.text, null, `${LEDGER_PATH} must exist at the baseline`);
  return baseline;
};

/* Evidence is checked against the implementation actually checked out, so a record naming this
 * revision has to carry this revision's manifest fingerprint. */
const checkedOutImplementation = () => {
  const revision = currentRevision();
  assert.match(revision ?? '', /^[0-9a-f]{40}$/u, 'the checked-out revision must be readable');
  return { revision, fingerprint: implementationFingerprint() };
};

const evidenceContext = () => ({
  caseIds: new Set(v2.cases.map(item => item.id)),
  caseDigests: caseDigestIndex(v2),
  datasetVersion: '2.0.0',
  artifactRoot: DEFAULT_ARTIFACT_ROOT,
  implementation: checkedOutImplementation(),
  baselineRuns: JSON.parse(ledgerBaseline().text).runs,
});

/* A record the released ledger would have carried before the working copy dropped it. */
const releasedRecord = {
  runId: 'run-2026-09-12-product-011-1',
  caseId: 'product-011',
  datasetVersion: '2.0.0',
  agent: 'Model Context Tool Inspector',
  model: 'example-agent-1',
  browser: 'Chromium 144',
  implementationRevision: 'a'.repeat(40),
  implementationFingerprint: 'b'.repeat(64),
  caseDigest: caseDigestIndex(v2).get('product-011'),
  startedAt: '2026-09-12T08:14:21.000Z',
  date: '2026-09-12',
  outcome: 'passed',
  evidence: 'artifacts/product-011-run1.json',
  evidenceDigest: 'c'.repeat(64),
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
        `${item.id} drifted between dataset versions`,
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

    /* The evidence store is where a real run goes. The checked-in file is validated against the copy
     * the merged branch published, the frozen case digests, the checked-out implementation and the
     * committed artifact store — the same call CI makes, not a shape-only helper. */
    const evidence = readEvidence(2);
    const context = evidenceContext();
    assert.deepEqual(validateEvidenceFile(evidence, context), []);
    assert.equal(evidence.casesRef, 'natural-language-cases.v2.json');

    /* The per-record fixtures below exercise shape, so they run against the dataset only: the
     * artifact store is covered by the real ledger check above and by run-evidence.test.js. */
    const shapeContext = {
      caseIds: context.caseIds,
      caseDigests: context.caseDigests,
      datasetVersion: context.datasetVersion,
    };

    const usable = { ...releasedRecord };
    assert.equal(validateRunRecord(usable, shapeContext), null);
    for (const [broken, message] of [
      [{ caseId: 'product-999' }, /unknown case id/u],
      [{ datasetVersion: '1.0.0' }, /datasetVersion must be 2\.0\.0/u],
      [{ implementationRevision: 'a1b2c3d' }, /40-character revision/u],
      [{ date: '12/09/2026' }, /real calendar date/u],
      [{ date: '2026-02-30' }, /real calendar date/u],
      [{ outcome: 'maybe' }, /outcome/u],
      [{ outcome: '' }, /outcome must be a non-empty string/u],
      [{ evidence: '../../etc/passwd' }, /under artifacts/u],
      [{ evidence: 'artifacts/../secret' }, /under artifacts/u],
    ]) {
      assert.match(
        validateRunRecord({ ...usable, ...broken }, shapeContext),
        message,
        JSON.stringify(broken),
      );
    }

    /* Copying a pass must not create a second record, and deleting one must be
       visible to whoever compares against the previous store. */
    assert.deepEqual(
      validateEvidenceFile({ datasetVersion: '2.0.0', runs: [usable, usable] }, shapeContext),
      [`runs[1]: duplicate runId ${usable.runId}`],
    );
    assert.deepEqual(
      validateEvidenceFile(
        { datasetVersion: '2.0.0', runs: [] },
        { ...shapeContext, previousRunIds: [usable.runId] },
      ),
      [`run ${usable.runId} was removed; evidence is append-only`],
    );
  });

  it('checks the checked-in ledger against the copy the merged branch published', () => {
    const evidence = readEvidence(2);
    const priorRuns = JSON.parse(ledgerBaseline().text).runs;

    /* The artifact store the real check resolves `artifacts/…` against is a committed directory. */
    assert.equal(existsSync(DEFAULT_ARTIFACT_ROOT), true, 'the committed artifact store must exist');

    /* Unchanged ledger: every published record is still there, untouched. */
    assert.deepEqual(validateEvidenceFile(evidence, evidenceContext()), []);

    /* The released ledger carried a record the working copy no longer has. That deletion is caught
     * by the real file check, with the real store, not only by a synthetic fixture. The checked-in
     * runs array is empty today, so the released baseline is the committed copy plus that record —
     * from the first committed record onward the committed copy carries it for real. */
    assert.deepEqual(
      validateEvidenceFile(evidence, { ...evidenceContext(), baselineRuns: [...priorRuns, releasedRecord] }),
      [`run ${releasedRecord.runId} was removed; evidence is append-only`],
    );

    /* Rewriting that record in place (a failure turned into a pass under the same runId) is the
     * same class of change: the comparison is over complete canonical records, not just ids. */
    const rewritten = { ...releasedRecord, outcome: 'failed' };
    assert.deepEqual(comparePriorRecords([releasedRecord], [rewritten]), [
      `run ${releasedRecord.runId} was modified in place; append a corrected record instead`,
    ]);
  });

  it('keeps both frozen case files identical to the copy the merged branch published', () => {
    for (const [version, dataset] of [
      [1, v1],
      [2, v2],
    ]) {
      const relative = casesPath(version);
      const baseline = readTrustedBaseline(relative);
      assert.ok(baseline?.text, `${relative} must exist at the trusted baseline`);
      assert.deepEqual(compareFrozenCases(dataset, JSON.parse(baseline.text), `v${version}`), []);
    }

    /* The guard is not decorative: a published prompt that changes, or a case that disappears,
     * fails against the same baseline. */
    const drifted = structuredClone(v1);
    drifted.cases[0].prompt_el = `${drifted.cases[0].prompt_el} `;
    assert.deepEqual(compareFrozenCases(drifted, v1, 'v1'), ['v1: case home-001 changed after publication']);
    const removed = { ...structuredClone(v1), cases: v1.cases.slice(1) };
    assert.deepEqual(compareFrozenCases(removed, v1, 'v1'), [
      'v1: case home-001 was removed from the frozen dataset',
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
