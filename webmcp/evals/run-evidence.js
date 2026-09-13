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
import { fileURLToPath } from 'node:url';

export const RUN_OUTCOMES = Object.freeze(['passed', 'failed', 'refused', 'blocked']);

/** The implementation a run claims to have exercised: the tool contracts and the registration runtime. */
export const IMPLEMENTATION_FILES = Object.freeze(['webmcp/src/contracts.js', 'webmcp/src/runtime.js']);

/** Committed artifacts live beside the ledger, so an `artifacts/x.json` path resolves here. */
export const DEFAULT_ARTIFACT_ROOT = fileURLToPath(new URL('./artifacts/', import.meta.url));

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const REQUIRED_FIELDS = Object.freeze([
  'runId',
  'caseId',
  'datasetVersion',
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
  'agent',
  'model',
  'browser',
  'implementationRevision',
  'implementationFingerprint',
  'caseDigest',
  'startedAt',
  'date',
  'outcome',
]);

/* Two runs are the same execution when everything but the label matches. */
const IDENTITY_FIELDS = Object.freeze(EXECUTION_FIELDS.filter(field => field !== 'runId'));

const FULL_REVISION = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const EVIDENCE_PATH = /^artifacts\/[A-Za-z0-9._/-]{1,180}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

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
    bytes = readFileSync(join(artifactRoot, record.evidence));
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
 * Validates one evidence record against a dataset and the artifact store it cites.
 *
 * The record must name a case that exists and hash that case's frozen definition, name the dataset
 * version it ran against, a full implementation revision, the implementation fingerprint it claims,
 * a real instant and calendar date, and an artifact inside the evidence store that exists, hashes to
 * `evidenceDigest`, and identifies this execution. `seenRunIds` makes a duplicated record
 * detectable — copying a pass does not create evidence.
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
 * }} context
 * @returns {string|null} the first problem, or null when the record is acceptable
 */
export function validateRunRecord(record, context = {}) {
  const { caseIds, caseDigests, datasetVersion, seenRunIds, seenExecutions, artifactRoot, implementation } =
    context;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'record must be an object';
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
  return checkArtifact(record, { artifactRoot, seenExecutions });
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
  const { caseIds, caseDigests, datasetVersion, artifactRoot, implementation, baselineRuns, previousRunIds } =
    context;
  const problems = [];
  if (!Array.isArray(ledger?.runs)) return ['runs must be an array'];
  if (ledger.datasetVersion !== datasetVersion) {
    problems.push(`datasetVersion must be ${datasetVersion}`);
  }
  const knownCases = caseIds ?? (caseDigests ? new Set(caseDigests.keys()) : undefined);
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
    });
    if (problem) problems.push(`runs[${index}]: ${problem}`);
    else seenRunIds.add(record.runId);
  }
  problems.push(...comparePriorRecords(ledger.runs, baselineRuns));
  if (previousRunIds) {
    for (const runId of previousRunIds) {
      if (!seenRunIds.has(runId)) problems.push(`run ${runId} was removed; evidence is append-only`);
    }
  }
  return problems;
}
