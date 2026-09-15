import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

/*
 * Appends run records to a ledger that other processes may be appending to at the same time.
 *
 * native-run.mjs used to read the ledger when it started and write `[...what it read, ...its runs]`
 * when it finished, so two parallel shards would each erase the other's records. The ledger is now
 * re-read under an exclusive lock at the moment of writing, the new records go after whatever is
 * there, and the file is replaced atomically. A run id already in the ledger is refused rather than
 * renamed: its artifact is already written under that id.
 */
const LOCK_WAIT_MS = 60_000;
const LOCK_POLL_MS = 50;

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function appendToLedger(ledgerPath, records, { waitMs = LOCK_WAIT_MS } = {}) {
  const lockPath = `${ledgerPath}.lock`;
  const deadline = Date.now() + waitMs;
  let lock;
  for (;;) {
    try {
      lock = openSync(lockPath, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) {
        throw new Error(
          `could not lock ${ledgerPath}: ${error.code === 'EEXIST' ? 'another writer holds it' : error.message}`,
        );
      }
      sleep(LOCK_POLL_MS);
    }
  }
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const known = new Set((ledger.runs ?? []).map(record => record.runId));
    const duplicate = records.find(record => known.has(record.runId));
    if (duplicate) throw new Error(`run ${duplicate.runId} is already in ${ledgerPath}`);
    const next = `${ledgerPath}.${process.pid}.tmp`;
    writeFileSync(
      next,
      `${JSON.stringify({ ...ledger, runs: [...(ledger.runs ?? []), ...records] }, null, 2)}\n`,
    );
    renameSync(next, ledgerPath);
  } finally {
    closeSync(lock);
    rmSync(lockPath, { force: true });
  }
}
