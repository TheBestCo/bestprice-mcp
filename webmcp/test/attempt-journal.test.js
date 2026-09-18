/**
 * Attempt custody and campaign purpose.
 *
 * Two properties the release claim rests on, neither of which the ledger of verdicts can express:
 * every journey the campaign planned is accounted for, and a run that was not qualification evidence
 * cannot be counted as any. Both are asserted from the outside — the journal file and the validator —
 * so a passing test means the behaviour, not the intention.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  appendAttempt,
  auditAttempts,
  journalPathFor,
  reconcileAttempts,
  unresolvedAttempts,
} from '../evals/attempt-journal.js';
import { caseTargetVerdict, isQualificationRun, tallyRuns } from '../evals/release-policy.js';

const EVAL_DIR = fileURLToPath(new URL('../evals/', import.meta.url));
const RUNNER = join(EVAL_DIR, 'native-run.mjs');
const DATASET = join(EVAL_DIR, 'natural-language-cases.v8.json');
const LEDGER = join(EVAL_DIR, 'runs.v8.json');

const scratch = () => mkdtempSync(join(tmpdir(), 'attempt-journal-'));
const withStore = body => {
  const root = scratch();
  try {
    body(join(root, 'runs.v8.json'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe('the attempt journal accounts for journeys that produced no verdict', () => {
  it('resolves an attempt only when a later line closes it', () => {
    withStore(ledger => {
      const journal = journalPathFor(ledger);
      assert.equal(journal, `${ledger}.attempts.jsonl`, 'the journal is derived from the ledger path');
      assert.deepEqual(auditAttempts(journal).found, false, 'no journal is not a finding');

      appendAttempt(journal, {
        phase: 'start',
        runId: 'run-a',
        caseId: 'home-004',
        startedAt: '2026-09-18T20:00:00.000Z',
      });
      let audit = auditAttempts(journal);
      assert.equal(audit.unresolved.length, 1);
      assert.equal(audit.blocking, true, 'an attempt that started and never finished blocks');
      assert.match(audit.reasons[0], /run-a \(home-004\) started 2026-09-18T20:00:00.000Z/u);

      appendAttempt(journal, {
        phase: 'finish',
        runId: 'run-a',
        outcome: 'passed',
        finishedAt: '2026-09-18T20:01:00.000Z',
      });
      audit = auditAttempts(journal);
      assert.equal(audit.unresolved.length, 0);
      assert.equal(audit.blocking, false);
      assert.equal(audit.starts, 1, 'the start line stays: the journal is append-only');
    });
  });

  it('reconciles an interrupted attempt by appending, never by deleting or promoting it', () => {
    withStore(ledger => {
      const journal = journalPathFor(ledger);
      appendAttempt(journal, {
        phase: 'start',
        runId: 'run-b',
        caseId: 'multi-002',
        startedAt: '2026-09-18T20:00:00.000Z',
      });
      const before = readFileSync(journal, 'utf8');

      const reconciled = reconcileAttempts(journal, { now: '2026-09-18T21:00:00.000Z' });
      assert.deepEqual(
        reconciled.map(attempt => attempt.runId),
        ['run-b'],
      );
      const after = readFileSync(journal, 'utf8');
      assert.equal(after.startsWith(before), true, 'every published byte is still there, unchanged');
      assert.match(after.slice(before.length), /"phase":"abandoned"/u);

      assert.deepEqual(unresolvedAttempts(journal), [], 'a reconciled attempt no longer blocks');
      assert.equal(auditAttempts(journal).blocking, false);
      assert.equal(
        readFileSync(journal, 'utf8').includes('"phase":"finish"'),
        false,
        'no verdict was invented',
      );
      /* Reconciling again is a no-op rather than a second abandonment. */
      assert.deepEqual(reconcileAttempts(journal), []);
    });
  });

  it('fails closed on a journal it cannot read', () => {
    withStore(ledger => {
      const journal = journalPathFor(ledger);
      appendAttempt(journal, {
        phase: 'start',
        runId: 'run-c',
        caseId: 'listing-009',
        startedAt: '2026-09-18T20:00:00.000Z',
      });
      writeFileSync(journal, `${readFileSync(journal, 'utf8')}{"phase":"start","runI\n`);
      const audit = auditAttempts(journal);
      assert.equal(audit.malformed.length, 1, 'a truncated line is reported, not skipped');
      assert.equal(audit.blocking, true);
      assert.match(audit.reasons.join('\n'), /journal line 2 is not readable/u);
    });
  });
});

describe('a campaign purpose that is not qualification cannot become release evidence', () => {
  const record = (overrides = {}) => ({
    runId: 'run-x',
    caseId: 'home-004',
    outcome: 'passed',
    ...overrides,
  });

  it('counts only qualification records, and reports the rest', () => {
    assert.equal(
      isQualificationRun(record()),
      true,
      'a record written before the field existed still counts',
    );
    assert.equal(isQualificationRun(record({ purpose: 'qualification' })), true);
    assert.equal(isQualificationRun(record({ purpose: 'stress' })), false);
    assert.equal(isQualificationRun(record({ purpose: 'diagnostic' })), false);

    const tally = tallyRuns([
      record({ runId: 'a' }),
      record({ runId: 'b', outcome: 'failed' }),
      record({ runId: 'c', purpose: 'stress' }),
      record({ runId: 'd', purpose: 'diagnostic', outcome: 'failed' }),
    ]);
    assert.equal(tally.total, 2, 'non-qualification records do not pad the sample floor');
    assert.equal(tally.scored, 2);
    assert.equal(tally.passed, 1);
    assert.equal(tally.failed, 1);
    assert.equal(tally.excluded, 2, 'and they are reported rather than silently dropped');

    /* A ledger of nothing but stress runs is an empty cohort, not a green one. */
    const empty = caseTargetVerdict([
      record({ purpose: 'stress' }),
      record({ runId: 'y', purpose: 'stress' }),
    ]);
    assert.equal(empty.total, 0);
    assert.equal(empty.scored, 0);
    assert.equal(empty.meetsTarget, false);
    assert.match(empty.reasons.join('\n'), /only 0 verified run/u);

    /* A refused run that was not qualification evidence cannot be counted as a correct refusal. */
    const refused = caseTargetVerdict([record({ outcome: 'refused', correct: true, purpose: 'stress' })]);
    assert.equal(refused.correct, 0);
  });

  it('refuses to write a non-qualification campaign into the release ledger', () => {
    const refused = spawnSync(
      process.execPath,
      [
        RUNNER,
        '--dataset',
        'v8',
        '--dry-run',
        '--purpose',
        'stress',
        '--agent-command',
        'node -e ""',
        '--browser-command',
        'node -e ""',
        '--agent-name',
        'Attempt custody test',
        '--agent-model',
        'none',
        '--product-url',
        'https://www.bestprice.gr/item/2155772279/apple-iphone-11-64gb.html',
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(refused.status, 0, 'the runner must refuse before producing anything');
    assert.match(refused.stderr, /--purpose stress may not write to the release ledger/u);
    assert.equal(
      readFileSync(LEDGER, 'utf8').includes('"purpose":"stress"'),
      false,
      'the release ledger is untouched',
    );

    /* An unknown purpose is rejected too, rather than becoming an unclassified record. */
    const unknown = spawnSync(
      process.execPath,
      [
        RUNNER,
        '--dataset',
        'v8',
        '--dry-run',
        '--purpose',
        'because',
        '--agent-command',
        'x',
        '--browser-command',
        'y',
        '--agent-name',
        'n',
        '--agent-model',
        'm',
      ],
      { encoding: 'utf8' },
    );
    assert.match(unknown.stderr, /--purpose must be one of qualification, diagnostic, stress/u);
    assert.equal(DATASET.endsWith('.json'), true);
  });
});
