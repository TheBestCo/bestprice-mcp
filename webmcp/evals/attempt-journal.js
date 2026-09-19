/**
 * The per-attempt journal: what a campaign was *doing* when it stopped.
 *
 * The ledger records verdicts. A journey that started and never reached one — the browser died, the
 * operator interrupted the campaign, the machine slept — leaves no record and no artifact, so an
 * append-only file of verdicts cannot tell "47 cases, 47 verdicts" from "47 cases, 44 verdicts and
 * three attempts that vanished". Measured 2026-09-18: ten executed journeys produced six records
 * because a missing `--product-url` threw part-way through the loop. The four missing attempts were
 * invisible; the campaign looked small, not incomplete.
 *
 * So the runner writes two lines per attempt, into a sidecar next to the ledger it is filling:
 *
 *   {"phase":"start","runId":…,"caseId":…,"purpose":…,"startedAt":…}
 *   {"phase":"finish","runId":…,"outcome":…,"finishedAt":…}
 *
 * A `start` with no `finish` is an unresolved attempt. Three rules make that state useful rather
 * than noisy:
 *
 * - **It is not a verdict.** Recovery never writes a record into the ledger. It cannot: the artifact
 *   a record must cite does not exist, and inventing one would be the exact failure this module
 *   exists to prevent. An unresolved attempt is *reported* as missing evidence.
 * - **It blocks.** The release validator treats an unresolved attempt as a problem, so a campaign
 *   that quietly lost journeys cannot be read as a complete one.
 * - **Reconciliation is append-only too.** `reconcileAttempts` appends an `abandoned` line naming
 *   what was lost and why; it never deletes or rewrites a `start`. The attempt stays visible in the
 *   journal forever, and stops blocking because a human decided it was abandoned — not because the
 *   evidence was made to look finished.
 *
 * `journalPathFor` derives the sidecar from the ledger path, so a shard writes its own journal and
 * two campaigns against different ledgers never share one.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The sidecar suffix. Appended to the ledger filename, so `runs.v8.json` journals beside itself. */
export const ATTEMPT_JOURNAL_SUFFIX = '.attempts.jsonl';

export const ATTEMPT_PHASES = Object.freeze(['start', 'finish', 'abandoned']);

/** The journal path for a ledger. Both are derived, so neither can be configured to disagree. */
export const journalPathFor = ledgerPath => `${ledgerPath}${ATTEMPT_JOURNAL_SUFFIX}`;

/**
 * Reads a journal.
 *
 * A malformed line is not skipped: a journal that cannot be read cannot clear an attempt, and
 * silently dropping the line would turn corruption into a smaller-looking campaign. The caller
 * decides what that costs, and the validator spends it as a blocked release.
 *
 * @returns {{attempts: Array<object>, malformed: Array<{line: number, error: string}>}}
 */
export function readAttempts(journalPath) {
  let text;
  try {
    text = readFileSync(journalPath, 'utf8');
  } catch (error) {
    /* No journal is not a finding: every campaign that predates this module has none, and so does a
     * dataset whose ledger was written by hand. */
    if (error?.code === 'ENOENT') return { attempts: [], malformed: [] };
    throw error;
  }
  const attempts = [];
  const malformed = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '') continue;
    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== 'object') throw new Error('not an object');
      if (typeof entry.runId !== 'string' || entry.runId.trim() === '') throw new Error('missing runId');
      if (!ATTEMPT_PHASES.includes(entry.phase))
        throw new Error(`phase must be one of ${ATTEMPT_PHASES.join(', ')}`);
      attempts.push(entry);
    } catch (error) {
      malformed.push({ line: index + 1, error: error.message });
    }
  }
  return { attempts, malformed };
}

/** Appends one line. One `write` of one newline-terminated JSON object, so readers never split one. */
export function appendAttempt(journalPath, entry) {
  mkdirSync(dirname(journalPath), { recursive: true });
  appendFileSync(journalPath, `${JSON.stringify(entry)}\n`);
}

/**
 * The attempts that started and never resolved, oldest first.
 *
 * A `finish` or an `abandoned` line resolves every `start` with the same runId — the last phase
 * recorded for a runId wins, because a runId is one attempt and a second `start` for it is a
 * re-entered loop, not a second journey.
 */
export function unresolvedAttempts(journalPath) {
  return unresolvedFromEntries(readAttempts(journalPath).attempts);
}

/* An audit must derive every field from one read. A second read may observe an append and mix
 * unresolved attempts from a later snapshot with starts, terminals and malformed lines from the
 * earlier one. This is snapshot consistency, not a lock on an actively running campaign. */
function unresolvedFromEntries(attempts) {
  const phaseByRunId = new Map();
  const startByRunId = new Map();
  for (const entry of attempts) {
    if (entry.phase === 'start' && !startByRunId.has(entry.runId)) startByRunId.set(entry.runId, entry);
    phaseByRunId.set(entry.runId, entry.phase);
  }
  const unresolved = [];
  for (const [runId, start] of startByRunId) {
    if (phaseByRunId.get(runId) === 'start') unresolved.push(start);
  }
  return unresolved;
}

/**
 * Appends an `abandoned` line for every unresolved attempt, so the next campaign starts from a
 * journal that describes what is actually missing. Returns what was reconciled.
 *
 * @param {string} journalPath
 * @param {{now?: string, reason?: string}} [options]
 */
export function reconcileAttempts(journalPath, options = {}) {
  const unresolved = unresolvedAttempts(journalPath);
  if (unresolved.length === 0) return [];
  const finishedAt = options.now ?? new Date().toISOString();
  const reason =
    options.reason ??
    'the attempt started and never recorded a verdict; it produced no evidence and is not part of the cohort';
  for (const attempt of unresolved) {
    appendAttempt(journalPath, {
      phase: 'abandoned',
      runId: attempt.runId,
      caseId: attempt.caseId ?? null,
      purpose: attempt.purpose ?? null,
      custodyVersion: attempt.custodyVersion ?? null,
      startedAt: attempt.startedAt ?? null,
      finishedAt,
      reason,
    });
  }
  return unresolved;
}

/**
 * What the validator needs to say about a journal.
 *
 * `blocking` is the whole point: unresolved attempts and unreadable lines both mean the ledger
 * cannot be read as a complete account of the campaign.
 *
 * @returns {{journalPath: string, found: boolean, attempts: number, starts: number, unresolved: Array<object>, malformed: Array<object>, blocking: boolean, reasons: Array<string>}}
 */
export function auditAttempts(journalPath, runs = []) {
  const { attempts, malformed } = readAttempts(journalPath);
  const unresolved = unresolvedFromEntries(attempts);
  const reasons = [];
  const starts = new Map();
  const finals = new Map();
  const PURPOSES = new Set(['qualification', 'diagnostic', 'stress']);
  const OUTCOMES = new Set(['passed', 'failed', 'refused', 'blocked']);
  const validInstant = value => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)
    ) {
      return false;
    }
    const parsed = new Date(value);
    /* Date.parse normalizes February 30 and 24:00 into a different day. Evidence must name a
     * real instant as written, not merely a string the runtime can normalize. */
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
  };

  for (const line of malformed) {
    reasons.push(
      `attempt journal line ${line.line} is not readable (${line.error}): the journal cannot clear an attempt`,
    );
  }

  for (const entry of attempts) {
    if (entry.custodyVersion !== undefined && entry.custodyVersion !== null && entry.custodyVersion !== 2) {
      reasons.push(`attempt ${entry.runId} declares unsupported custodyVersion ${entry.custodyVersion}`);
    }

    if (entry.phase === 'start') {
      if (starts.has(entry.runId)) {
        reasons.push(`attempt ${entry.runId} has more than one start line`);
        continue;
      }
      starts.set(entry.runId, entry);
      if (entry.custodyVersion === 2) {
        if (typeof entry.caseId !== 'string' || entry.caseId.trim() === '') {
          reasons.push(`attempt ${entry.runId} custody-v2 start is missing caseId`);
        }
        if (!PURPOSES.has(entry.purpose)) {
          reasons.push(`attempt ${entry.runId} custody-v2 start has invalid purpose`);
        }
        if (!validInstant(entry.startedAt)) {
          reasons.push(`attempt ${entry.runId} custody-v2 start has invalid startedAt`);
        }
      }
      continue;
    }

    if (!starts.has(entry.runId)) {
      reasons.push(`attempt ${entry.runId} has ${entry.phase} without a start line`);
      finals.set(entry.runId, entry);
      continue;
    }
    if (finals.has(entry.runId)) {
      reasons.push(`attempt ${entry.runId} has more than one terminal journal line`);
      continue;
    }
    finals.set(entry.runId, entry);
    const opened = starts.get(entry.runId);
    if (opened.custodyVersion === 2 || entry.custodyVersion === 2) {
      if (opened.custodyVersion !== 2 || entry.custodyVersion !== 2) {
        reasons.push(`attempt ${entry.runId} changes custodyVersion within the journal`);
      }
      if (entry.caseId !== opened.caseId) {
        reasons.push(`attempt ${entry.runId} changes caseId between start and ${entry.phase}`);
      }
      if (entry.purpose !== opened.purpose) {
        reasons.push(`attempt ${entry.runId} changes purpose between start and ${entry.phase}`);
      }
      if (!validInstant(entry.finishedAt)) {
        reasons.push(`attempt ${entry.runId} custody-v2 ${entry.phase} has invalid finishedAt`);
      }
      if (
        validInstant(opened.startedAt) &&
        validInstant(entry.finishedAt) &&
        Date.parse(entry.finishedAt) < Date.parse(opened.startedAt)
      ) {
        reasons.push(`attempt ${entry.runId} ${entry.phase} occurs before its start`);
      }
      if (entry.phase === 'finish' && !OUTCOMES.has(entry.outcome)) {
        reasons.push(`attempt ${entry.runId} custody-v2 finish has invalid outcome`);
      }
    }
  }

  for (const attempt of unresolved) {
    reasons.push(
      `attempt ${attempt.runId} (${attempt.caseId ?? 'unknown case'}) started ${
        attempt.startedAt ?? 'at an unrecorded time'
      } and never recorded a verdict: recover it with --reconcile, or re-run the case`,
    );
  }

  const records = new Map((runs ?? []).map(record => [record?.runId, record]).filter(([runId]) => runId));
  for (const record of runs ?? []) {
    if (record?.custodyVersion !== 2) continue;
    const opened = starts.get(record.runId);
    const closed = finals.get(record.runId);
    if (!opened) {
      reasons.push(`custody-v2 run ${record.runId} has no journal start`);
      continue;
    }
    if (closed?.phase !== 'finish') {
      reasons.push(`custody-v2 run ${record.runId} has no journal finish`);
      continue;
    }
    /* The record is an independent v2 witness. Deleting the version on BOTH journal lines must
     * not downgrade this run into the legacy path and disable validation of its timestamps. */
    if (opened.custodyVersion !== 2 || closed.custodyVersion !== 2) {
      reasons.push(`custody-v2 run ${record.runId} disagrees with its journal custodyVersion`);
    }
    /* The outer record validator requires startedAt; accept minimal records in this helper, but
     * when an execution time is supplied it must bind to the same journal start, byte-for-byte. */
    if (record.startedAt !== undefined && opened.startedAt !== record.startedAt) {
      reasons.push(`custody-v2 run ${record.runId} disagrees with its journal startedAt`);
    }
    if (
      opened.caseId !== record.caseId ||
      opened.purpose !== record.purpose ||
      closed.caseId !== record.caseId ||
      closed.purpose !== record.purpose ||
      closed.outcome !== record.outcome
    ) {
      reasons.push(`custody-v2 run ${record.runId} disagrees with its journal metadata`);
    }
  }

  for (const [runId, closed] of finals) {
    if (closed.custodyVersion !== 2 || closed.phase !== 'finish') continue;
    const record = records.get(runId);
    if (!record) {
      reasons.push(`custody-v2 attempt ${runId} finished but has no durable run record`);
    } else if (record.custodyVersion !== 2) {
      reasons.push(`custody-v2 attempt ${runId} disagrees with its durable record custodyVersion`);
    }
  }

  return {
    journalPath,
    found: attempts.length > 0 || malformed.length > 0,
    attempts: attempts.length,
    starts: attempts.filter(entry => entry.phase === 'start').length,
    unresolved,
    malformed,
    blocking: reasons.length > 0,
    reasons,
  };
}
