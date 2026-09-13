/**
 * Append-only correction of a published run.
 *
 * The audit's first finding is a grading bug, not a fabrication: a committed `multi-001` artifact
 * really recorded one `search_bestprice` call, and the single-call evaluator of the time called that
 * `passed` even though the frozen case requires an ordered four-tool journey ending in an answer.
 * The trace is honest; the verdict was not.
 *
 * The ledger's rule for that is already written down — *a record is never edited in place; a
 * corrected result is a new record* — so a correction is an **appended** record that references the
 * original run and the artifact it cites. The original record and the original artifact bytes are
 * never touched: they stay exactly as published, and a reader can see both the original verdict and
 * the corrected one. Corrections are never edited either; a later correction supersedes an earlier
 * one by pointing at it, which keeps the whole history auditable.
 *
 * A correction is deliberately *not* a run record. It is not an execution, it must not be counted as
 * one, and it cannot be used to satisfy a sample floor or a pass fraction. `run-evidence.js` owns the
 * shape and reference rules (`validateCorrection`); this module owns producing one.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { adjudicateRecord } from './journey.js';
import { DEFAULT_ARTIFACT_ROOT, resolveEvidencePath, sha256, validateCorrection } from './run-evidence.js';

const EVAL_DIR = fileURLToPath(new URL('./', import.meta.url));
export const CASES_PATH = join(EVAL_DIR, 'natural-language-cases.v2.json');
export const CORRECTIONS_LEDGER_PATH = join(EVAL_DIR, 'runs.v2.json');

/** The grader identity a correction was produced under: a grader change can supersede one. */
export const GRADER = Object.freeze({ id: 'journey-grader', version: 1 });

const FULL_REVISION = /^[0-9a-f]{40}$/u;

/** The one-line rule the ledger must state about corrections, asserted by the test suite. */
export const APPEND_ONLY_NOTE =
  'Corrections are appended, never edited: a correction is a new record that references the run and artifact it corrects, the original record and the original artifact bytes stay exactly as published, and a later correction supersedes an earlier one by naming it.';

/** The correction record's own rules, appended to the ledger's `rules` so the file documents itself. */
export const CORRECTION_RULES = Object.freeze([
  'a correction is an appended record, never an edit: the original run record and the original artifact bytes are untouched, and the correction cites both',
  'a correction must reference a runId that already exists in this ledger, and must restate that run\u2019s original outcome and original artifact digest',
  'a correction is not an execution: it carries no evidenceLayer, agent, model or browser, and it counts towards no sample floor and no pass fraction',
  'a later correction supersedes an earlier one by naming it in `supersedes`; corrections are never edited or deleted either',
]);

/** The deterministic id of a correction: the same adjudication is always the same correction. */
export const correctionId = (runId, graderVersion, correctedOutcome) =>
  `correction-${sha256(`${runId}:${GRADER.id}:${graderVersion}:${correctedOutcome}`).slice(0, 16)}`;

/** The artifact path a correction cites. Distinct from every `run-*.json` execution artifact. */
export const correctionEvidencePath = runId => `artifacts/${runId}.correction.json`;

const readArtifact = (artifactRoot, evidence) => {
  try {
    return readFileSync(resolveEvidencePath(artifactRoot, evidence));
  } catch {
    return null;
  }
};

/**
 * Re-adjudicates one published run and writes the correction artifact plus the ledger correction.
 *
 * The original record and the original artifact are only ever read. Appending is idempotent: a run
 * that already carries a correction for this grader version is refused unless `supersede` is set, in
 * which case the new correction names the old one.
 *
 * @param {string} runId
 * @param {object} [options]
 * @param {string} [options.casesPath]
 * @param {string} [options.ledgerPath]
 * @param {string} [options.artifactRoot]
 * @param {string} [options.correctedAt] - ISO-8601 instant the correction was adjudicated
 * @param {string} [options.supersede] - correctionId this one replaces
 * @param {boolean} [options.write=true] - false computes the correction without touching disk
 */
export function appendCorrection(runId, options = {}) {
  const casesPath = options.casesPath ?? CASES_PATH;
  const ledgerPath = options.ledgerPath ?? CORRECTIONS_LEDGER_PATH;
  const artifactRoot = options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT;
  const correctedAt = options.correctedAt ?? new Date().toISOString();
  const write = options.write ?? true;

  const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const record = (ledger.runs ?? []).find(run => run.runId === runId);
  if (!record) throw new Error(`run ${runId} is not in ${ledgerPath}`);
  const definition = (cases.cases ?? []).find(item => item.id === record.caseId);
  if (!definition) throw new Error(`run ${runId} references unknown case ${record.caseId}`);

  const existing = (ledger.corrections ?? []).filter(correction => correction.runId === runId);
  if (existing.length > 0 && !options.supersede) {
    throw new Error(
      `run ${runId} already carries correction ${existing.at(-1).correctionId}; corrections supersede, never repeat (pass supersede to replace it)`,
    );
  }
  if (options.supersede && !existing.some(correction => correction.correctionId === options.supersede)) {
    throw new Error(`supersede ${options.supersede} is not a correction of run ${runId}`);
  }

  /* The original artifact is read, never written. Its digest is recorded twice: once as the digest
   * the correction cites, and once inside the correction artifact as the byte-level binding. */
  const originalBytes = readArtifact(artifactRoot, record.evidence);
  if (!originalBytes) throw new Error(`run ${runId} cites ${record.evidence}, which does not exist`);
  const originalArtifactDigest = sha256(originalBytes);
  const originalArtifact = JSON.parse(originalBytes.toString('utf8'));
  const graded = adjudicateRecord(record, originalArtifact, definition);

  const revision =
    options.revision ?? (ledger.runs ?? []).find(run => run.implementationRevision)?.implementationRevision;
  if (!revision || !FULL_REVISION.test(revision)) {
    throw new Error('the ledger must name at least one full implementation revision to correct against');
  }

  const id = correctionId(runId, GRADER.version, graded.outcome);
  const evidence = correctionEvidencePath(runId);
  const correction = {
    correctionId: id,
    runId,
    caseId: record.caseId,
    originalOutcome: record.outcome,
    correctedOutcome: graded.outcome,
    reason: graded.reason,
    sequence: graded.sequence,
    steps: String(graded.steps),
    expectedSteps: String(graded.journey.tools.length),
    terminal: graded.terminal?.type ?? null,
    grader: GRADER.id,
    graderVersion: String(GRADER.version),
    correctedAt,
    date: correctedAt.slice(0, 10),
    implementationRevision: revision,
    evidence,
    artifact: evidence,
    artifactDigest: '',
    originalArtifact: record.evidence,
    originalArtifactDigest,
    ...(options.supersede ? { supersedes: options.supersede } : {}),
  };

  const artifactBytes = Buffer.from(
    `${JSON.stringify(
      {
        artifactVersion: 1,
        correctionOf: runId,
        originalArtifact: record.evidence,
        originalArtifactDigest,
        corrections: [
          {
            correctionId: id,
            runId,
            caseId: record.caseId,
            originalOutcome: record.outcome,
            correctedOutcome: graded.outcome,
            reason: graded.reason,
            sequence: graded.sequence,
            steps: graded.steps,
            expectedSteps: graded.journey.tools.length,
            terminal: graded.terminal?.type ?? null,
            grader: GRADER.id,
            graderVersion: GRADER.version,
            correctedAt,
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  correction.artifactDigest = sha256(artifactBytes);

  const problem = validateCorrection(correction, { runs: ledger.runs ?? [] });
  if (problem) throw new Error(`refusing to append an invalid correction: ${problem}`);

  if (write) {
    const artifactPath = resolveEvidencePath(artifactRoot, evidence);
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, artifactBytes);
    const next = {
      ...ledger,
      /* The file documents its own append-only rule. The existing note is kept verbatim and the
       * correction rule is appended once, so re-running corrections cannot rewrite it either. */
      note: ledger.note?.includes(APPEND_ONLY_NOTE)
        ? ledger.note
        : [ledger.note, APPEND_ONLY_NOTE].filter(Boolean).join(' '),
      rules: [
        ...(ledger.rules ?? []),
        ...CORRECTION_RULES.filter(rule => !(ledger.rules ?? []).includes(rule)),
      ],
      corrections: [...(ledger.corrections ?? []), correction],
    };
    writeFileSync(ledgerPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return { correction, artifactBytes, graded };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let casesPath;
  let ledgerPath;
  let artifactRoot;
  let correctedAt;
  let supersede;
  const runIds = [];

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') {
      console.log(`Usage: node webmcp/evals/corrections.js --run=<runId> [options]

Appends a correction record for a published run. The original record and the original
artifact bytes are never modified; corrections are appended, never edited.

Options:
  --run=<runId>             Run to re-adjudicate (repeatable)
  --cases=<path>            Case dataset (default: natural-language-cases.v2.json)
  --ledger=<path>           Evidence ledger (default: runs.v2.json)
  --artifacts-dir=<path>    Artifact store (default: webmcp/evals/artifacts)
  --corrected-at=<instant>  ISO-8601 UTC instant to record (default: now)
  --supersede=<id>          correctionId this correction replaces
  -h, --help                Show this help message
`);
      process.exit(0);
    }
    if (arg.startsWith('--run=')) runIds.push(arg.slice('--run='.length));
    else if (arg.startsWith('--cases=')) casesPath = arg.slice('--cases='.length);
    else if (arg.startsWith('--ledger=')) ledgerPath = arg.slice('--ledger='.length);
    else if (arg.startsWith('--artifacts-dir=')) artifactRoot = arg.slice('--artifacts-dir='.length);
    else if (arg.startsWith('--corrected-at=')) correctedAt = arg.slice('--corrected-at='.length);
    else if (arg.startsWith('--supersede=')) supersede = arg.slice('--supersede='.length);
    else {
      console.error(`unexpected argument ${arg}`);
      process.exit(1);
    }
  }

  if (runIds.length === 0) {
    console.error('Error: at least one --run=<runId> is required.');
    process.exit(1);
  }

  try {
    for (const runId of runIds) {
      const { correction } = appendCorrection(runId, {
        casesPath,
        ledgerPath,
        artifactRoot,
        correctedAt,
        supersede,
      });
      console.log(
        `corrected ${correction.runId}: ${correction.originalOutcome} → ${correction.correctedOutcome} (${correction.correctionId})`,
      );
      console.log(`  reason: ${correction.reason}`);
      console.log(`  artifact: ${correction.evidence} (${correction.artifactDigest})`);
    }
  } catch (error) {
    console.error(`Correction refused: ${error.message}`);
    process.exit(1);
  }
}
