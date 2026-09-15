import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { currentRevision } from '../evals/git-baseline.js';
import { adoptStartUrl, servedReceipt, stepEvidence } from '../evals/native-evidence.js';
import {
  auditRunEvidence,
  caseDigest,
  implementationFingerprint,
  NATIVE_EVIDENCE_LAYER,
  sha256,
} from '../evals/run-evidence.js';
import { reviewDigest } from '../evals/task-review.js';

/* Audit pass 8: F02 (transitions and canonical starts), F04 (policy evidence), F08 (served receipt). */

describe('the start page a run continues from', () => {
  it('adopts a canonical redirect of the same page', () => {
    assert.equal(
      adoptStartUrl(
        'https://www.bestprice.gr/item/2159919913/old-slug.html',
        'https://www.bestprice.gr/item/2159919913/apple-iphone-16.html',
      ),
      'https://www.bestprice.gr/item/2159919913/apple-iphone-16.html',
    );
    assert.equal(
      adoptStartUrl(
        'https://www.bestprice.gr/search?q=iphone',
        'https://www.bestprice.gr/search?q=iphone&o=1',
      ),
      'https://www.bestprice.gr/search?q=iphone&o=1',
    );
  });
  it('refuses a landing on another product, origin or scheme', () => {
    const requested = 'https://www.bestprice.gr/item/2159919913/x.html';
    for (const reported of [
      'https://www.bestprice.gr/item/2159922965/x.html',
      'https://merchant.example/item/2159919913/x.html',
      'http://www.bestprice.gr/item/2159919913/x.html',
      'https://www.bestprice.gr/',
      'not a url',
    ]) {
      assert.equal(adoptStartUrl(requested, reported), null, reported);
    }
  });
});

describe('step evidence', () => {
  it('keeps a lost result absent and records the transition and document identities', () => {
    const step = stepEvidence({
      invocationId: 'inv-3',
      payload: null,
      payloadStatus: 'lost_to_navigation',
      transition: {
        kind: 'new_document',
        fromUrl: 'https://www.bestprice.gr/',
        toUrl: 'https://www.bestprice.gr/search?q=tv',
        fromDocument: 'doc-1',
        toDocument: 'doc-2',
      },
    });
    assert.equal(step.result, null);
    assert.equal(step.payloadStatus, 'lost_to_navigation');
    assert.equal(step.navigatedTo, 'https://www.bestprice.gr/search?q=tv');
    assert.equal(step.transition.toDocument, 'doc-2');
  });
  it('records policy interventions by class only and drops anything outside the vocabulary', () => {
    const step = stepEvidence({
      payload: { ok: true },
      policy: [
        {
          kind: 'navigation_blocked',
          frame: 'main',
          destination: 'external_origin',
          url: 'https://m.example/?sig=secret',
        },
        { kind: 'navigation_blocked', frame: 'main', destination: 'https://m.example/' },
        { kind: 'something_else', frame: 'main', destination: 'external_origin' },
      ],
    });
    assert.deepEqual(step.policy, [
      { kind: 'navigation_blocked', frame: 'main', destination: 'external_origin' },
    ]);
    assert.doesNotMatch(JSON.stringify(step), /secret|m\.example/u);
    assert.equal(stepEvidence({ payload: { ok: true } }).payloadStatus, 'returned');
    assert.equal(stepEvidence({}).payloadStatus, 'missing');
  });
});

const script = (path, digit) => ({ url: `https://www.bestprice.gr${path}?v=123`, sha256: digit.repeat(64) });
const served = (overrides = {}) => ({
  origin: 'https://www.bestprice.gr',
  storefrontRelease: '20260915.1432',
  scripts: [script('/dist/item.js', 'a'), script('/dist/common.js', 'b')],
  discovery: { url: 'https://www.bestprice.gr/webmcp.json', sha256: 'c'.repeat(64) },
  gatewayRevision: '4c598de07b5c1bf67c5f1d9a3a56f18a86d778b2',
  ...overrides,
});

describe('served-implementation receipt', () => {
  it('names the served build independently of the page a journey starts on', () => {
    const receipt = servedReceipt(served());
    assert.equal(receipt.complete, true);
    const listing = servedReceipt(served({ scripts: [script('/dist/search.js', 'd')] }));
    assert.equal(listing.digest, receipt.digest);
    assert.equal(listing.scripts[0].url, 'https://www.bestprice.gr/dist/search.js');
  });
  it('changes when the storefront release, manifest or gateway changes', () => {
    const base = servedReceipt(served()).digest;
    assert.notEqual(servedReceipt(served({ storefrontRelease: '20260916.0900' })).digest, base);
    assert.notEqual(
      servedReceipt(
        served({ discovery: { url: 'https://www.bestprice.gr/webmcp.json', sha256: 'e'.repeat(64) } }),
      ).digest,
      base,
    );
    assert.notEqual(servedReceipt(served({ gatewayRevision: 'f'.repeat(40) })).digest, base);
  });
  it('is incomplete when any part could not be read, or the release changed mid-run', () => {
    assert.equal(servedReceipt(served({ gatewayRevision: null })).complete, false);
    assert.equal(servedReceipt(served({ storefrontRelease: 0 })).complete, false);
    assert.equal(servedReceipt(served({ discovery: null })).complete, false);
    const moved = servedReceipt(served(), { releasesSeen: ['20260915.1432', '20260915.1510'] });
    assert.equal(moved.complete, false);
    assert.equal(moved.changedDuringRun, true);
    assert.equal(servedReceipt(served(), { releasesSeen: ['20260915.1432'] }).complete, true);
    assert.equal(servedReceipt(null), null);
  });
});

describe('release gate: one served implementation', () => {
  const root = mkdtempSync(join(tmpdir(), 'webmcp-served-'));
  mkdirSync(join(root, 'artifacts'));
  after(() => rmSync(root, { recursive: true, force: true }));
  const definition = {
    id: 'served-001',
    group: 'product',
    expected_tools: ['read'],
    sequence_mode: 'ordered',
  };
  const dataset = { datasetVersion: '2.0.0', cases: [definition] };
  const revision = currentRevision() ?? 'a'.repeat(40);
  const fingerprint = implementationFingerprint();

  const ledgerWith = (receipts, name) => {
    const runs = [];
    const reviews = {};
    for (const [index, receipt] of receipts.entries()) {
      const runId = `run-2026-09-15-${name}-${index}`;
      const execution = {
        runId,
        caseId: definition.id,
        datasetVersion: '2.0.0',
        evidenceLayer: NATIVE_EVIDENCE_LAYER,
        agent: 'Model Context Tool Inspector',
        model: 'example-agent-1',
        browser: 'Chrome 152',
        language: 'el',
        implementationRevision: revision,
        implementationFingerprint: fingerprint,
        caseDigest: caseDigest(definition),
        startedAt: `2026-09-15T08:0${index}:00.000Z`,
        date: '2026-09-15',
        outcome: 'passed',
        steps: [{ tool: 'read', arguments: {}, result: { ok: true, price: 12 } }],
        terminal: { type: 'answer', text: '12 euros' },
        ...(receipt ? { servedImplementation: receipt } : {}),
      };
      const bytes = JSON.stringify({ artifactVersion: 1, executions: [execution] });
      writeFileSync(join(root, 'artifacts', `${runId}.json`), bytes);
      const { steps, terminal, servedImplementation, ...record } = execution;
      runs.push({ ...record, evidence: `artifacts/${runId}.json`, evidenceDigest: sha256(bytes) });
      reviews[runId] = {
        digest: reviewDigest(definition, execution),
        reviewer: 'independent reviewer',
        taskSatisfied: true,
        grounded: true,
        rationale: 'The answer states the observed price.',
      };
    }
    return { ledger: { datasetVersion: '2.0.0', runs }, reviews };
  };
  const audit = ({ ledger, reviews }, options = {}) =>
    auditRunEvidence(ledger, dataset, {
      artifactRoot: root,
      taskReviews: reviews,
      baselineRuns: [],
      ...options,
    });

  const receipt = servedReceipt(served());
  const other = servedReceipt(served({ gatewayRevision: 'f'.repeat(40) }));

  it('is ready when every scored run exercised the same complete served build', () => {
    const result = audit(ledgerWith(Array(5).fill(receipt), 'uniform'));
    assert.deepEqual(result.problems, []);
    assert.equal(result.servedImplementation.uniform, true);
    assert.equal(result.releaseReady, true);
    assert.equal(
      audit(ledgerWith(Array(5).fill(receipt), 'pinned'), { servedDigest: receipt.digest }).releaseReady,
      true,
    );
  });
  it('is not ready when the runs exercised different builds', () => {
    const result = audit(ledgerWith([receipt, receipt, receipt, receipt, other], 'mixed'));
    assert.equal(result.servedImplementation.digests.length, 2);
    assert.equal(result.releaseReady, false);
  });
  it('is not ready when a scored run has no complete receipt', () => {
    assert.equal(
      audit(ledgerWith([receipt, receipt, receipt, receipt, null], 'missing')).releaseReady,
      false,
    );
    const partial = servedReceipt(served({ gatewayRevision: null }));
    assert.equal(
      audit(ledgerWith([receipt, receipt, receipt, receipt, partial], 'partial')).releaseReady,
      false,
    );
  });
  it('is not ready when the pinned build is not the one exercised', () => {
    assert.equal(
      audit(ledgerWith(Array(5).fill(receipt), 'unpinned'), { servedDigest: other.digest }).releaseReady,
      false,
    );
  });
});
