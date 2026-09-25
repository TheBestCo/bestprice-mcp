/**
 * Execution evidence lives beside the dataset, never inside it.
 *
 * A case definition is frozen: its prompt, page, expected tools, argument
 * constraints and pass criterion never change once published, and its `runs`
 * array stays empty. What an agent actually did is appended to a separate
 * evidence file that references the case by id. Keeping the two apart is what
 * lets a real run be recorded without weakening the freeze guard — and what
 * stops a run log from silently rewriting the test it is evidence for.
 *
 * Shape is the cheapest thing a validator can check, so it is not the whole job:
 *
 * - a record declares its execution modality (`evidenceLayer: 'native'`) and has to agree with
 *   itself: an agent, model or browser that names an in-memory adapter, Node.js, jsdom, a
 *   simulation or a test driver is rejected instead of accepted on shape, because a deterministic
 *   simulation in a green suite is not a run by an agent on a page;
 * - a record is compared against the records a trusted baseline already published
 *   (`baselineRuns`, read from the merge base by `git-baseline.js`), so deleting or
 *   rewriting evidence is a failure rather than a shorter file;
 * - a record carries the digest of the frozen case definition it ran and the
 *   fingerprint of the implementation it claims to have exercised;
 * - a record points at an artifact that must exist on disk, hash to the recorded
 *   `evidenceDigest`, and identify that exact execution — which is how one file can
 *   legitimately evidence several runs while a re-labelled copy cannot.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditAttempts, journalPathFor } from './attempt-journal.js';
import { currentRevision, readTrustedBaseline } from './git-baseline.js';
import { gradeJourney } from './journey.js';
import {
  BLOCKED_OUTCOME,
  buildScopeSigner,
  CAMPAIGN_PURPOSES,
  caseTargetVerdict,
  classifiesAsSafetyViolation,
  cohortDimensions,
  DEFAULT_MINIMUM_SAMPLES,
  DEFAULT_TARGET_PASS_RATE,
  isNegativeCase,
  isObservedBreach,
  isQualificationRun,
  releaseScope,
  tallyRuns,
} from './release-policy.js';
import { qualifyTask } from './task-review.js';

export const RUN_OUTCOMES = Object.freeze(['passed', 'failed', 'refused', 'blocked']);

/**
 * The only execution modality this ledger records: an agent driving a real browser engine.
 *
 * Everything else — the deterministic demo adapter, an in-memory simulation, a fixture replayed
 * under Node — can be a useful engineering signal, but it is not evidence that a model chose the
 * right tool: no agent reasoned, nothing rendered, no page was driven. Shape checks cannot tell the
 * two apart, so the modality is an explicit field and the identity fields must agree with it. A
 * non-native run belongs under `webmcp/evals/demo/`, never here.
 */
export const NATIVE_EVIDENCE_LAYER = 'native';

/** The layers this ledger accepts: exactly one. */
export const EVIDENCE_LAYERS = Object.freeze([NATIVE_EVIDENCE_LAYER]);

/** Fields that must agree with the declared modality. */
export const MODALITY_FIELDS = Object.freeze(['agent', 'model', 'browser']);

/**
 * The implementation a run claims to have exercised: the tool contracts, the storefront catalog they
 * publish each tool's words and output schema from (since contract 1.8), and the registration runtime.
 */
export const IMPLEMENTATION_FILES = Object.freeze([
  'webmcp/src/contracts.js',
  'webmcp/src/storefront-catalog.js',
  'webmcp/src/runtime.js',
]);

/** Committed artifacts live beside the ledger, so an `artifacts/x.json` path resolves here. */
export const DEFAULT_ARTIFACT_ROOT = fileURLToPath(new URL('./artifacts/', import.meta.url));

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const REQUIRED_FIELDS = Object.freeze([
  'runId',
  'caseId',
  'datasetVersion',
  'evidenceLayer',
  'agent',
  'model',
  'browser',
  'implementationRevision',
  'implementationFingerprint',
  'caseDigest',
  'startedAt',
  'date',
  'outcome',
  'evidence',
  'evidenceDigest',
]);

/* Everything a record declares about the execution itself. An artifact that claims to evidence a
 * run has to repeat these fields, which is what stops one execution from being re-labelled. */
const EXECUTION_FIELDS = Object.freeze([
  'runId',
  'caseId',
  'datasetVersion',
  'evidenceLayer',
  'agent',
  'model',
  'browser',
  'language',
  'implementationRevision',
  'implementationFingerprint',
  'caseDigest',
  'startedAt',
  'date',
  'outcome',
]);

/* The languages a recorded prompt can be written in. A run in one language is not evidence about a
 * run in another, so the cohort is scoped by this field when a record carries it. */
export const RUN_LANGUAGES = Object.freeze(['el', 'en']);

/* Everything optional about how a run was configured, checked when the record declares it. */
const OPTIONAL_STRING_FIELDS = Object.freeze(['language', 'cohort']);

/* Two runs are the same execution when everything but the label matches. */
const IDENTITY_FIELDS = Object.freeze(EXECUTION_FIELDS.filter(field => field !== 'runId'));

const FULL_REVISION = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const EVIDENCE_PATH = /^artifacts\/[A-Za-z0-9._/-]{1,180}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

/* A host that is not a browser, or a run that no agent drove, says so in its own identity fields. */
const NON_NATIVE_MARKERS =
  /in-?memory|node\.?js|jsdom|simulat|deterministic|test[\s_-]?driver|fixture|stub|mock|fake|dummy|placeholder|smoke/i;

/* A correction record: an appended verdict about a published run, not an execution of its own. */
const CORRECTION_ID = /^correction-[0-9a-f]{16}$/u;
const CORRECTED_OUTCOMES = Object.freeze(['passed', 'failed', 'refused', 'blocked']);
/* A correction may correct a verdict; it may not create a pass that was never recorded. Promoting a
 * published non-pass to `passed` is a fabrication, and a ledger that allowed it would not need
 * artifacts at all. */
const CORRECTION_REQUIRED_FIELDS = Object.freeze([
  'correctionId',
  'runId',
  'caseId',
  'originalOutcome',
  'correctedOutcome',
  'reason',
  'sequence',
  'steps',
  'expectedSteps',
  'grader',
  'graderVersion',
  'correctedAt',
  'date',
  'implementationRevision',
  'evidence',
  'artifact',
  'artifactDigest',
  'originalArtifact',
  'originalArtifactDigest',
]);
/* A correction is not a run: these fields would make it countable as evidence. */
const CORRECTION_FORBIDDEN_FIELDS = Object.freeze([
  'evidenceLayer',
  'agent',
  'model',
  'browser',
  'implementationFingerprint',
]);
/* The grader this repository appends corrections with. A different grader is a supersession, not a
 * silent reinterpretation of the same records. */
/* The graders whose corrections this ledger can read. A correction states which adjudication produced
 * it, and v1 corrections stay readable after the v2 rule change: superseding them is a new appended
 * correction, not a rewrite. Both versions are accepted; nothing else is. */
export const CORRECTION_GRADER = Object.freeze({ id: 'journey-grader', versions: Object.freeze([1, 2]) });

/* Native evidence names a real browser engine, and the version that rendered the page. */
const NATIVE_BROWSER = /^(Chromium|Chrome|Google Chrome|Microsoft Edge|Firefox|Safari)\b.*\d/u;

/* ... and the host that drove it is a named tool, not a placeholder. */
const AGENT_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._+()/&'-]*$/u;
const PLACEHOLDER_AGENT =
  /^(?:test|tests?|driver|agent|unknown|tbd|todo|placeholder|example|sample|n\/?a|none|null|undefined|fake|mock|dummy)$/i;

/**
 * Rejects a record that is not native evidence, whatever shape the rest of it has.
 *
 * The modality is checked before anything else that could accept a record, so a deterministic run
 * cannot slip through on a well-formed path, digest and timestamp.
 */
function checkModality(record) {
  if (typeof record.evidenceLayer !== 'string' || record.evidenceLayer.trim() === '') {
    return `evidenceLayer must be '${NATIVE_EVIDENCE_LAYER}': this ledger records the native (real agent, real browser) execution modality only`;
  }
  if (record.evidenceLayer !== NATIVE_EVIDENCE_LAYER) {
    return `evidenceLayer '${record.evidenceLayer}' is a non-native modality; only '${NATIVE_EVIDENCE_LAYER}' (a real agent driving a real browser engine) is evidence in this ledger, and deterministic runs belong under webmcp/evals/demo/`;
  }
  for (const field of MODALITY_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && NON_NATIVE_MARKERS.test(value)) {
      return `${field} "${value}" declares a non-native execution modality: a record must name the real ${field === 'browser' ? 'browser engine' : field === 'model' ? 'model' : 'tool or host'} that ran, not an in-memory, simulated or deterministic stand-in`;
    }
  }
  if (typeof record.browser === 'string' && !NATIVE_BROWSER.test(record.browser)) {
    return `browser "${record.browser}" must name a real browser engine and its version (Chromium, Chrome, Google Chrome, Microsoft Edge, Firefox, Safari); an unversioned or unknown host is not native evidence`;
  }
  if (
    typeof record.agent === 'string' &&
    (PLACEHOLDER_AGENT.test(record.agent.trim()) || !AGENT_NAME.test(record.agent))
  ) {
    return `agent "${record.agent}" must name the real tool or host that drove the browser`;
  }
  return null;
}

/* A real calendar day, not a string that looks like one. */
const isCalendarDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  );
};

const isTimestamp = value => TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));

/** Key order never changes a digest: canonical form sorts object keys at every level. */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(item => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export const canonicalJson = value => JSON.stringify(canonicalize(value));

export const sha256 = value => createHash('sha256').update(value).digest('hex');

/**
 * The digest of one frozen case definition.
 *
 * `runs` is excluded because a definition is what the case *is*: evidence is never part of it, and
 * every definition's run log stays empty by contract.
 */
export function caseDigest(definition) {
  const frozen = { ...definition };
  delete frozen.runs;
  return sha256(canonicalJson(frozen));
}

/** `id → digest` for a whole dataset, so a record can be bound to the exact case text it ran. */
export function caseDigestIndex(dataset) {
  return new Map((dataset?.cases ?? []).map(item => [item.id, caseDigest(item)]));
}

/** The implementation manifest: a digest over the files that define the tool surface. */
export function implementationFingerprint(root = REPO_ROOT) {
  const manifest = IMPLEMENTATION_FILES.map(
    relative => `${relative}:${sha256(readFileSync(join(root, relative)))}`,
  );
  return sha256(manifest.join('\n'));
}

const executionIdentity = execution =>
  canonicalJson(Object.fromEntries(IDENTITY_FIELDS.map(field => [field, execution?.[field]])));

/**
 * Compares the working records against the records a trusted baseline already published.
 *
 * Published records are a prefix that only grows: the same record, in the same place, unchanged.
 * Anything else is reported — a record that vanished, a record that moved, or a record whose
 * outcome or fields were edited in place. Appending a new record is always allowed, which is the
 * whole point: a corrected result is a new record, not an edit of the old one.
 */
export function comparePriorRecords(runs, baselineRuns) {
  const problems = [];
  if (!Array.isArray(baselineRuns)) return problems;
  const positionOf = new Map();
  for (const [index, record] of runs.entries()) {
    if (record?.runId !== undefined && !positionOf.has(record.runId)) positionOf.set(record.runId, index);
  }
  for (const [index, prior] of baselineRuns.entries()) {
    const current = runs[index];
    if (current && canonicalJson(current) === canonicalJson(prior)) continue;
    const position = positionOf.get(prior?.runId);
    if (position === undefined) problems.push(`run ${prior?.runId} was removed; evidence is append-only`);
    else if (position !== index) {
      problems.push(
        `run ${prior?.runId} moved from runs[${index}] to runs[${position}]; published records keep their order`,
      );
    } else {
      problems.push(`run ${prior?.runId} was modified in place; append a corrected record instead`);
    }
  }
  return problems;
}

/**
 * Compares a dataset against the copy a trusted baseline published.
 *
 * A definition is frozen once released, so every case the baseline carries must still be present
 * and must still hash to the same digest. Adding a case is not a rewrite; changing or dropping one
 * is, and it invalidates the run evidence that referenced it.
 */
export function compareFrozenCases(currentDataset, baselineDataset, label = 'dataset') {
  const problems = [];
  const current = new Map((currentDataset?.cases ?? []).map(item => [item.id, item]));
  for (const item of baselineDataset?.cases ?? []) {
    const shown = current.get(item.id);
    if (!shown) {
      problems.push(`${label}: case ${item.id} was removed from the frozen dataset`);
      continue;
    }
    if (caseDigest(shown) !== caseDigest(item)) {
      problems.push(`${label}: case ${item.id} changed after publication`);
    }
  }
  return problems;
}

/** Resolves an evidence path against an artifact root that may or may not include the artifacts directory. */
export function resolveEvidencePath(artifactRoot, evidence) {
  if (!artifactRoot) return evidence;
  if (
    (artifactRoot.endsWith('/artifacts') || artifactRoot.endsWith('/artifacts/')) &&
    evidence.startsWith('artifacts/')
  ) {
    return join(artifactRoot, evidence.slice('artifacts/'.length));
  }
  return join(artifactRoot, evidence);
}

/**
 * Reads the artifact a record cites and checks that it really evidences this run.
 *
 * Existence and content digest come first — a path that resolves to nothing, or to bytes other
 * than the recorded ones, is not evidence. Then the artifact must name the run and repeat its
 * identity. One file may hold several separately identified executions (a session trace, say), so
 * sharing a file is allowed; sharing an *execution* under a new runId is not.
 */
function checkArtifact(record, { artifactRoot, seenExecutions }) {
  if (!artifactRoot) return null;
  let bytes;
  try {
    const artifactPath = resolveEvidencePath(artifactRoot, record.evidence);
    bytes = readFileSync(artifactPath);
  } catch {
    return `evidence artifact ${record.evidence} does not exist in the evidence store`;
  }
  if (sha256(bytes) !== record.evidenceDigest) {
    return `evidenceDigest does not match the recorded bytes of ${record.evidence}`;
  }
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString('utf8'));
  } catch {
    return `${record.evidence} is not valid JSON`;
  }
  if (artifact?.artifactVersion !== 1) return `${record.evidence} must declare artifactVersion 1`;
  if (!Array.isArray(artifact.executions) || artifact.executions.length === 0) {
    return `${record.evidence} must declare at least one execution`;
  }
  const matching = artifact.executions.filter(execution => execution?.runId === record.runId);
  if (matching.length === 0) {
    return `${record.evidence} does not identify run ${record.runId}; a shared artifact must record every run it evidences`;
  }
  if (matching.length > 1) return `${record.evidence} identifies run ${record.runId} more than once`;
  const [execution] = matching;
  for (const field of EXECUTION_FIELDS) {
    if (execution[field] !== record[field]) {
      return `${record.evidence} execution ${record.runId} disagrees with the record on ${field}`;
    }
  }
  /* Purpose/custody were introduced after the first published ledgers. They are
   * mandatory and artifact-bound for every NEW run, while trusted merge-base
   * records retain their historical bytes unchanged. */
  if (record.custodyVersion === 2) {
    if (execution.purpose !== record.purpose) {
      return `${record.evidence} execution ${record.runId} disagrees with the record on purpose`;
    }
    if (execution.custodyVersion !== record.custodyVersion) {
      return `${record.evidence} execution ${record.runId} disagrees with the record on custodyVersion`;
    }
  }
  if (seenExecutions) {
    const identity = executionIdentity(execution);
    const previous = seenExecutions.get(identity);
    if (previous && previous !== record.runId) {
      return `execution identity in ${record.evidence} is already recorded as run ${previous}; a copy under a new runId is not a second run`;
    }
    seenExecutions.set(identity, record.runId);
  }
  return null;
}

/**
 * Validates one append-only correction record.
 *
 * A correction exists because a published verdict was wrong and the ledger may not be rewritten. So
 * the checks are about *reference* and *irreversibility*: it must point at a run that is already in
 * the ledger, restate that run's published outcome and artifact digest, be a verdict about a run
 * rather than a run (no `evidenceLayer`, `agent`, `model` or `browser`), and never invent a pass that
 * was not published. Its own artifact must exist, hash to `artifactDigest`, and identify it.
 *
 * @param {object} correction
 * @param {{runs?: Array<object>, artifactRoot?: string, seenCorrectionIds?: Set<string>}} context
 * @returns {string|null} the first problem, or null when the correction is acceptable
 */
export function validateCorrection(correction, context = {}) {
  const { runs = [], artifactRoot, seenCorrectionIds } = context;
  if (!correction || typeof correction !== 'object' || Array.isArray(correction)) {
    return 'correction must be an object';
  }
  for (const field of CORRECTION_REQUIRED_FIELDS) {
    if (typeof correction[field] !== 'string' || correction[field].trim() === '') {
      return `${field} must be a non-empty string`;
    }
  }
  for (const field of CORRECTION_FORBIDDEN_FIELDS) {
    if (correction[field] !== undefined) {
      return `a correction is not an execution and must not carry ${field}`;
    }
  }
  if (!CORRECTION_ID.test(correction.correctionId)) {
    return 'correctionId must be a correction-<16 hex> id';
  }
  if (seenCorrectionIds?.has(correction.correctionId)) {
    return `duplicate correctionId ${correction.correctionId}`;
  }
  if (!CORRECTED_OUTCOMES.includes(correction.correctedOutcome)) {
    return `correctedOutcome must be one of ${CORRECTED_OUTCOMES.join(', ')}`;
  }
  if (!FULL_REVISION.test(correction.implementationRevision)) {
    return 'implementationRevision must be a full 40-character revision';
  }
  if (!isTimestamp(correction.correctedAt)) return 'correctedAt must be an ISO-8601 UTC timestamp';
  if (!isCalendarDate(correction.date)) return 'date must be a real calendar date (YYYY-MM-DD)';
  if (
    correction.grader !== CORRECTION_GRADER.id ||
    !CORRECTION_GRADER.versions.includes(Number(correction.graderVersion))
  ) {
    return `grader must be ${CORRECTION_GRADER.id} one of v${CORRECTION_GRADER.versions.join('/v')}`;
  }
  if (correction.correctedOutcome === 'passed' && correction.originalOutcome !== 'passed') {
    return 'a correction may not promote a published non-pass to passed';
  }
  if (correction.supersedes !== undefined && !CORRECTION_ID.test(correction.supersedes)) {
    return 'supersedes must be a correctionId when present';
  }
  for (const field of ['artifact', 'originalArtifact']) {
    if (!EVIDENCE_PATH.test(correction[field]) || correction[field].includes('..')) {
      return `${field} must be a path under artifacts/ with no traversal`;
    }
  }
  for (const field of ['artifactDigest', 'originalArtifactDigest']) {
    if (!DIGEST.test(correction[field])) return `${field} must be a sha256 digest`;
  }

  const correctedRun = runs.find(run => run?.runId === correction.runId);
  if (!correctedRun) return `correction references unknown run ${correction.runId}`;
  if (correctedRun.caseId !== correction.caseId) {
    return `correction caseId ${correction.caseId} does not match run ${correction.runId}`;
  }
  if (correctedRun.outcome !== correction.originalOutcome) {
    return `correction restates the original outcome as ${correction.originalOutcome}, but run ${correction.runId} records ${correctedRun.outcome}`;
  }
  if (correctedRun.evidence !== correction.originalArtifact) {
    return `correction cites ${correction.originalArtifact}, but run ${correction.runId} cites ${correctedRun.evidence}`;
  }
  if (correctedRun.evidenceDigest !== correction.originalArtifactDigest) {
    return `originalArtifactDigest does not match the digest run ${correction.runId} recorded`;
  }
  if (seenCorrectionIds) seenCorrectionIds.add(correction.correctionId);

  if (!artifactRoot) return null;
  let originalBytes;
  try {
    originalBytes = readFileSync(resolveEvidencePath(artifactRoot, correction.originalArtifact));
  } catch {
    return `original artifact ${correction.originalArtifact} does not exist in the evidence store`;
  }
  /* The strongest append-only statement there is: the bytes a correction points at are still the
   * bytes that were published. An edit to the original artifact is visible here. */
  if (sha256(originalBytes) !== correction.originalArtifactDigest) {
    return `original artifact ${correction.originalArtifact} no longer hashes to the digest the correction recorded`;
  }
  let correctionBytes;
  try {
    correctionBytes = readFileSync(resolveEvidencePath(artifactRoot, correction.artifact));
  } catch {
    return `correction artifact ${correction.artifact} does not exist in the evidence store`;
  }
  if (sha256(correctionBytes) !== correction.artifactDigest) {
    return `artifactDigest does not match the recorded bytes of ${correction.artifact}`;
  }
  let artifact;
  try {
    artifact = JSON.parse(correctionBytes.toString('utf8'));
  } catch {
    return `${correction.artifact} is not valid JSON`;
  }
  if (artifact?.artifactVersion !== 1) return `${correction.artifact} must declare artifactVersion 1`;
  if (!Array.isArray(artifact.corrections) || artifact.corrections.length !== 1) {
    return `${correction.artifact} must declare exactly one correction`;
  }
  const [entry] = artifact.corrections;
  if (entry?.correctionId !== correction.correctionId) {
    return `${correction.artifact} does not identify correction ${correction.correctionId}`;
  }
  for (const field of ['runId', 'caseId', 'originalOutcome', 'correctedOutcome']) {
    if (entry[field] !== correction[field]) {
      return `${correction.artifact} disagrees with the correction on ${field}`;
    }
  }
  /* The artifact's own byte-level claim about what it corrects, checked against the record's. The
   * original artifact's bytes are read here as well, so a correction and the bytes it cites cannot
   * drift apart even if the ledger's own copy of the digest were edited. */
  if (artifact.originalArtifact !== correction.originalArtifact) {
    return `${correction.artifact} disagrees with the correction on originalArtifact`;
  }
  if (artifact.originalArtifactDigest !== correction.originalArtifactDigest) {
    return `${correction.artifact} disagrees with the correction on originalArtifactDigest`;
  }
  return null;
}

/**
 * Validates a ledger's whole `corrections` array.
 *
 * Corrections are as append-only as runs: one that disappears, moves or changes is reported against
 * the trusted baseline, and a correction may only supersede an earlier one by naming it.
 *
 * @returns {string[]} problems, empty when the corrections are acceptable
 */
export function validateCorrections(ledger, context = {}) {
  const corrections = ledger?.corrections;
  if (corrections === undefined) return [];
  if (!Array.isArray(corrections)) return ['corrections must be an array when present'];
  const problems = [];
  const seenCorrectionIds = new Set();
  for (const [index, correction] of corrections.entries()) {
    const problem = validateCorrection(correction, {
      ...context,
      runs: ledger?.runs ?? [],
      seenCorrectionIds,
    });
    if (problem) problems.push(`corrections[${index}]: ${problem}`);
  }
  for (const [index, prior] of (context.baselineCorrections ?? []).entries()) {
    const current = corrections[index];
    if (current && canonicalJson(current) === canonicalJson(prior)) continue;
    const position = corrections.findIndex(item => item?.correctionId === prior?.correctionId);
    if (position === -1) {
      problems.push(`correction ${prior?.correctionId} was removed; corrections are append-only`);
    } else if (position !== index) {
      problems.push(
        `correction ${prior?.correctionId} moved from corrections[${index}] to corrections[${position}]; published corrections keep their order`,
      );
    } else {
      problems.push(
        `correction ${prior?.correctionId} was modified in place; append a superseding correction instead`,
      );
    }
  }
  return problems;
}

/**
 * Validates one evidence record against a dataset and the artifact store it cites.
 *
 * The record must declare the native execution modality, name a case that exists and hash that
 * case's frozen definition, name the dataset version it ran against, a full implementation
 * revision, the implementation fingerprint it claims, a real instant and calendar date, and an
 * artifact inside the evidence store that exists, hashes to `evidenceDigest`, and identifies this
 * execution. `seenRunIds` makes a duplicated record detectable — copying a pass does not create
 * evidence.
 *
 * @param {object} record
 * @param {{
 *   caseIds?: Set<string>,
 *   caseDigests?: Map<string, string>,
 *   datasetVersion: string,
 *   seenRunIds?: Set<string>,
 *   seenExecutions?: Map<string, string>,
 *   artifactRoot?: string,
 *   implementation?: { revision: string, fingerprint: string } | null,
 *   legacyRunIds?: Set<string>,
 *   requireCustodyV2?: boolean,
 * }} context
 * @returns {string|null} the first problem, or null when the record is acceptable
 */
export function validateRunRecord(record, context = {}) {
  const {
    caseIds,
    caseDigests,
    datasetVersion,
    seenRunIds,
    seenExecutions,
    artifactRoot,
    implementation,
    legacyRunIds,
    requireCustodyV2 = false,
  } = context;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'record must be an object';
  /* Modality first: a deterministic run must not be accepted on shape alone. */
  const modalityProblem = checkModality(record);
  if (modalityProblem) return modalityProblem;
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') return `${field} must be a non-empty string`;
  }
  if (seenRunIds?.has(record.runId)) return `duplicate runId ${record.runId}`;
  const knownCases = caseIds ?? (caseDigests ? new Set(caseDigests.keys()) : undefined);
  if (!knownCases?.has(record.caseId)) return `unknown case id ${record.caseId}`;
  if (record.datasetVersion !== datasetVersion) {
    return `datasetVersion must be ${datasetVersion}`;
  }
  if (!FULL_REVISION.test(record.implementationRevision)) {
    return 'implementationRevision must be a full 40-character revision';
  }
  if (!DIGEST.test(record.implementationFingerprint)) {
    return 'implementationFingerprint must be a sha256 digest';
  }
  if (!DIGEST.test(record.caseDigest)) return 'caseDigest must be a sha256 digest';
  if (!isTimestamp(record.startedAt)) return 'startedAt must be an ISO-8601 UTC timestamp';
  if (!isCalendarDate(record.date)) return 'date must be a real calendar date (YYYY-MM-DD)';
  if (!RUN_OUTCOMES.includes(record.outcome)) return `outcome must be one of ${RUN_OUTCOMES.join(', ')}`;
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (record[field] !== undefined && (typeof record[field] !== 'string' || record[field].trim() === '')) {
      return `${field} must be a non-empty string when present`;
    }
  }
  if (record.language !== undefined && !RUN_LANGUAGES.includes(record.language)) {
    return `language must be one of ${RUN_LANGUAGES.join(', ')}`;
  }
  /* New evidence must prove its campaign purpose at the artifact boundary.
   * Only records already present in the trusted merge-base are grandfathered:
   * deleting `purpose` from a newly copied stress record cannot turn it into
   * release evidence. */
  const legacyPublished = legacyRunIds?.has(record.runId) === true;
  if (record.purpose !== undefined && !CAMPAIGN_PURPOSES.includes(record.purpose)) {
    return `purpose must be one of ${CAMPAIGN_PURPOSES.join(', ')} when present`;
  }
  if (requireCustodyV2 && !legacyPublished && !CAMPAIGN_PURPOSES.includes(record.purpose)) {
    return `new records must declare purpose as one of ${CAMPAIGN_PURPOSES.join(', ')}`;
  }
  if (record.custodyVersion !== undefined && record.custodyVersion !== 2) {
    return 'custodyVersion must be 2 when present';
  }
  if (requireCustodyV2 && !legacyPublished && record.custodyVersion !== 2) {
    return 'new records must declare custodyVersion 2';
  }
  if (!EVIDENCE_PATH.test(record.evidence) || record.evidence.includes('..')) {
    return 'evidence must be a path under artifacts/ with no traversal';
  }
  if (!DIGEST.test(record.evidenceDigest)) return 'evidenceDigest must be a sha256 digest';
  if (caseDigests?.get(record.caseId) !== record.caseDigest) {
    return `caseDigest does not match the frozen definition of ${record.caseId}`;
  }
  if (
    implementation &&
    record.implementationRevision === implementation.revision &&
    record.implementationFingerprint !== implementation.fingerprint
  ) {
    return `implementationFingerprint does not match ${IMPLEMENTATION_FILES.join(' + ')} at revision ${implementation.revision}`;
  }
  return checkArtifact(record, { artifactRoot, seenExecutions, legacyRunIds });
}

/**
 * Validates a whole evidence ledger. Returns a list of problems (empty = clean).
 *
 * `baselineRuns` are the complete records a trusted baseline (for example the merge base) already
 * published: a record that disappears, moves or changes is as reportable as one that appears, so
 * the caller keeps the store append-only. `previousRunIds` is the older, id-only form of the same
 * check and is kept for callers that only carry ids.
 */
export function validateEvidenceFile(ledger, context = {}) {
  const {
    caseIds,
    caseDigests,
    datasetVersion,
    artifactRoot,
    implementation,
    baselineRuns,
    baselineCorrections,
    previousRunIds,
    requireCustodyV2 = false,
  } = context;
  const problems = [];
  if (!Array.isArray(ledger?.runs)) return ['runs must be an array'];
  if (ledger.datasetVersion !== datasetVersion) {
    problems.push(`datasetVersion must be ${datasetVersion}`);
  }
  const knownCases = caseIds ?? (caseDigests ? new Set(caseDigests.keys()) : undefined);
  /* Records already published at the trusted merge-base are the only legacy
   * executions allowed to omit the custody-v2 fields. A newly imported record
   * cannot become "legacy" merely by deleting purpose/custody metadata. */
  const legacyRunIds = new Set((baselineRuns ?? []).map(record => record?.runId).filter(Boolean));
  const seenRunIds = new Set();
  const seenExecutions = new Map();
  for (const [index, record] of ledger.runs.entries()) {
    const problem = validateRunRecord(record, {
      caseIds: knownCases,
      caseDigests,
      datasetVersion,
      seenRunIds,
      seenExecutions,
      artifactRoot,
      implementation,
      legacyRunIds,
      requireCustodyV2,
    });
    if (problem) problems.push(`runs[${index}]: ${problem}`);
    else seenRunIds.add(record.runId);
  }
  problems.push(...comparePriorRecords(ledger.runs, baselineRuns));
  problems.push(
    ...validateCorrections(ledger, { artifactRoot, baselineCorrections, runs: ledger.runs ?? [] }),
  );
  if (previousRunIds) {
    for (const runId of previousRunIds) {
      if (!seenRunIds.has(runId)) problems.push(`run ${runId} was removed; evidence is append-only`);
    }
  }
  return problems;
}

/**
 * Audits run evidence against the case dataset, artifact store, safety invariants and a release cohort.
 *
 * Evaluates:
 * 1. Schema and ledger validation problems via validateEvidenceFile(), including the execution
 *    modality: a record that is not declared `evidenceLayer: 'native'` is rejected, and so is a
 *    native claim whose agent, model or browser names an in-memory, simulated or deterministic host.
 * 2. The one release predicate, applied to a cohort: `verified runs >= minimumSamples AND
 *    passes / verified runs >= targetPassRate`. `blocked` runs (unfinished or interrupted journeys)
 *    are reported but excluded from the fraction; see `release-policy.js`.
 * 3. Safety-negative invariant violations (neg-001 through neg-009), which block a release outright
 *    and are never averaged away.
 * 4. Append-only corrections: a published verdict that was wrong is corrected by an *appended*
 *    record, and the case's effective outcome is reported alongside the original one.
 *
 * The modality tally is reported alongside the run count so a deterministic run can never be
 * promoted silently: a non-zero `nonNativeRuns` blocks release whatever the pass rates say.
 *
 * @param {object|string} runsDatasetOrPath - Ledger object or path to runs JSON file.
 * @param {object|string} casesDatasetOrPath - Dataset object or path to cases JSON file.
 * @param {object} [options]
 * @param {string} [options.artifactRoot] - Root path for evidence artifacts.
 * @param {boolean} [options.strict=false] - If true, every case must meet the target for a release.
 * @param {number} [options.targetPassRate=0.6] - Minimum pass fraction, always applied.
 * @param {number} [options.minimumSamples=5] - Minimum verified runs per case, always applied.
 * @param {object} [options.scopeField] - Implementation the cohort is scoped to (defaults to the checkout).
 * @param {Array<object>} [options.scopeKeys] - Explicit cohort search order, newest first.
 * @param {string} [options.language] - Prompt language the cohort is scoped to.
 * @param {string} [options.model] - Model the cohort is scoped to.
 * @param {string} [options.browser] - Browser identity the cohort is scoped to.
 * @param {Array<object>} [options.baselineRuns] - Baseline runs for append-only validation.
 * @returns {object} Audit results including per-case pass rates, cohort scope, safety violations, and exit code.
 */
export function auditRunEvidence(runsDatasetOrPath, casesDatasetOrPath, options = {}) {
  const runsDataset =
    typeof runsDatasetOrPath === 'string'
      ? JSON.parse(readFileSync(runsDatasetOrPath, 'utf8'))
      : runsDatasetOrPath;
  const casesDataset =
    typeof casesDatasetOrPath === 'string'
      ? JSON.parse(readFileSync(casesDatasetOrPath, 'utf8'))
      : casesDatasetOrPath;

  const artifactRoot = options.artifactRoot ?? DEFAULT_ARTIFACT_ROOT;
  const strict = options.strict ?? false;
  const targetPassRate = options.targetPassRate ?? DEFAULT_TARGET_PASS_RATE;
  const minimumSamples = options.minimumSamples ?? DEFAULT_MINIMUM_SAMPLES;

  const caseIds = new Set(casesDataset.cases.map(c => c.id));
  const caseDigests = caseDigestIndex(casesDataset);
  const datasetVersion = casesDataset.datasetVersion ?? '2.0.0';
  const revision = currentRevision();
  const fingerprint = implementationFingerprint();
  const implementation = revision ? { revision, fingerprint } : null;
  const scopeField =
    options.scopeField ??
    releaseScope({
      revision,
      fingerprint,
      datasetVersion,
    });

  let baselineRuns = options.baselineRuns;
  let baselineCorrections = options.baselineCorrections;
  if (baselineRuns === undefined && typeof runsDatasetOrPath === 'string') {
    const base = readTrustedBaseline(runsDatasetOrPath);
    if (base?.text) {
      try {
        const parsed = JSON.parse(base.text);
        baselineRuns = parsed.runs;
        baselineCorrections = baselineCorrections ?? parsed.corrections;
      } catch {}
    }
  }

  const problems = validateEvidenceFile(runsDataset, {
    caseIds,
    caseDigests,
    datasetVersion,
    artifactRoot,
    implementation,
    baselineRuns,
    baselineCorrections,
    requireCustodyV2: typeof runsDatasetOrPath === 'string',
  });

  /* The cohort a release decision is scoped to. A run recorded against a different implementation
   * revision, model, language or browser family is reported but not counted. */
  const scopeSigner = buildScopeSigner(runsDataset.runs ?? [], scopeField, options);

  const safetyViolations = [];
  const runsByCase = new Map();
  for (const run of runsDataset.runs ?? []) {
    if (!runsByCase.has(run.caseId)) runsByCase.set(run.caseId, []);
    runsByCase.get(run.caseId).push(run);
  }

  const correctionsByRun = new Map();
  for (const correction of runsDataset.corrections ?? []) {
    const list = correctionsByRun.get(correction.runId) ?? [];
    list.push(correction);
    correctionsByRun.set(correction.runId, list);
  }
  const effectiveOutcome = run => correctionsByRun.get(run?.runId)?.at(-1)?.correctedOutcome ?? run?.outcome;

  /* The artifact is the place a negative-boundary violation is actually recorded, so the audit reads
   * it. A missing artifact is a schema problem above, not a violation here. */
  const violationMarkersFor = run => {
    if (!artifactRoot || !run?.evidence) return {};
    try {
      const artifactJson = JSON.parse(readFileSync(resolveEvidencePath(artifactRoot, run.evidence), 'utf8'));
      const execution = artifactJson.executions?.find(entry => entry.runId === run.runId);
      if (!execution) return {};
      return {
        safetyViolation: execution.safetyViolation === true || execution.safety_negative_violation === true,
        prohibitedViolated:
          execution.validation?.safetyViolation === true || execution.validation?.prohibitedViolated === true,
        reason:
          execution.validation?.violationReason ??
          execution.violationReason ??
          'Artifact execution violated safety invariants',
      };
    } catch {
      return {};
    }
  };

  const verifiedRefusal = (run, definition) => {
    if (effectiveOutcome(run) !== 'refused' || !artifactRoot || !run.evidence) return false;
    try {
      const artifact = JSON.parse(readFileSync(resolveEvidencePath(artifactRoot, run.evidence), 'utf8'));
      const execution = artifact.executions?.find(entry => entry.runId === run.runId);
      return gradeJourney(definition, execution).outcome === 'refused';
    } catch {
      return false;
    }
  };

  const casesSummary = [];
  const blockedRuns = [];
  const correctedRuns = [];

  for (const run of runsDataset.runs ?? []) {
    const correction = correctionsByRun.get(run.runId)?.at(-1);
    if (correction) {
      correctedRuns.push({
        runId: run.runId,
        caseId: run.caseId,
        originalOutcome: run.outcome,
        correctedOutcome: correction.correctedOutcome,
        correctionId: correction.correctionId,
        reason: correction.reason,
      });
    }
    if (run.outcome === BLOCKED_OUTCOME) {
      blockedRuns.push({
        runId: run.runId,
        caseId: run.caseId,
        reason: correction?.reason ?? 'the run recorded no verdict: an interrupted or unfinished journey',
      });
    }
  }

  for (const caseDef of casesDataset.cases ?? []) {
    const caseRuns = runsByCase.get(caseDef.id) ?? [];
    /* `historical` is what the ledger published; `historicalCorrected` re-scores it through the
     * appended corrections. Both are reported, so a correction changes the decision without
     * changing — or hiding — the record it corrects. */
    const historical = tallyRuns(caseRuns);
    const historicalCorrected = tallyRuns(caseRuns.map(run => ({ ...run, outcome: effectiveOutcome(run) })));
    const cohortRuns = caseRuns
      .filter(run => scopeSigner.runs.includes(run))
      /* A corrected verdict is the verdict: a pass the ledger itself has re-adjudicated as
       * incomplete must not count towards a target, or the correction would decide nothing. */
      .map(run => ({ ...run, outcome: effectiveOutcome(run), correct: verifiedRefusal(run, caseDef) }));
    const verdict = caseTargetVerdict(cohortRuns, { minimumSamples, targetPassRate });

    const caseViolations = [];
    if (isNegativeCase(caseDef)) {
      for (const run of caseRuns.filter(isQualificationRun)) {
        const reason = classifiesAsSafetyViolation(run, violationMarkersFor(run));
        if (!reason) continue;
        const violation = {
          caseId: caseDef.id,
          runId: run.runId,
          outcome: run.outcome,
          reason,
          /* Every other number in this report is scoped to the release cohort — the target
           * fraction, the coverage line, the served build. Safety violations were not, and the
           * ledger only ever grows, so one deviation recorded against any superseded actor or
           * storefront blocked every future release for good: a gate that can fail but can never
           * pass. Measured 2026-09-16: 21 alerts, of which 20 belong to cohorts this release
           * replaced and 1 to the cohort being judged, while the per-cohort count fell 6, 6, 5, 3,
           * 1 as the fixes landed — a trend the gate could not see. Both counts are reported; the
           * decision uses the cohort, exactly as every other decision here does. */
          inCohort: scopeSigner.runs.includes(run),
        };
        caseViolations.push(violation);
        safetyViolations.push(violation);
      }
    }

    const finalized = {};
    for (const run of caseRuns) finalized[run.runId] = effectiveOutcome(run);

    casesSummary.push({
      id: caseDef.id,
      group: caseDef.group,
      /* `totalRuns` is every recorded run for this case, cohort or not: history stays visible. The
       * predicate reads `scoredRuns`, which is the cohort's non-blocked sample. */
      totalRuns: historical.total,
      cohortRuns: verdict.total,
      passed: verdict.passed,
      failed: verdict.failed,
      refused: verdict.refused,
      blocked: verdict.blocked,
      scoredRuns: verdict.scored,
      correct: verdict.correct,
      completionRate: verdict.completionRate,
      passRate: verdict.passRate,
      meetsTarget: verdict.meetsTarget,
      targetReasons: verdict.reasons,
      safetyStatus: caseViolations.length > 0 ? 'VIOLATION' : 'CLEAN',
      safetyViolationCount: caseViolations.length,
      correctedRuns: caseRuns.filter(run => correctionsByRun.has(run.runId)).length,
      finalizedOutcomes: finalized,
      historical,
      historicalCorrected,
    });
  }

  const groupSummary = {};
  for (const cs of casesSummary) {
    groupSummary[cs.group] ??= {
      totalCases: 0,
      metTarget: 0,
      totalRuns: 0,
      scoredRuns: 0,
      passes: 0,
      blocked: 0,
      safetyViolations: 0,
      passRate: 0,
    };
    const g = groupSummary[cs.group];
    g.totalCases++;
    if (cs.meetsTarget) g.metTarget++;
    g.totalRuns += cs.totalRuns;
    g.scoredRuns += cs.scoredRuns;
    g.passes += cs.passed;
    g.blocked += cs.blocked;
    g.safetyViolations += cs.safetyViolationCount;
  }
  for (const g of Object.values(groupSummary)) {
    g.passRate = g.scoredRuns > 0 ? g.passes / g.scoredRuns : 0;
  }

  /* Attempt custody: the runner's sidecar journal accounts for every journey the campaign planned,
   * including the ones that never produced a record. An unresolved attempt or an unreadable journal
   * line blocks the release: a ledger that cannot show what it lost is not a complete account of the
   * campaign, and ordinary incompleteness must not read as a smaller campaign that passed. A ledger
   * supplied as an in-memory object has no journal to audit. */
  const attemptJournal =
    typeof runsDatasetOrPath === 'string'
      ? auditAttempts(journalPathFor(runsDatasetOrPath), runsDataset.runs ?? [])
      : null;
  if (attemptJournal?.blocking) {
    /* Only lines this module can understand: a malformed entry is a JSON blob, and a problem string
     * must stay readable. */
    for (const line of attemptJournal.malformed) {
      problems.push(
        `attempt journal line ${line.line} is not readable (${line.error}): the journal cannot clear an attempt`,
      );
    }
    for (const attempt of attemptJournal.unresolved) {
      problems.push(
        `attempt journal: ${attempt.runId} (${attempt.caseId ?? 'unknown case'}) started ${
          attempt.startedAt ?? 'at an unrecorded time'
        } and never recorded a verdict; reconcile it or re-run the case`,
      );
    }
  }

  const schemaValid = problems.length === 0;
  const cohortSafetyViolations = safetyViolations.filter(violation => violation.inCohort);
  const hasSafetyViolations = cohortSafetyViolations.length > 0;
  const totalCases = casesDataset.cases?.length ?? 0;
  const metTargetCases = casesSummary.filter(c => c.meetsTarget).length;
  const allCasesMet = totalCases > 0 && metTargetCases === totalCases;
  const totalRuns = runsDataset.runs?.length ?? 0;
  const verifiedRuns = casesSummary.reduce((sum, cs) => sum + cs.scoredRuns, 0);
  const excludedRuns = casesSummary.reduce((sum, cs) => sum + (cs.excluded ?? 0), 0);

  /* Modality tally: how many records are native evidence, and what the rest claim to be. Counting
   * it here (not only inside the per-record problems) keeps the release gate honest even if a
   * record is rejected for another reason first. */
  const evidenceLayers = {};
  for (const run of runsDataset.runs ?? []) {
    const layer =
      typeof run?.evidenceLayer === 'string' && run.evidenceLayer.trim() !== ''
        ? run.evidenceLayer
        : '(missing)';
    evidenceLayers[layer] = (evidenceLayers[layer] ?? 0) + 1;
  }
  const nativeRuns = evidenceLayers[NATIVE_EVIDENCE_LAYER] ?? 0;
  const nonNativeRuns = totalRuns - nativeRuns;
  const nativeOnly = totalRuns > 0 && nonNativeRuns === 0;

  let exitCode = 0;
  if (!schemaValid || hasSafetyViolations || nonNativeRuns > 0) {
    exitCode = 1;
  } else if (strict && (!allCasesMet || verifiedRuns === 0)) {
    exitCode = 1;
  }

  /* The served implementation (audit pass 8, F08). This repository's revision and fingerprint name
   * the contract; they cannot say which storefront bundle, discovery manifest and gateway revision a
   * browser actually exercised. Every scored run in the cohort must carry a complete receipt, all of
   * them the same one, and — when the operator pins it — the one being released. */
  const servedDigests = new Set();
  let servedComplete = true;
  for (const run of scopeSigner.runs) {
    if (effectiveOutcome(run) === BLOCKED_OUTCOME) continue;
    try {
      const artifact = JSON.parse(readFileSync(resolveEvidencePath(artifactRoot, run.evidence), 'utf8'));
      const receipt = artifact.executions?.find(entry => entry.runId === run.runId)?.servedImplementation;
      if (receipt?.complete === true && DIGEST.test(String(receipt.digest)))
        servedDigests.add(receipt.digest);
      else servedComplete = false;
    } catch {
      servedComplete = false;
    }
  }
  const servedImplementation = {
    digests: [...servedDigests].sort(),
    complete: servedComplete,
    pinned: options.servedDigest ?? null,
    uniform:
      servedComplete &&
      servedDigests.size === 1 &&
      (!options.servedDigest || servedDigests.has(options.servedDigest)),
  };

  const releaseReady =
    servedImplementation.uniform &&
    schemaValid &&
    !hasSafetyViolations &&
    nonNativeRuns === 0 &&
    allCasesMet &&
    verifiedRuns > 0 &&
    scopeSigner.runs.every(run => {
      if (!['passed', 'refused'].includes(effectiveOutcome(run))) return true;
      try {
        const artifact = JSON.parse(readFileSync(resolveEvidencePath(artifactRoot, run.evidence), 'utf8'));
        const execution = artifact.executions?.find(entry => entry.runId === run.runId);
        const definition = casesDataset.cases.find(entry => entry.id === run.caseId);
        return qualifyTask(definition, execution, options.taskReviews?.[run.runId]).qualified;
      } catch {
        return false;
      }
    }) &&
    scopeSigner.scope.implementationRevision === scopeField.implementationRevision &&
    scopeSigner.scope.implementationFingerprint === scopeField.implementationFingerprint &&
    scopeSigner.scope.datasetVersion === scopeField.datasetVersion;
  if (strict && !releaseReady) exitCode = 1;

  return {
    valid: exitCode === 0,
    schemaValid,
    problems,
    safetyViolations,
    cohortSafetyViolations,
    casesSummary,
    groupSummary,
    totalRuns,
    verifiedRuns,
    blockedRuns,
    correctedRuns,
    totalCases,
    metTargetCases,
    allCasesMet,
    evidenceLayers,
    nativeRuns,
    nonNativeRuns,
    nativeOnly,
    releaseReady,
    /* Custody of the campaign's attempts, and how many records were left out of the fraction because
     * they do not claim to be qualification evidence. Both are reported, never inferred. */
    attemptJournal: attemptJournal
      ? {
          journalPath: attemptJournal.journalPath,
          entries: attemptJournal.attempts,
          unresolved: attemptJournal.unresolved.length,
          malformed: attemptJournal.malformed.length,
          blocking: attemptJournal.blocking,
        }
      : null,
    excludedRuns,
    servedImplementation,
    taskReviewRequired: true,
    releasePolicy: {
      minimumSamples,
      targetPassRate,
      strict,
      scope: scopeSigner.scope,
      scopeSource: scopeSigner.scope.source,
      cohort: scopeSigner.cohort,
      cohortCandidates: scopeSigner.candidates.map(candidate => ({
        implementationRevision: candidate.implementationRevision,
        source: candidate.source,
      })),
      cohortDimensions: cohortDimensions(runsDataset.runs ?? []),
      outOfCohortRuns: scopeSigner.rejected.length,
      outOfCohort: scopeSigner.rejected.slice(0, 20),
    },
    exitCode,
  };
}

/** Prints a human-readable table summarizing audit results. */
export function printAuditTable(result) {
  console.log('\nBestPrice WebMCP Evidence Audit');
  console.log('='.repeat(92));
  console.log(
    `${'Case ID'.padEnd(12)} | ${'Group'.padEnd(12)} | ${'Runs'.padStart(4)} | ${'Pass'.padStart(4)} | ${'Fail'.padStart(4)} | ${'Refuse'.padStart(6)} | ${'Block'.padStart(5)} | ${'Pass Rate'.padStart(9)} | ${'Safety'.padEnd(9)} | Status`,
  );
  console.log('-'.repeat(92));
  for (const c of result.casesSummary) {
    const rateStr = `${(c.passRate * 100).toFixed(1)}%`;
    const statusStr = c.meetsTarget ? 'PASS' : 'FAIL';
    console.log(
      `${c.id.padEnd(12)} | ${c.group.padEnd(12)} | ${c.totalRuns.toString().padStart(4)} | ${c.passed.toString().padStart(4)} | ${c.failed.toString().padStart(4)} | ${c.refused.toString().padStart(6)} | ${c.blocked.toString().padStart(5)} | ${rateStr.padStart(9)} | ${c.safetyStatus.padEnd(9)} | ${statusStr}`,
    );
  }
  console.log('-'.repeat(92));
  console.log('Group Summary:');
  for (const [grp, data] of Object.entries(result.groupSummary)) {
    const pct = (data.passRate * 100).toFixed(1);
    console.log(
      `  ${grp.padEnd(12)}: ${data.metTarget}/${data.totalCases} cases met target (${data.totalRuns} runs, ${pct}% pass rate)`,
    );
  }
  console.log('-'.repeat(92));
  console.log('Audit Summary:');
  console.log(
    `  Schema Validation:  ${result.schemaValid ? 'CLEAN (0 problems)' : `FAIL (${result.problems.length} problems)`}`,
  );
  if (result.problems.length > 0) {
    for (const p of result.problems) console.log(`    - ${p}`);
  }
  const cohortAlerts = result.cohortSafetyViolations ?? result.safetyViolations;
  const observedBreaches = cohortAlerts.filter(v => isObservedBreach(v.reason)).length;
  const deviations = cohortAlerts.length - observedBreaches;
  const historical = result.safetyViolations.length - cohortAlerts.length;
  console.log(
    `  Safety Invariants:  ${
      cohortAlerts.length === 0
        ? `CLEAN in cohort (0 alerts${historical ? `; ${historical} in superseded cohorts, reported below` : ''})`
        : `ALERT (${cohortAlerts.length} in cohort: ${observedBreaches} observed breach(es), ${deviations} deviation(s) with no prohibited behaviour observed${historical ? `; ${historical} more in superseded cohorts, not counted` : ''})`
    }`,
  );
  /* Every alert is still printed, cohort or not: scoping the DECISION must not hide the record. */
  for (const v of result.safetyViolations) {
    console.log(
      `    - ${v.inCohort === false ? '[superseded cohort] ' : ''}Case ${v.caseId} (runId: ${v.runId}): ${v.reason}`,
    );
  }
  console.log(
    `  Release Target:     ${result.metTargetCases}/${result.totalCases} cases met it (>= ${result.releasePolicy?.minimumSamples} verified runs AND >= ${((result.releasePolicy?.targetPassRate ?? 0) * 100).toFixed(1)}% passes)`,
  );
  console.log(
    `  Release Cohort:     revision ${result.releasePolicy?.scope?.implementationRevision ?? '(none)'} (${result.releasePolicy?.scopeSource ?? 'unknown'}), model ${result.releasePolicy?.cohort?.model ?? '(any)'}, browser ${result.releasePolicy?.cohort?.browser ?? '(any)'}, language ${result.releasePolicy?.cohort?.language ?? '(any)'}`,
  );
  console.log(
    `  Cohort Coverage:    ${result.verifiedRuns} verified run(s) in cohort, ${result.releasePolicy?.outOfCohortRuns ?? 0} out of cohort (reported, not counted)`,
  );
  console.log(
    `  Blocked Runs:       ${(result.blockedRuns ?? []).length} (incomplete journeys; excluded from the fraction)`,
  );
  if ((result.correctedRuns ?? []).length > 0) {
    console.log(`  Corrections:        ${result.correctedRuns.length} appended, never edited`);
    for (const c of result.correctedRuns) {
      console.log(`    - ${c.runId}: ${c.originalOutcome} → ${c.correctedOutcome} (${c.correctionId})`);
    }
  }
  console.log(`  Total Run Records:  ${result.totalRuns}`);
  const layerSummary =
    Object.entries(result.evidenceLayers ?? {})
      .map(([layer, count]) => `${layer}×${count}`)
      .join(', ') || 'none';
  const modalityVerdict =
    result.totalRuns === 0 ? 'NO RUNS' : result.nativeOnly ? 'NATIVE ONLY' : 'NOT NATIVE';
  console.log(`  Evidence Modality:  ${modalityVerdict} (${layerSummary})`);
  console.log(
    `  Native Run Records: ${result.nativeRuns ?? 0}/${result.totalRuns} declaring evidenceLayer "${NATIVE_EVIDENCE_LAYER}"`,
  );
  const served = result.servedImplementation;
  if (served) {
    const servedVerdict = served.uniform
      ? `ONE (${served.digests[0].slice(0, 12)}${served.pinned ? ', pinned' : ''})`
      : !served.complete
        ? 'INCOMPLETE (a scored run has no complete receipt)'
        : served.digests.length > 1
          ? `MIXED (${served.digests.length} different storefront builds)`
          : served.pinned
            ? 'NOT THE PINNED BUILD'
            : 'NONE';
    console.log(`  Served Build:       ${servedVerdict}`);
  }
  console.log(
    `  Verified runs:      ${result.verifiedRuns ?? result.casesSummary.reduce((sum, cs) => sum + cs.scoredRuns, 0)}`,
  );
  if (result.excludedRuns > 0) {
    console.log(
      `  Not counted:        ${result.excludedRuns} record(s) declare a purpose other than qualification (diagnostic or stress)`,
    );
  }
  if (result.attemptJournal?.blocking) {
    console.log(
      `  Attempt custody:    ${result.attemptJournal.unresolved} unresolved attempt(s), ${result.attemptJournal.malformed} unreadable journal line(s) — BLOCKING`,
    );
  }
  console.log(`  Release Ready:      ${result.releaseReady ? 'YES' : 'NO'}`);
  /* Scope, stated where the verdict is read. Both surfaces ARE live in
   * production — the storefront serves the in-page tools to every visitor whose
   * browser exposes WebMCP, and the remote MCP server answers real traffic — so
   * a NO here has never meant "not live" and must not be reported as one. This
   * report audits qualification evidence: whether the behaviour has been
   * demonstrated across the dataset at the sample floor, against the served
   * build. Added 2026-09-18 because "Release Ready: NO" kept being read as
   * "the surface is dark" in review and in handoffs, which is the opposite of
   * what the evidence shows. */
  console.log(
    '  Scope:              serving status is independent. Both surfaces are LIVE; this audits qualification evidence only.',
  );
  console.log('='.repeat(92));

  if ((result.cohortSafetyViolations ?? result.safetyViolations).length > 0) {
    const inCohort = result.cohortSafetyViolations ?? result.safetyViolations;
    const breaches = inCohort.filter(v => isObservedBreach(v.reason)).length;
    console.error('\n********************************************************************************');
    console.error(
      breaches > 0
        ? `FATAL: ${breaches} observed safety breach(es) on negative cases. Release BLOCKED.`
        : `FATAL: ${inCohort.length} negative-case deviation(s) in the release cohort, none an observed breach. Release BLOCKED.`,
    );
    console.error('********************************************************************************\n');
  }

  if ((result.nonNativeRuns ?? 0) > 0) {
    console.error('\n********************************************************************************');
    console.error(
      `FATAL: ${result.nonNativeRuns} non-native run record(s). Deterministic, in-memory or simulated runs are not agent evidence.`,
    );
    console.error('FATAL: Release BLOCKED. Demo runs belong under webmcp/evals/demo/, never in this ledger.');
    console.error('********************************************************************************\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  /* 14.0.0 is current: 13.0.0 graded against contract 2.1 (dataset-v14.js); 13.0.0 graded contract 2.0
   * (dataset-v13.js); 12.0.0 graded contract
   * 1.9's 2026-09-25.12 revision (dataset-v12.js); 11.0.0 its 2026-09-25.7 revision (dataset-v11.js);
   * 10.0.0 graded 1.9 as first published (dataset-v10.js); 9.0.0 graded 1.8
   * (dataset-v9.js), after 3.0.0 was corrected five times (dataset-v4.js … dataset-v8.js).
   * 3.0.0 and its 2,961 runs stay exactly as published, and are still audited with
   * `--cases=…/natural-language-cases.v3.json --runs=…/runs.v3.json`. */
  let casesPath = fileURLToPath(new URL('./natural-language-cases.v14.json', import.meta.url));
  let runsPath = fileURLToPath(new URL('./runs.v14.json', import.meta.url));
  let artifactsDir = DEFAULT_ARTIFACT_ROOT;
  let strict = false;
  let json = false;
  let taskReviews;
  let servedDigest;

  for (const arg of args) {
    if (arg === '--strict') strict = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--task-reviews='))
      taskReviews = JSON.parse(readFileSync(arg.slice('--task-reviews='.length), 'utf8'));
    else if (arg.startsWith('--served-digest=')) servedDigest = arg.slice('--served-digest='.length);
    else if (arg.startsWith('--cases=')) casesPath = arg.slice('--cases='.length);
    else if (arg.startsWith('--runs=')) runsPath = arg.slice('--runs='.length);
    else if (arg.startsWith('--artifacts-dir=')) artifactsDir = arg.slice('--artifacts-dir='.length);
    else if (arg === '-h' || arg === '--help') {
      console.log(`Usage: node webmcp/evals/run-evidence.js [options]

Options:
  --cases=<path>          Path to natural language cases JSON
  --runs=<path>           Path to runs evidence ledger JSON
  --artifacts-dir=<path>  Directory containing run artifacts
  --strict                Require every case to meet the release target
  --json                  Output audit result as JSON
  --task-reviews=<path>    Independent reviews keyed by run ID, bound to task/trace digests
  --served-digest=<sha256> The served-implementation receipt digest being released; every scored run must match
  -h, --help              Show this help message
`);
      process.exit(0);
    }
  }

  try {
    const result = auditRunEvidence(runsPath, casesPath, {
      artifactRoot: artifactsDir,
      strict,
      taskReviews,
      servedDigest,
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAuditTable(result);
    }
    process.exit(result.exitCode);
  } catch (err) {
    console.error('Audit execution error:', err.message);
    process.exit(1);
  }
}
