/** Adversarial journal checks. Synthetic fixtures, never qualification evidence. */
import assert from 'node:assert/strict';
import fs, { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditAttempts, reconcileAttempts } from '../evals/attempt-journal.js';

const fixture = () => {
  const identity = {
    runId: 'run-custody-regression',
    caseId: 'product-011',
    purpose: 'qualification',
    custodyVersion: 2,
  };
  const startedAt = '2026-09-19T04:00:00.000Z';
  return {
    record: { ...identity, startedAt, outcome: 'passed' },
    start: { ...identity, phase: 'start', startedAt },
    finish: {
      ...identity,
      phase: 'finish',
      outcome: 'passed',
      finishedAt: '2026-09-19T04:01:00.000Z',
    },
  };
};

function withJournal(entries, body) {
  const root = mkdtempSync(join(tmpdir(), 'journal-custody-'));
  const journal = join(root, 'synthetic.attempts.jsonl');
  try {
    writeFileSync(journal, entries.map(entry => `${JSON.stringify(entry)}\n`).join(''));
    return body(journal);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function auditFixture({ record, start, finish }) {
  return withJournal([start, finish], journal => {
    const before = readFileSync(journal);
    const audit = auditAttempts(journal, record ? [record] : []);
    assert.deepEqual(readFileSync(journal), before, 'auditing must never rewrite evidence');
    return audit;
  });
}

function expectBlocked(data, reason) {
  const result = auditFixture(data);
  assert.equal(result.blocking, true, `accepted invalid custody: ${JSON.stringify(data)}`);
  assert.match(result.reasons.join('\n'), reason);
}

test('accepts an intact v2 chain without changing its bytes', () => {
  assert.equal(auditFixture(fixture()).blocking, false);
});

for (const version of [undefined, null, 1, '2']) {
  test(`a v2 record cannot borrow journal entries with custodyVersion=${String(version)}`, () => {
    const data = fixture();
    data.start.custodyVersion = version;
    data.finish.custodyVersion = version;
    expectBlocked(data, /custodyVersion/u);
  });

  test(`a v2 journal cannot bind a record with custodyVersion=${String(version)}`, () => {
    const data = fixture();
    data.record.custodyVersion = version;
    expectBlocked(data, /custodyVersion/u);
  });
}

test('version deletion cannot also suppress journal timestamp validation', () => {
  const data = fixture();
  delete data.start.custodyVersion;
  delete data.finish.custodyVersion;
  data.start.startedAt = 'not-a-date';
  data.finish.finishedAt = 'not-a-date';
  expectBlocked(data, /custodyVersion/u);
});

test('binds the journal start to the execution start carried by the record', () => {
  const data = fixture();
  data.record.startedAt = '2026-09-18T04:00:00.000Z';
  expectBlocked(data, /startedAt/u);
});

for (const timestamp of [
  '2026-02-30T04:00:00.000Z',
  '2026-02-29T04:00:00.000Z',
  '2026-09-19T24:00:00.000Z',
  '2026-13-01T04:00:00.000Z',
]) {
  for (const phase of ['start', 'finish']) {
    test(`rejects non-calendar ${phase} timestamp ${timestamp}`, () => {
      const data = fixture();
      if (phase === 'start') {
        data.start.startedAt = timestamp;
        data.record.startedAt = timestamp;
      } else {
        data.finish.finishedAt = timestamp;
      }
      expectBlocked(data, /invalid (startedAt|finishedAt)/u);
    });
  }
}

for (const phase of ['finish', 'abandoned']) {
  test(`rejects ${phase} before the corresponding start`, () => {
    const data = fixture();
    data.finish.phase = phase;
    data.finish.finishedAt = '2026-09-19T03:59:59.999Z';
    if (phase === 'abandoned') {
      data.finish.startedAt = data.start.startedAt;
      data.finish.reason = 'operator reconciled an interrupted synthetic attempt';
      delete data.record;
    }
    expectBlocked(data, /before.*start/u);
  });
}

for (const timestamp of [
  '2024-02-29T04:00:00Z',
  '2024-02-29T04:00:00.1Z',
  '2024-02-29T04:00:00.12Z',
  '2024-02-29T04:00:00.123Z',
]) {
  test(`accepts real UTC timestamps and equal start/finish instants: ${timestamp}`, () => {
    const data = fixture();
    data.record.startedAt = timestamp;
    data.start.startedAt = timestamp;
    data.finish.finishedAt = timestamp;
    assert.equal(auditFixture(data).blocking, false);
  });
}

test('legacy journals remain readable; historical acceptance remains the outer gate responsibility', () => {
  const data = fixture();
  delete data.start.custodyVersion;
  delete data.finish.custodyVersion;
  delete data.record.custodyVersion;
  assert.equal(auditFixture(data).blocking, false);
});

test('abandonment stays append-only and cannot manufacture a durable verdict', () => {
  const { start, record } = fixture();
  withJournal([start], journal => {
    const before = readFileSync(journal, 'utf8');
    reconcileAttempts(journal, { now: '2026-09-19T05:00:00.000Z' });
    assert.ok(readFileSync(journal, 'utf8').startsWith(before));
    assert.equal(auditAttempts(journal).blocking, false);
    const forged = auditAttempts(journal, [record]);
    assert.equal(forged.blocking, true);
    assert.match(forged.reasons.join('\n'), /has no journal finish/u);
  });
});

test('audits one journal snapshot, not metadata from one read and unresolved attempts from another', () => {
  withJournal([], journal => {
    const originalRead = fs.readFileSync;
    let reads = 0;
    fs.readFileSync = (...args) => {
      const value = originalRead(...args);
      if (args[0] === journal) {
        reads += 1;
        if (reads === 1) writeFileSync(journal, `${JSON.stringify(fixture().start)}\n`);
      }
      return value;
    };
    syncBuiltinESMExports();
    let result;
    try {
      result = auditAttempts(journal);
    } finally {
      fs.readFileSync = originalRead;
      syncBuiltinESMExports();
    }
    assert.equal(reads, 1, 'the audit must read exactly one journal snapshot');
    assert.equal(result.found, false);
    assert.equal(result.starts, 0);
    assert.deepEqual(result.unresolved, []);
    assert.equal(result.blocking, false);
    assert.equal(auditAttempts(journal).blocking, true, 'the next snapshot sees the new attempt');
  });
});
