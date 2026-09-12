/**
 * Execution evidence lives beside the dataset, never inside it.
 *
 * A case definition is frozen: its prompt, page, expected tools, argument
 * constraints and pass criterion never change once published, and its `runs`
 * array stays empty. What an agent actually did is appended to a separate
 * evidence file that references the case by id. Keeping the two apart is what
 * lets a real run be recorded without weakening the freeze guard — and what
 * stops a run log from silently rewriting the test it is evidence for.
 */

export const RUN_OUTCOMES = Object.freeze(['passed', 'failed', 'refused', 'blocked']);

const REQUIRED_FIELDS = Object.freeze([
  'runId',
  'caseId',
  'datasetVersion',
  'agent',
  'model',
  'browser',
  'implementationRevision',
  'date',
  'outcome',
  'evidence',
]);

/* A real calendar day, not a string that looks like one. */
const isCalendarDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
  );
};

/**
 * Validates one evidence record against a dataset.
 *
 * Shape alone is not evidence: the record must name a case that exists, the
 * dataset version it was run against, a full implementation revision, a real
 * calendar date, and an artifact path inside the evidence store. `seenRunIds`
 * makes a duplicated record detectable — copying a pass does not create
 * evidence.
 *
 * @param {object} record
 * @param {{ caseIds: Set<string>, datasetVersion: string, seenRunIds?: Set<string> }} context
 * @returns {string|null} the first problem, or null when the record is acceptable
 */
export function validateRunRecord(record, { caseIds, datasetVersion, seenRunIds } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'record must be an object';
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') return `${field} must be a non-empty string`;
  }
  if (seenRunIds?.has(record.runId)) return `duplicate runId ${record.runId}`;
  if (!caseIds?.has(record.caseId)) return `unknown case id ${record.caseId}`;
  if (record.datasetVersion !== datasetVersion) {
    return `datasetVersion must be ${datasetVersion}`;
  }
  if (!/^[0-9a-f]{40}$/u.test(record.implementationRevision)) {
    return 'implementationRevision must be a full 40-character revision';
  }
  if (!isCalendarDate(record.date)) return 'date must be a real calendar date (YYYY-MM-DD)';
  if (!RUN_OUTCOMES.includes(record.outcome)) return `outcome must be one of ${RUN_OUTCOMES.join(', ')}`;
  if (!/^artifacts\/[A-Za-z0-9._/-]{1,180}$/u.test(record.evidence) || record.evidence.includes('..')) {
    return 'evidence must be a path under artifacts/ with no traversal';
  }
  return null;
}

/**
 * Validates a whole evidence file. Returns a list of problems (empty = clean).
 *
 * `previousRunIds` is the set recorded before this change (for example from the
 * merge base): a record that disappears is as reportable as one that appears,
 * so the caller keeps the store append-only.
 */
export function validateEvidenceFile(dataset, { caseIds, datasetVersion, previousRunIds } = {}) {
  const problems = [];
  if (!Array.isArray(dataset?.runs)) return ['runs must be an array'];
  if (dataset.datasetVersion !== datasetVersion) {
    problems.push(`datasetVersion must be ${datasetVersion}`);
  }
  const seenRunIds = new Set();
  for (const [index, record] of dataset.runs.entries()) {
    const problem = validateRunRecord(record, { caseIds, datasetVersion, seenRunIds });
    if (problem) problems.push(`runs[${index}]: ${problem}`);
    else seenRunIds.add(record.runId);
  }
  if (previousRunIds) {
    for (const runId of previousRunIds) {
      if (!seenRunIds.has(runId)) problems.push(`run ${runId} was removed; evidence is append-only`);
    }
  }
  return problems;
}
