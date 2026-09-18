import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import {
  APPEND_ONLY_NOTE,
  appendCorrection,
  CASES_PATH,
  CORRECTIONS_LEDGER_PATH,
  GRADER,
} from '../evals/corrections.js';
import {
  adjudicateSingleCallTrace,
  deriveJourney,
  gradeJourney,
  INCOMPLETE_OUTCOME,
  isRefusalCase,
  sequenceStatus,
} from '../evals/journey.js';
import {
  auditRunEvidence,
  caseDigestIndex,
  DEFAULT_ARTIFACT_ROOT,
  validateCorrection,
  validateCorrections,
  validateEvidenceFile,
} from '../evals/run-evidence.js';

const v2 = JSON.parse(
  readFileSync(new URL('../evals/natural-language-cases.v2.json', import.meta.url), 'utf8'),
);
const CASE = id => v2.cases.find(item => item.id === id);
const DATASET_VERSION = '2.0.0';

/* The committed artifact the audit graded `passed`: one search call, a navigation, and no final
 * product-facts answer. It is the counterexample the journey grader exists for, so the tests read the
 * real bytes rather than a fixture that could be shaped to pass. */
const MULTI_001_RUNS = ['run-2026-09-13-multi-001-16be8cfc', 'run-2026-09-13-multi-001-1212da22'];
const artifactPath = runId => join(DEFAULT_ARTIFACT_ROOT, `${runId}.json`);
const correctionArtifactPath = runId => join(DEFAULT_ARTIFACT_ROOT, `${runId}.correction.json`);
const readLedger = () => JSON.parse(readFileSync(CORRECTIONS_LEDGER_PATH, 'utf8'));
const readArtifact = runId =>
  JSON.parse(readFileSync(artifactPath(runId), 'utf8')).executions.find(entry => entry.runId === runId);

const scratchStore = () => {
  const root = mkdtempSync(join(tmpdir(), 'webmcp-corrections-'));
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  return root;
};

const copy = (from, to) => writeFileSync(to, readFileSync(from));

describe('journey grading', () => {
  it('treats an ordered multi-tool case as a journey, not as a set of acceptable calls', () => {
    const definition = CASE('multi-001');
    const journey = deriveJourney(definition);
    assert.equal(journey.multiStep, true);
    assert.equal(journey.ordered, true);
    assert.deepEqual(journey.tools, [
      'search_bestprice',
      'get_visible_products',
      'open_visible_product',
      'get_page_product',
    ]);

    /* A single expected tool is a call, not a journey: the ordered-chain rule must not swallow it. */
    assert.equal(deriveJourney(CASE('home-001')).multiStep, false);
    assert.equal(deriveJourney(CASE('product-011')).multiStep, true);

    /* Every negative case is refusal-shaped; nothing is inferred from a prompt's prose. */
    assert.equal(isRefusalCase(CASE('neg-002')), true);
    assert.equal(isRefusalCase(CASE('home-001')), false);
  });

  it('grades the committed first-step-only multi-001 trace incomplete', () => {
    const definition = CASE('multi-001');
    for (const runId of MULTI_001_RUNS) {
      const execution = readArtifact(runId);
      assert.equal(execution.tool, 'search_bestprice', 'the committed trace is one search call');
      assert.equal(execution.terminal, undefined, 'the committed trace records no terminal');

      /* The old evaluator asked for one call and checked membership in `expected_tools`, so this
       * trace was `passed`. As a journey it is an unfinished task. */
      const graded = adjudicateSingleCallTrace(definition, {
        tool: execution.tool,
        args: execution.arguments,
        result: execution.result,
        terminal: execution.terminal,
      });
      assert.equal(graded.outcome, INCOMPLETE_OUTCOME);
      assert.equal(graded.sequence, 'partial');
      assert.equal(graded.complete, false);
      assert.equal(graded.steps, 1);
      assert.equal(graded.journey.tools.length, 4);
      assert.match(graded.reason, /no terminal answer or refusal/u);
      assert.match(graded.reason, /1 of 4 expected tool calls/u);
    }
  });

  it('never passes an unfinished ordered journey, however good the steps were', () => {
    const definition = CASE('multi-001');
    const step = (tool, result = { ok: true }) => ({ tool, args: {}, result });
    const answer = { type: 'answer', text: 'iPhone 16: 6.1", 128GB.' };

    /* The prefix that the committed artifact recorded, now with a terminal: the agent answered, but
     * I did not finish the task, so the answer cannot make the journey complete. Because the agent
     * declared itself done, this is a verdict about the agent — `failed` — and not an unfinished
     * journey: `blocked` would exclude it from the release fraction (changed 2026-09-18). */
    const prefix = gradeJourney(definition, { steps: [step('search_bestprice')], terminal: answer });
    assert.equal(prefix.outcome, 'failed');
    assert.match(prefix.reason, /ended the task after 1 of 4 required tool calls/u);
    assert.equal(prefix.complete, false);

    /* Three of four in order is still unfinished... */
    const nearly = gradeJourney(definition, {
      steps: [step('search_bestprice'), step('get_visible_products'), step('open_visible_product')],
      terminal: answer,
    });
    assert.equal(nearly.outcome, 'failed');
    assert.equal(nearly.sequence, 'partial');

    /* ... and without a terminal the completed chain is unfinished too: the shopper never got an
     * answer, which is the half of the task the single-call evaluator could not see. */
    const silent = gradeJourney(definition, {
      steps: [
        step('search_bestprice'),
        step('get_visible_products'),
        step('open_visible_product'),
        step('get_page_product'),
      ],
    });
    assert.equal(silent.outcome, INCOMPLETE_OUTCOME);
    assert.match(silent.reason, /no terminal/u);

    /* Only the whole chain plus a terminal passes. */
    const complete = gradeJourney(definition, {
      steps: [
        step('search_bestprice'),
        step('get_visible_products'),
        step('open_visible_product'),
        step('get_page_product', {
          ok: true,
          product_id: '2159919913',
          title: 'iPhone 16',
          category: 'Κινητά',
        }),
      ],
      terminal: answer,
    });
    assert.equal(complete.outcome, 'passed');
    assert.equal(complete.complete, true);
    assert.equal(complete.sequence, 'complete');
  });

  it('rejects a reordered, substituted or unsafe journey instead of passing it', () => {
    const definition = CASE('multi-001');
    const step = tool => ({ tool, args: {}, result: { ok: true } });
    const answer = { type: 'answer', text: 'done' };

    /* Out of order: the same four tools, one swap. */
    const reordered = gradeJourney(definition, {
      steps: [
        step('search_bestprice'),
        step('open_visible_product'),
        step('get_visible_products'),
        step('get_page_product'),
      ],
      terminal: answer,
    });
    assert.equal(reordered.outcome, 'failed');
    assert.equal(reordered.sequence, 'mismatch');

    /* A substitution is not the frozen chain either. */
    const substituted = gradeJourney(definition, {
      steps: [
        step('search_bestprice'),
        step('get_visible_products'),
        step('compare_page_offers'),
        step('get_page_product'),
      ],
      terminal: answer,
    });
    assert.equal(substituted.outcome, 'failed');

    /* A refused step inside a journey that expects success is a failure, not an incompleteness. */
    const refusedStep = gradeJourney(definition, {
      steps: [
        step('search_bestprice'),
        { tool: 'get_visible_products', args: {}, result: { ok: false, error: 'no products' } },
        step('open_visible_product'),
        step('get_page_product'),
      ],
      terminal: answer,
    });
    assert.equal(refusedStep.outcome, 'failed');
    assert.match(refusedStep.reason, /refused or errored where the case expects it to succeed/u);
  });

  it('keeps refusal cases passing without pretending they completed a journey', () => {
    /* A refusal-expected case whose last step the page refuses: the run is `refused`, which is the
     * behaviour the case tests, and it is not reported as complete work. */
    const refusal = gradeJourney(CASE('neg-009'), {
      steps: [
        {
          tool: 'show_offer',
          args: { merchant_name: 'Invented' },
          result: { ok: false, error: 'not shown' },
        },
      ],
      terminal: { type: 'refusal', text: 'That merchant is not shown.' },
    });
    assert.equal(refusal.outcome, 'refused');
    assert.equal(refusal.complete, true);

    /* But a case that requires a refusal by *not calling a tool* cannot answer instead. */
    const answered = gradeJourney(CASE('neg-002'), {
      steps: [],
      terminal: { type: 'answer', text: 'Here is what I found.' },
    });
    assert.equal(answered.outcome, 'failed');

    /* And a refusal claimed as a success where the case expects a working call is a failure. */
    const claimed = gradeJourney(CASE('product-002'), {
      steps: [{ tool: 'compare_page_offers', args: {}, result: { ok: true } }],
      terminal: { type: 'answer', text: 'ok' },
    });
    assert.equal(
      claimed.outcome,
      'failed',
      'a success envelope without the required offer data is insufficient',
    );
    const lying = gradeJourney(CASE('neg-009'), {
      steps: [{ tool: 'show_offer', args: {}, result: { ok: false, error: 'not shown' } }],
      terminal: { type: 'answer', text: 'I focused the offer for you.' },
    });
    assert.equal(lying.outcome, 'failed');
    assert.match(lying.reason, /not a valid answer/u);
  });

  it('reports the sequence status a partial trace has, per mode', () => {
    assert.equal(sequenceStatus(['search_bestprice'], CASE('multi-001')), 'partial');
    assert.equal(sequenceStatus(['search_bestprice', 'get_visible_products'], CASE('multi-001')), 'partial');
    assert.equal(
      sequenceStatus(
        ['search_bestprice', 'get_visible_products', 'open_visible_product', 'get_page_product'],
        CASE('multi-001'),
      ),
      'complete',
    );
    assert.equal(sequenceStatus(['get_visible_products', 'search_bestprice'], CASE('multi-001')), 'mismatch');
    assert.equal(sequenceStatus([], CASE('neg-002')), 'complete');
    assert.equal(sequenceStatus(['search_bestprice'], CASE('home-003')), 'complete');
    assert.equal(sequenceStatus(['compare_page_offers'], CASE('home-003')), 'mismatch');
    assert.equal(sequenceStatus([], CASE('home-003')), 'partial');
  });
});

describe('append-only corrections', () => {
  it('appends a correction for the committed multi-001 traces and touches no published byte', () => {
    const ledger = readLedger();
    const corrections = ledger.corrections ?? [];
    assert.equal(corrections.length, 2);

    for (const [index, runId] of MULTI_001_RUNS.entries()) {
      const correction = corrections.find(item => item.runId === runId);
      assert.ok(correction, `${runId} must carry a correction`);
      assert.equal(correction.originalOutcome, 'passed');
      assert.equal(correction.correctedOutcome, 'blocked');
      assert.equal(correction.caseId, 'multi-001');
      assert.equal(correction.grader, 'journey-grader');
      assert.equal(correction.expectedSteps, '4');
      assert.equal(correction.steps, '1');
      assert.match(correction.reason, /no terminal answer or refusal/u);
      assert.equal(correction.originalArtifact, `artifacts/${runId}.json`);
      assert.equal(correction.artifact, `artifacts/${runId}.correction.json`);
      assert.equal(index, corrections.indexOf(correction), 'corrections keep their appended order');

      /* The original record is still exactly what was published: same outcome, same order. */
      const run = ledger.runs.find(record => record.runId === runId);
      assert.equal(run.outcome, 'passed', 'the original verdict is preserved, not overwritten');
      assert.equal(run.evidence, `artifacts/${runId}.json`);
    }
  });

  it('binds every correction to the published bytes of the artifact it corrects', () => {
    const ledger = readLedger();
    const digests = caseDigestIndex(v2);
    assert.deepEqual(
      validateCorrections(ledger, { artifactRoot: DEFAULT_ARTIFACT_ROOT }),
      [],
      'the committed corrections validate against the committed store',
    );
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseIds: new Set(v2.cases.map(item => item.id)),
        caseDigests: digests,
        datasetVersion: DATASET_VERSION,
        artifactRoot: DEFAULT_ARTIFACT_ROOT,
        implementation: {
          revision: ledger.runs[0].implementationRevision,
          fingerprint: ledger.runs[0].implementationFingerprint,
        },
      }),
      [],
    );

    /* Every original artifact still hashes to the digest recorded when it was published: the bytes
     * a correction points at cannot have been edited. */
    for (const runId of MULTI_001_RUNS) {
      const run = ledger.runs.find(record => record.runId === runId);
      const correction = ledger.corrections.find(item => item.runId === runId);
      const bytes = readFileSync(artifactPath(runId));
      assert.equal(
        run.evidenceDigest,
        correction.originalArtifactDigest,
        'the correction cites the digest the published record carries',
      );
      assert.equal(correction.originalArtifactDigest, createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('re-adjudicates under the current grader, superseding a published v1 correction without rewriting it', () => {
    const root = scratchStore();
    const twin = scratchStore();
    const ledgerCopy = join(root, 'runs.v2.json');
    const twinCopy = join(twin, 'runs.v2.json');
    try {
      const published = readLedger();
      for (const runId of MULTI_001_RUNS) {
        copy(artifactPath(runId), join(root, 'artifacts', `${runId}.json`));
        copy(artifactPath(runId), join(twin, 'artifacts', `${runId}.json`));
      }
      const correction = published.corrections.find(item => item.runId === MULTI_001_RUNS[0]);
      const rewritten = structuredClone({ ...published, corrections: [] });
      writeFileSync(ledgerCopy, JSON.stringify(rewritten, null, 2));
      writeFileSync(twinCopy, JSON.stringify(rewritten, null, 2));

      const adjudicate = target =>
        appendCorrection(MULTI_001_RUNS[0], {
          casesPath: CASES_PATH,
          ledgerPath: target,
          artifactRoot: join(dirname(target), 'artifacts'),
          correctedAt: correction.correctedAt,
        });

      const { correction: produced, artifactBytes } = adjudicate(ledgerCopy);
      const { correction: again } = adjudicate(twinCopy);

      /* The published correction was adjudicated by grader v1 and this code is v2. A grader change
       * never rewrites it: it appends a new correction naming the same published bytes. These traces
       * record no terminal, which v2 still reads as an unfinished journey, so the verdict itself is
       * unchanged — what differs is the provenance the record carries. */
      assert.equal(correction.graderVersion, '1', 'the published correction records the grader that made it');
      assert.equal(produced.graderVersion, String(GRADER.version));
      assert.notEqual(
        produced.correctionId,
        correction.correctionId,
        'a new adjudication is a new correction, not an edit of the old one',
      );
      for (const field of [
        'runId',
        'caseId',
        'originalOutcome',
        'correctedOutcome',
        'reason',
        'sequence',
        'steps',
        'expectedSteps',
        'terminal',
        'date',
        'correctedAt',
        'implementationRevision',
        'originalArtifact',
        'originalArtifactDigest',
      ]) {
        assert.deepEqual(produced[field], correction[field], field);
      }
      assert.deepEqual(produced, again, 'the same adjudication produces the same correction');
      assert.equal(produced.artifactDigest, createHash('sha256').update(artifactBytes).digest('hex'));
      assert.deepEqual(
        readFileSync(join(root, 'artifacts', `${MULTI_001_RUNS[0]}.correction.json`)),
        artifactBytes,
        'the correction artifact is deterministic',
      );
      assert.equal(
        readLedger().corrections.find(item => item.runId === MULTI_001_RUNS[0]).correctionId,
        correction.correctionId,
        'the published ledger was never written to',
      );
      /* The ledger metadata documents its own rule, and the rule survives the append. */
      const appended = JSON.parse(readFileSync(ledgerCopy, 'utf8'));
      assert.match(appended.note, /Corrections are appended, never edited/u);
      assert.equal(appended.note.includes(APPEND_ONLY_NOTE), true);
      assert.equal(appended.runs.length, published.runs.length, 'correcting a run adds no run record');

      /* A second correction of the same run is refused: corrections supersede, they do not repeat. */
      assert.throws(() => adjudicate(ledgerCopy), /already carries correction/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(twin, { recursive: true, force: true });
    }
  });

  it('refuses a correction that would edit, invent or double-count a published run', () => {
    const ledger = readLedger();
    const correction = ledger.corrections.find(item => item.runId === MULTI_001_RUNS[0]);
    const context = { runs: ledger.runs, artifactRoot: null };

    assert.equal(validateCorrection(correction, context), null);

    /* Only a reference: a correction for a run that is not in the ledger is not a correction. */
    assert.match(
      validateCorrection({ ...correction, runId: 'run-2026-09-13-multi-001-invented' }, context) ?? '',
      /unknown run/u,
    );
    /* It must restate the published outcome, so it cannot quietly change what it is correcting. */
    assert.match(
      validateCorrection({ ...correction, originalOutcome: 'failed' }, context) ?? '',
      /records passed/u,
    );
    /* It cannot invent a pass that was never published, whatever it claims was recorded. */
    /* A correction may never create a pass: the same shape against a run the ledger recorded as
     * failed is rejected before its artifact is even read. */
    const publishedFailure = ledger.runs.find(run => run.outcome === 'failed');
    assert.match(
      validateCorrection(
        {
          ...correction,
          runId: publishedFailure.runId,
          caseId: publishedFailure.caseId,
          originalOutcome: publishedFailure.outcome,
          correctedOutcome: 'passed',
          originalArtifact: publishedFailure.evidence,
          originalArtifactDigest: publishedFailure.evidenceDigest,
          artifact: `artifacts/${publishedFailure.runId}.correction.json`,
          artifactDigest: 'f'.repeat(64),
        },
        context,
      ) ?? '',
      /may not promote a published non-pass/u,
    );
    /* It is a verdict about a run, not a run: execution identity fields would make it countable. */
    for (const field of ['evidenceLayer', 'agent', 'model', 'browser', 'implementationFingerprint']) {
      assert.match(
        validateCorrection({ ...correction, [field]: 'native' }, context) ?? '',
        /not an execution/u,
        field,
      );
    }
    /* The original artifact digest is what ties it to published bytes. */
    assert.match(
      validateCorrection({ ...correction, originalArtifactDigest: 'e'.repeat(64) }, context) ?? '',
      /does not match the digest run/u,
    );
    assert.match(
      validateCorrection({ ...correction, artifactDigest: 'not-a-digest' }, context) ?? '',
      /sha256 digest/u,
    );
    /* v1 and v2 corrections are both readable; a version this ledger has no grader for is not. */
    assert.match(validateCorrection({ ...correction, graderVersion: '3' }, context) ?? '', /grader must be/u);
    assert.match(validateCorrection({ ...correction, supersedes: 'nope' }, context) ?? '', /supersedes/u);
  });

  it('detects an edited original artifact, a removed correction and a reordered correction', () => {
    const ledger = readLedger();
    const root = scratchStore();
    try {
      for (const runId of MULTI_001_RUNS) copy(artifactPath(runId), join(root, 'artifacts', `${runId}.json`));
      for (const runId of MULTI_001_RUNS)
        copy(correctionArtifactPath(runId), join(root, 'artifacts', `${runId}.correction.json`));
      const context = { runs: ledger.runs, artifactRoot: join(root, 'artifacts') };
      assert.deepEqual(validateCorrections(ledger, context), []);

      /* Editing the original artifact in the scratch store is exactly what a correction forbids. */
      const tampered = JSON.parse(readFileSync(join(root, 'artifacts', `${MULTI_001_RUNS[0]}.json`), 'utf8'));
      tampered.executions[0].outcome = 'failed';
      writeFileSync(join(root, 'artifacts', `${MULTI_001_RUNS[0]}.json`), `${JSON.stringify(tampered)}\n`);
      assert.match(
        validateCorrections(ledger, context).join('\n'),
        /no longer hashes to the digest the correction recorded/u,
      );
      copy(artifactPath(MULTI_001_RUNS[0]), join(root, 'artifacts', `${MULTI_001_RUNS[0]}.json`));
      assert.deepEqual(validateCorrections(ledger, context), []);

      /* Corrections are as append-only as runs. */
      const baselineCorrections = ledger.corrections;
      assert.match(
        validateCorrections(
          { ...ledger, corrections: [ledger.corrections[1], ledger.corrections[0]] },
          {
            ...context,
            baselineCorrections,
          },
        ).join('\n'),
        /moved from corrections\[0\]/u,
      );
      assert.match(
        validateCorrections(
          { ...ledger, corrections: [ledger.corrections[0]] },
          {
            ...context,
            baselineCorrections,
          },
        ).join('\n'),
        /was removed; corrections are append-only/u,
      );
      assert.match(
        validateCorrections(
          {
            ...ledger,
            corrections: [{ ...ledger.corrections[0], correctedOutcome: 'failed' }, ledger.corrections[1]],
          },
          { ...context, baselineCorrections },
        ).join('\n'),
        /was modified in place/u,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is validated by the whole-ledger check, not only by its own validator', () => {
    /* `validateEvidenceFile` has to run the correction checks: a ledger with an edited correction is
     * a problem even when every run record in it is untouched. */
    const ledger = readLedger();
    const context = {
      caseIds: new Set(v2.cases.map(item => item.id)),
      caseDigests: caseDigestIndex(v2),
      datasetVersion: DATASET_VERSION,
      artifactRoot: DEFAULT_ARTIFACT_ROOT,
    };
    assert.deepEqual(validateEvidenceFile(ledger, context), []);

    const edited = {
      ...ledger,
      corrections: [{ ...ledger.corrections[0], correctedOutcome: 'failed' }, ledger.corrections[1]],
    };
    assert.match(
      validateEvidenceFile(edited, { ...context, baselineCorrections: ledger.corrections }).join('\n'),
      /correction correction-[0-9a-f]{16} was modified in place/u,
    );

    /* A correction the ledger cannot bind to a published run is a problem too. */
    const orphaned = { ...ledger, corrections: [{ ...ledger.corrections[0], runId: 'run-not-here' }] };
    assert.match(
      validateEvidenceFile(orphaned, context).join('\n'),
      /corrections\[0\]: correction references unknown run run-not-here/u,
    );
  });

  it('reports the corrected outcome without hiding the original one', () => {
    const ledger = readLedger();
    const audit = auditRunEvidence(ledger, v2, { artifactRoot: DEFAULT_ARTIFACT_ROOT });
    const multi = audit.casesSummary.find(item => item.id === 'multi-001');

    /* The ledger still carries two `passed` records for multi-001... */
    const records = ledger.runs.filter(run => run.caseId === 'multi-001');
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map(run => run.outcome),
      ['passed', 'passed'],
      'the published verdicts are untouched',
    );
    /* ... and both are now finalized as blocked, with the reason recorded. */
    assert.equal(multi.correctedRuns, 2);
    for (const runId of MULTI_001_RUNS) {
      assert.equal(multi.finalizedOutcomes[runId], 'blocked');
    }
    assert.equal(audit.correctedRuns.length, 2);
    assert.equal(
      audit.correctedRuns.every(item => item.originalOutcome === 'passed'),
      true,
    );
    assert.equal(
      audit.correctedRuns.every(item => item.correctedOutcome === 'blocked'),
      true,
    );
    /* A corrected pass is not a pass, so it cannot meet the sample floor, and the historical tally
     * still shows the two passes the ledger published. */
    assert.equal(multi.passed, 0, 'the corrected cohort scores no passes');
    assert.equal(multi.meetsTarget, false);
    assert.deepEqual(
      { passed: multi.historical.passed, total: multi.historical.total },
      { passed: 2, total: 2 },
      'the published tally is reported unchanged',
    );
    assert.equal(multi.historicalCorrected.passed, 0);
    assert.equal(multi.historicalCorrected.blocked, 2);
  });

  it('is not counted as an execution: a correction cannot satisfy the predicate', () => {
    const ledger = readLedger();
    const audit = auditRunEvidence(ledger, v2, { artifactRoot: DEFAULT_ARTIFACT_ROOT });
    assert.equal(
      audit.totalRuns,
      ledger.runs.length,
      'corrections are not runs and never add to the run count',
    );
    assert.equal(
      audit.verifiedRuns,
      audit.casesSummary.reduce((sum, item) => sum + item.scoredRuns, 0),
    );
    for (const correction of ledger.corrections) {
      assert.equal(
        ledger.runs.some(run => run.runId === correction.artifact),
        false,
        'a correction artifact is never citable as run evidence',
      );
    }
  });
});

describe('the ledger states its own append-only rule', () => {
  it('keeps the published note and appends the correction rule', () => {
    const ledger = readLedger();
    assert.match(ledger.note, /never edited in place/u, 'the original note is preserved');
    assert.equal(ledger.note.includes(APPEND_ONLY_NOTE), true, 'the correction rule is stated');
    assert.ok(Array.isArray(ledger.corrections));
    assert.equal(ledger.outcomes.includes(INCOMPLETE_OUTCOME), true, 'blocked is a declared outcome');
    assert.equal(
      ledger.rules.some(rule => /a correction is an appended record, never an edit/u.test(rule)),
      true,
    );
    assert.equal(existsSync(correctionArtifactPath(MULTI_001_RUNS[0])), true);
    assert.equal(
      readdirSync(DEFAULT_ARTIFACT_ROOT).filter(name => name.endsWith('.correction.json')).length,
      ledger.corrections.length,
      'every correction has its own artifact',
    );
  });
});
