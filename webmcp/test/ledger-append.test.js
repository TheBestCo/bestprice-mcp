import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { appendToLedger } from '../evals/ledger-append.js';

const dir = mkdtempSync(join(tmpdir(), 'webmcp-ledger-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const MODULE = fileURLToPath(new URL('../evals/ledger-append.js', import.meta.url));

test('parallel writers keep every record and the header', async () => {
  const ledger = join(dir, 'runs.json');
  writeFileSync(
    ledger,
    JSON.stringify({ datasetVersion: '3.0.0', note: 'kept', runs: [{ runId: 'run-0' }] }),
  );
  const writers = Array.from(
    { length: 6 },
    (_, writer) =>
      new Promise((resolve, reject) => {
        const code = `import { appendToLedger } from ${JSON.stringify(MODULE)};
for (let i = 0; i < 10; i += 1) appendToLedger(${JSON.stringify(ledger)}, [{ runId: 'run-${writer}-' + i }]);`;
        const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'inherit' });
        child.on('exit', status =>
          status === 0 ? resolve() : reject(new Error(`writer ${writer} exited ${status}`)),
        );
      }),
  );
  await Promise.all(writers);
  const result = JSON.parse(readFileSync(ledger, 'utf8'));
  assert.equal(result.note, 'kept');
  assert.equal(result.runs.length, 61);
  assert.equal(new Set(result.runs.map(record => record.runId)).size, 61);
  assert.equal(result.runs[0].runId, 'run-0');
});

test('a run id already in the ledger is refused, not renamed', () => {
  const ledger = join(dir, 'dupe.json');
  writeFileSync(ledger, JSON.stringify({ runs: [{ runId: 'run-a' }] }));
  assert.throws(() => appendToLedger(ledger, [{ runId: 'run-a' }]), /already in/u);
  assert.deepEqual(JSON.parse(readFileSync(ledger, 'utf8')).runs, [{ runId: 'run-a' }]);
});

test('a held lock times out instead of writing over another writer', () => {
  const ledger = join(dir, 'locked.json');
  writeFileSync(ledger, JSON.stringify({ runs: [] }));
  writeFileSync(`${ledger}.lock`, '');
  assert.throws(
    () => appendToLedger(ledger, [{ runId: 'run-b' }], { waitMs: 100 }),
    /another writer holds it/u,
  );
  rmSync(`${ledger}.lock`);
});
