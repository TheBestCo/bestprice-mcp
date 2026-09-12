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

/**
 * Validates one evidence record. Returns null when it is acceptable, otherwise
 * a message naming the first problem.
 */
export function validateRunRecord(record, knownCaseIds) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'record must be an object';
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') return `${field} must be a non-empty string`;
  }
  if (!knownCaseIds.has(record.caseId)) return `unknown case id ${record.caseId}`;
  if (!RUN_OUTCOMES.includes(record.outcome)) return `outcome must be one of ${RUN_OUTCOMES.join(', ')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(record.date)) return 'date must be YYYY-MM-DD';
  if (record.evidence.length > 500) return 'evidence reference is too long';
  return null;
}

/** Validates a whole evidence file. Returns a list of problems (empty = clean). */
export function validateEvidenceFile(dataset, knownCaseIds) {
  const problems = [];
  if (!Array.isArray(dataset?.runs)) return ['runs must be an array'];
  for (const [index, record] of dataset.runs.entries()) {
    const problem = validateRunRecord(record, knownCaseIds);
    if (problem) problems.push(`runs[${index}]: ${problem}`);
  }
  return problems;
}
