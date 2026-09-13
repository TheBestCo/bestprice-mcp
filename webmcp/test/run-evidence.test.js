import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEMO_LEDGER_PATH, DEMO_ROOT } from '../evals/driver.js';
import { currentRevision } from '../evals/git-baseline.js';
import {
  auditRunEvidence,
  caseDigestIndex,
  DEFAULT_ARTIFACT_ROOT,
  implementationFingerprint,
  NATIVE_EVIDENCE_LAYER,
  printAuditTable,
  sha256,
  validateEvidenceFile,
  validateRunRecord,
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
  evidenceLayer: NATIVE_EVIDENCE_LAYER,
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

/* The modality guard: a deterministic, in-memory or simulated execution has a valid shape, a real
 * timestamp and a matching digest, and is still not evidence about an agent. It has to be rejected
 * on what it declares about itself, and the audit has to report that rejection. */
describe('native evidence modality', () => {
  const demoRecord = (overrides = {}) =>
    execution({
      evidenceLayer: 'demo',
      agent: 'BestPrice WebMCP Test Driver',
      model: 'deterministic-v2',
      browser: 'Node.js 20 / In-Memory',
      ...overrides,
    });

  it('accepts a realistic native record from every browser engine the contract names', () => {
    const browsers = [
      'Chromium 144',
      'Chrome 141.0.7390.55',
      'Google Chrome 141',
      'Microsoft Edge 140',
      'Firefox 143',
      'Safari 18.6',
    ];
    browsers.forEach((browser, index) => {
      const [record] = store(`native-${index}.json`, [execution({ browser })]);
      assert.equal(validateRunRecord(record, context()), null, `${browser} must be native evidence`);
    });
  });

  it('rejects a deterministic record and names the modality that is not evidence', () => {
    /* The exact record the demo driver produces: in-memory browser, test-driver agent, scripted
     * result. Every one of those three fields declares a non-browser execution. */
    const problems = validateEvidenceFile(ledger([demoRecord()]), context());
    assert.equal(problems.length, 1);
    assert.match(problems[0], /evidenceLayer 'demo' is a non-native modality/u);
    assert.match(problems[0], /only 'native'/u);

    /* Each field is a guard on its own: a record that only edits one of them is still rejected. */
    for (const [broken, message] of [
      [{ evidenceLayer: 'demo' }, /evidenceLayer 'demo' is a non-native modality/u],
      [{ evidenceLayer: 'deterministic' }, /non-native modality/u],
      [{ evidenceLayer: 'in-memory' }, /non-native modality/u],
      [{ evidenceLayer: '' }, /evidenceLayer must be 'native'/u],
      [{ evidenceLayer: undefined }, /evidenceLayer must be 'native'/u],
      [
        { browser: 'Node.js 20 / In-Memory' },
        /browser "Node\.js 20 \/ In-Memory" declares a non-native execution modality/u,
      ],
      [{ browser: 'jsdom 24' }, /non-native execution modality/u],
      [{ browser: 'Simulated Chromium 144' }, /non-native execution modality/u],
      [{ browser: 'Chromium 144 (deterministic fixture)' }, /non-native execution modality/u],
      [{ agent: 'BestPrice WebMCP Test Driver' }, /agent .* declares a non-native execution modality/u],
      [{ agent: 'Test Driver' }, /declares a non-native execution modality/u],
      [{ agent: 'Test' }, /must name the real tool or host/u],
      [{ agent: 'unknown' }, /must name the real tool or host/u],
      [{ model: 'deterministic-v2' }, /model "deterministic-v2" declares a non-native execution modality/u],
      /* A harness that drives a real browser but asks a stub to pick the tool is not a real agent
       * run either: the name is the only thing that says who chose, so it has to be honest. */
      [{ agent: 'Smoke Harness' }, /declares a non-native execution modality/u],
      [{ agent: 'stub-planner' }, /declares a non-native execution modality/u],
      [{ model: 'mock-agent-1' }, /declares a non-native execution modality/u],
      [{ agent: 'Fake Inspector' }, /declares a non-native execution modality/u],
      [{ agent: 'placeholder-agent' }, /declares a non-native execution modality/u],
      [{ browser: 'Chromium' }, /must name a real browser engine and its version/u],
      [{ browser: 'Headless' }, /must name a real browser engine and its version/u],
      [{ browser: 'Playwright 1.50' }, /must name a real browser engine and its version/u],
    ]) {
      assert.match(
        validateRunRecord({ ...execution(), ...broken }, context()) ?? '',
        message,
        JSON.stringify(broken),
      );
    }
  });

  it('rejects an artifact whose execution admits a different modality than the record', () => {
    /* The laundering attempt: a native-looking ledger record citing an artifact that still says it
     * was an in-memory demo run. The artifact's execution is part of the identity, not a footnote. */
    const bytes = JSON.stringify(
      { artifactVersion: 1, executions: [execution({ evidenceLayer: 'demo' })] },
      null,
      2,
    );
    writeFileSync(join(ARTIFACT_DIR, 'laundered.json'), bytes);
    const record = { ...execution(), evidence: 'artifacts/laundered.json', evidenceDigest: sha256(bytes) };
    assert.deepEqual(validateEvidenceFile(ledger([record]), context()), [
      `runs[0]: artifacts/laundered.json execution ${record.runId} disagrees with the record on evidenceLayer`,
    ]);
  });

  it('rejects a whole ledger of deterministic runs instead of counting them', () => {
    const cases = {
      dataset: 'webmcp-natural-language-cases',
      datasetVersion: DATASET_VERSION,
      cases: [{ id: CASE_ID, group: 'product', runs: [] }],
    };
    const runs = [demoRecord(), demoRecord({ runId: 'run-2026-09-12-product-011-2' })];
    const result = auditRunEvidence(ledger(runs), cases, { artifactRoot: null, strict: true });

    assert.equal(result.totalRuns, 2);
    assert.equal(result.nativeRuns, 0);
    assert.equal(result.nonNativeRuns, 2);
    assert.equal(result.nativeOnly, false);
    assert.equal(result.schemaValid, false);
    assert.equal(result.releaseReady, false, 'deterministic runs must never make a release ready');
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.evidenceLayers, { demo: 2 });
    for (const problem of result.problems) assert.match(problem, /native/u);
  });

  it('reports the modality in the audit table so a demo run cannot be silently promoted', () => {
    const cases = {
      dataset: 'webmcp-natural-language-cases',
      datasetVersion: DATASET_VERSION,
      cases: [{ id: CASE_ID, group: 'product', runs: [] }],
    };
    const result = auditRunEvidence(ledger([demoRecord()]), cases, { artifactRoot: null, strict: true });

    const stdout = [];
    const stderr = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => stdout.push(args.join(' '));
    console.error = (...args) => stderr.push(args.join(' '));
    try {
      printAuditTable(result);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const output = stdout.join('\n');
    assert.match(output, /Evidence Modality:\s+NOT NATIVE \(demo×1\)/u);
    assert.match(output, /Native Run Records: 0\/1/u);
    assert.match(output, /Release Ready:\s+NO/u);
    assert.match(stderr.join('\n'), /non-native run record\(s\)/u);
  });

  it('keeps the quarantined demo store out of the native evidence store', () => {
    /* Two stores, two roots: the ledger resolves `artifacts/…` against the committed native store,
     * and nothing about the demo directory is reachable from it. */
    assert.equal(DEFAULT_ARTIFACT_ROOT, fileURLToPath(new URL('../evals/artifacts/', import.meta.url)));
    assert.equal(DEFAULT_ARTIFACT_ROOT.includes('demo'), false);
    assert.equal(DEMO_ROOT.startsWith(DEFAULT_ARTIFACT_ROOT), false);
    assert.equal(DEMO_LEDGER_PATH.startsWith(DEMO_ROOT), true);
    assert.equal(DEMO_LEDGER_PATH.includes(`${join('evals', 'demo')}`), true);
    assert.notEqual(DEMO_LEDGER_PATH, fileURLToPath(new URL('../evals/runs.v2.json', import.meta.url)));

    /* The quarantine keeps the directory and ignores its bytes: without this file a `git add -A`
     * would stage every deterministic run as if it were native evidence. */
    const ignoreFile = join(DEMO_ROOT, '.gitignore');
    assert.equal(existsSync(ignoreFile), true, 'webmcp/evals/demo must carry its own .gitignore');
    const ignoreRules = readFileSync(ignoreFile, 'utf8');
    assert.match(ignoreRules, /^\*$/mu, 'the demo store must ignore every byte it holds');
    assert.match(ignoreRules, /^!\.gitignore$/mu, 'the directory itself must survive the ignore');

    /* No deterministic bytes in the native store, whatever ran before. */
    const nativeRuns = existsSync(DEFAULT_ARTIFACT_ROOT)
      ? readdirSync(DEFAULT_ARTIFACT_ROOT).filter(name => name.startsWith('run-'))
      : [];
    assert.deepEqual(nativeRuns, [], 'the native artifact store must not hold a deterministic run');

    /* A demo artifact that exists on disk is not evidence: citing it as `artifacts/…` finds
     * nothing in the native store, and citing it as `demo/…` is not a native evidence path. */
    const [base] = store('base-for-citation.json', [execution()]);
    const demoFiles = existsSync(DEMO_ROOT)
      ? readdirSync(DEMO_ROOT).filter(name => /^run-.*\.json$/u.test(name))
      : [];
    for (const name of demoFiles.slice(0, 2)) {
      assert.equal(
        existsSync(join(DEFAULT_ARTIFACT_ROOT, name)),
        false,
        `${name} must not be in the native store`,
      );
      assert.deepEqual(
        validateEvidenceFile(ledger([{ ...base, evidence: `artifacts/${name}` }]), context()),
        [`runs[0]: evidence artifact artifacts/${name} does not exist in the evidence store`],
      );
      assert.match(
        validateRunRecord({ ...base, evidence: `demo/${name}` }, context()) ?? '',
        /evidence must be a path under artifacts\/ with no traversal/u,
      );
    }
  });

  it('rejects the quarantined demo ledger in full when this checkout has one', {
    skip: !existsSync(DEMO_LEDGER_PATH),
  }, () => {
    const demoLedger = JSON.parse(readFileSync(DEMO_LEDGER_PATH, 'utf8'));
    const result = auditRunEvidence(demoLedger, v2, {
      artifactRoot: fileURLToPath(new URL('../evals/', import.meta.url)),
      strict: true,
    });

    assert.equal(demoLedger.runs.length > 0, true);
    assert.equal(result.totalRuns, demoLedger.runs.length);
    assert.equal(result.nativeRuns, 0, 'not one quarantined demo run may count as native evidence');
    assert.equal(result.nonNativeRuns, demoLedger.runs.length);
    assert.equal(result.releaseReady, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.problems.length, demoLedger.runs.length);
    for (const problem of result.problems) {
      assert.match(problem, /evidenceLayer 'demo' is a non-native modality/u);
    }
  });
});
