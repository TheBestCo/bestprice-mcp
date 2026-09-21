import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { finalizeNativeReadVerdict, recordNativeGuardFailure } from '../scripts/native-read-verdict.js';

const observation = Object.freeze({
  phase: 'product:read',
  denied: false,
  document: false,
  resourceType: 'Fetch',
  control: false,
});

for (const [message, category] of [
  ['Invalid InterceptionId private-url-token', 'request_no_longer_intercepted'],
  ['Session closed private-url-token', 'target_or_session_closed'],
  ['unexpected private-url-token', 'other_protocol_error'],
]) {
  test(`interception diagnostics retain a category, not raw error data: ${category}`, () => {
    const report = {};
    recordNativeGuardFailure(report, observation, new Error(message));
    assert.equal(report.blocked.navigation_guard_error, 1);
    assert.equal(report.guardErrors[0].category, category);
    assert.equal(JSON.stringify(report).includes('private-url-token'), false);
  });
}

test('diagnostic rows are bounded without losing the total failure count', () => {
  const report = {};
  for (let i = 0; i < 20; i++) recordNativeGuardFailure(report, observation, null);
  assert.equal(report.guardErrors.length, 8);
  assert.equal(report.blocked.navigation_guard_error, 20);
  assert.equal(finalizeNativeReadVerdict(report), 1);
  assert.equal(report.passed, false);
});

test('a throwing error accessor cannot strand failure recording or expose payloads', () => {
  const report = {};
  recordNativeGuardFailure(
    report,
    { phase: 'https://private.invalid', resourceType: 'private data' },
    {
      get message() {
        throw new Error('private error');
      },
    },
  );
  assert.equal(report.guardErrors[0].category, 'other_protocol_error');
  assert.equal(report.guardErrors[0].phase, 'unknown');
  assert.equal(report.guardErrors[0].resourceType, 'other');
});

test('finalization preserves an earlier failure rather than replacing its cause', () => {
  const failure = { phase: 'product:read', category: 'identity_mismatch' };
  const report = { passed: false, failure, blocked: { navigation_guard_error: 1 } };
  assert.equal(finalizeNativeReadVerdict(report), 1);
  assert.equal(report.failure, failure);
});

test('a completed clean verdict remains green and an unset verdict cannot become green', () => {
  const report = { passed: true, blocked: { navigation_guard_error: 0 } };
  assert.equal(finalizeNativeReadVerdict(report), 0);
  assert.equal(report.passed, true);
  assert.equal(finalizeNativeReadVerdict({}), 1);
});

// Execute the actual script's final cleanup block, not a duplicate implementation.
// Dependencies simulate late browser events; no live network, browser or filesystem writes.
async function cleanupReceipt(report, inject) {
  const source = await readFile(new URL('../scripts/native-read-smoke.mjs', import.meta.url), 'utf8');
  const marker = '} finally {\n  await context?.close()';
  assert.equal(source.split(marker).length, 2);
  const body = source.slice(source.indexOf(marker) + '} finally {'.length, source.lastIndexOf('}'));
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction(
    'context',
    'browser',
    'report',
    'process',
    'mkdir',
    'writeFile',
    'console',
    'finalizeNativeReadVerdict',
    body,
  );
  const processState = { exitCode: report.passed ? 0 : 1 };
  let written;
  await run(
    { close: async () => inject(report) },
    { close: async () => {} },
    report,
    processState,
    async () => {},
    async (_path, data) => {
      written = JSON.parse(data);
    },
    { log() {} },
    finalizeNativeReadVerdict,
  );
  return { written, processState };
}

for (const cause of ['navigation_guard_error', 'budget']) {
  test(`actual browser cleanup cannot publish green after late ${cause}`, async () => {
    const { written, processState } = await cleanupReceipt({ passed: true, blocked: {} }, report => {
      report.blocked[cause] = 1;
    });
    assert.equal(written.passed, false);
    assert.equal(processState.exitCode, 1);
    assert.equal(
      written.failure.category,
      cause === 'budget' ? 'browser_budget_exhausted' : 'navigation_guard_failed',
    );
  });
}

test('actual clean browser cleanup preserves a successful receipt', async () => {
  const { written, processState } = await cleanupReceipt({ passed: true, blocked: {} }, () => {});
  assert.equal(written.passed, true);
  assert.equal(processState.exitCode, 0);
});
