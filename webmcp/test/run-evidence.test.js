import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { currentRevision } from '../evals/git-baseline.js';
import {
  caseDigestIndex,
  implementationFingerprint,
  sha256,
  validateEvidenceFile,
} from '../evals/run-evidence.js';

/* Artifacts are written to a scratch store: the checked-in ledger carries no real run yet, and a
 * fabricated execution is never committed as evidence. */
const ARTIFACT_ROOT = mkdtempSync(join(tmpdir(), 'webmcp-evidence-'));
const ARTIFACT_DIR = join(ARTIFACT_ROOT, 'artifacts');
mkdirSync(ARTIFACT_DIR, { recursive: true });
after(() => rmSync(ARTIFACT_ROOT, { recursive: true, force: true }));

const v2 = JSON.parse(
  readFileSync(new URL('../evals/natural-language-cases.v2.json', import.meta.url), 'utf8'),
);
const CASE_DIGESTS = caseDigestIndex(v2);
const CASE_ID = 'product-011';
const DATASET_VERSION = '2.0.0';
const IMPLEMENTATION = {
  revision: currentRevision() ?? 'a'.repeat(40),
  fingerprint: implementationFingerprint(),
};

const execution = (overrides = {}) => ({
  runId: 'run-2026-09-12-product-011-1',
  caseId: CASE_ID,
  datasetVersion: DATASET_VERSION,
  agent: 'Model Context Tool Inspector',
  model: 'example-agent-1',
  browser: 'Chromium 144',
  implementationRevision: IMPLEMENTATION.revision,
  implementationFingerprint: IMPLEMENTATION.fingerprint,
  caseDigest: CASE_DIGESTS.get(CASE_ID),
  startedAt: '2026-09-12T08:14:21.000Z',
  date: '2026-09-12',
  outcome: 'passed',
  ...overrides,
});

/** Writes an artifact and returns one ledger record per declared execution, all citing that file. */
const store = (name, executions) => {
  const bytes = JSON.stringify({ artifactVersion: 1, executions }, null, 2);
  writeFileSync(join(ARTIFACT_DIR, name), bytes);
  const cited = { evidence: `artifacts/${name}`, evidenceDigest: sha256(bytes) };
  return executions.map(item => ({ ...item, ...cited }));
};

const context = () => ({
  caseDigests: CASE_DIGESTS,
  datasetVersion: DATASET_VERSION,
  artifactRoot: ARTIFACT_ROOT,
  implementation: IMPLEMENTATION,
});

const ledger = runs => ({ datasetVersion: DATASET_VERSION, runs });

describe('execution evidence ledger', () => {
  it('accepts an unchanged ledger and an appended rerun', () => {
    const [published] = store('unchanged.json', [execution()]);
    assert.deepEqual(
      validateEvidenceFile(ledger([published]), { ...context(), baselineRuns: [published] }),
      [],
    );

    /* A rerun is a new record at the end, never an edit of the published one. */
    const [rerun] = store('rerun.json', [
      execution({ runId: 'run-2026-09-12-product-011-2', startedAt: '2026-09-12T09:02:11.000Z' }),
    ]);
    assert.deepEqual(
      validateEvidenceFile(ledger([published, rerun]), { ...context(), baselineRuns: [published] }),
      [],
    );
  });

  it('rejects a failure rewritten into a pass under the same runId', () => {
    const [before] = store('rewrite.json', [execution({ outcome: 'failed' })]);
    /* The rewritten ledger is internally consistent — same runId, same artifact path, artifact and
     * digest both updated — so nothing but the published baseline can catch it. */
    const [after] = store('rewrite.json', [execution({ outcome: 'passed' })]);
    assert.equal(after.runId, before.runId);
    assert.deepEqual(validateEvidenceFile(ledger([after]), context()), []);
    assert.deepEqual(validateEvidenceFile(ledger([after]), { ...context(), baselineRuns: [before] }), [
      `run ${after.runId} was modified in place; append a corrected record instead`,
    ]);
  });

  it('rejects deleting a published record', () => {
    const [first, second] = store('session.json', [
      execution(),
      execution({ runId: 'run-2026-09-12-product-011-2', startedAt: '2026-09-12T09:02:11.000Z' }),
    ]);
    assert.deepEqual(validateEvidenceFile(ledger([first, second]), context()), []);
    assert.deepEqual(validateEvidenceFile(ledger([first]), { ...context(), baselineRuns: [first, second] }), [
      `run ${second.runId} was removed; evidence is append-only`,
    ]);
  });

  it('rejects a record whose artifact does not exist', () => {
    const [template] = store('template.json', [execution()]);
    const missing = { ...template, evidence: 'artifacts/never-written.json' };
    assert.deepEqual(validateEvidenceFile(ledger([missing]), context()), [
      'runs[0]: evidence artifact artifacts/never-written.json does not exist in the evidence store',
    ]);
  });

  it('rejects an artifact whose bytes do not match the recorded digest', () => {
    const [record] = store('tampered.json', [execution()]);
    writeFileSync(
      join(ARTIFACT_DIR, 'tampered.json'),
      `${JSON.stringify({ artifactVersion: 1, executions: [] })}\n`,
    );
    assert.deepEqual(validateEvidenceFile(ledger([record]), context()), [
      `runs[0]: evidenceDigest does not match the recorded bytes of ${record.evidence}`,
    ]);
  });

  it('rejects the same artifact re-labelled under a new runId', () => {
    const [published] = store('copy.json', [execution()]);
    const relabelled = { ...published, runId: 'run-2026-09-12-product-011-2' };
    assert.deepEqual(validateEvidenceFile(ledger([relabelled]), context()), [
      `runs[0]: ${published.evidence} does not identify run ${relabelled.runId}; a shared artifact must record every run it evidences`,
    ]);
  });

  it('accepts two genuinely distinct runs recorded in one artifact file', () => {
    const [first, second] = store('two-runs.json', [
      execution(),
      execution({
        runId: 'run-2026-09-12-product-011-2',
        startedAt: '2026-09-12T09:02:11.000Z',
        browser: 'Chromium 144 (second pass)',
      }),
    ]);
    assert.equal(first.evidence, second.evidence);
    assert.deepEqual(validateEvidenceFile(ledger([first, second]), context()), []);
  });

  it('rejects one execution declared twice under two runIds', () => {
    const shared = execution();
    const [first, second] = store('duplicate.json', [
      shared,
      { ...shared, runId: 'run-2026-09-12-product-011-2' },
    ]);
    assert.deepEqual(validateEvidenceFile(ledger([first, second]), context()), [
      `runs[1]: execution identity in ${first.evidence} is already recorded as run ${first.runId}; a copy under a new runId is not a second run`,
    ]);
  });

  it('rejects an artifact whose execution disagrees with the ledger record', () => {
    const [published] = store('disagree.json', [execution({ outcome: 'failed' })]);
    const claim = { ...published, outcome: 'passed' };
    assert.deepEqual(validateEvidenceFile(ledger([claim]), context()), [
      `runs[0]: ${published.evidence} execution ${published.runId} disagrees with the record on outcome`,
    ]);
  });

  it('rejects a run bound to anything but the frozen case definition', () => {
    const [record] = store('drift.json', [execution()]);
    assert.deepEqual(validateEvidenceFile(ledger([{ ...record, caseDigest: 'd'.repeat(64) }]), context()), [
      `runs[0]: caseDigest does not match the frozen definition of ${CASE_ID}`,
    ]);
  });

  it('rejects a manifest fingerprint that does not match the revision it names', () => {
    const [record] = store('manifest.json', [execution()]);
    assert.deepEqual(
      validateEvidenceFile(ledger([{ ...record, implementationFingerprint: 'e'.repeat(64) }]), context()),
      [
        `runs[0]: implementationFingerprint does not match webmcp/src/contracts.js + webmcp/src/runtime.js at revision ${IMPLEMENTATION.revision}`,
      ],
    );
  });
});
