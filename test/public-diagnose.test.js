/** Synthetic failure objects. No credentials, network calls or qualification claims. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkFailureCategory, runDiagnosedSmoke } from '../scripts/public-diagnose.mjs';

for (const [code, category] of [
  ['ENOTFOUND', 'DNS_NOT_FOUND'],
  ['EAI_AGAIN', 'DNS_TEMPORARILY_UNAVAILABLE'],
  ['ECONNRESET', 'CONNECTION_RESET'],
  ['ECONNREFUSED', 'CONNECTION_REFUSED'],
  ['ETIMEDOUT', 'NETWORK_TIMEOUT'],
  ['EPIPE', 'BROKEN_PIPE'],
  ['UND_ERR_SOCKET', 'REMOTE_SOCKET_CLOSED'],
  ['UND_ERR_CONNECT_TIMEOUT', 'CONNECT_TIMEOUT'],
  ['UND_ERR_HEADERS_TIMEOUT', 'HEADERS_TIMEOUT'],
  ['UND_ERR_BODY_TIMEOUT', 'BODY_TIMEOUT'],
  ['UND_ERR_ABORTED', 'REQUEST_ABORTED'],
  ['ABORT_ERR', 'REQUEST_ABORTED'],
  ['CERT_HAS_EXPIRED', 'TLS_CERTIFICATE_EXPIRED'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_VERIFICATION_FAILED'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS_VERIFICATION_FAILED'],
]) {
  test(`${code} is categorized without its sensitive message or address`, () => {
    const error = Object.assign(new Error('synthetic-private-url-and-secret'), {
      code,
      address: 'sensitive',
    });
    assert.equal(networkFailureCategory(new TypeError('fetch failed', { cause: error })), category);
  });
}
test('arbitrary messages and codes are never echoed', () => {
  for (const input of [
    null,
    undefined,
    'ECONNRESET with secret',
    { code: 'SECRET', message: 'ENOTFOUND secret' },
  ]) {
    assert.equal(networkFailureCategory(input), 'UNCLASSIFIED_FETCH_FAILURE');
  }
});
test('native cancellation and timeout error names receive bounded categories', () => {
  assert.equal(networkFailureCategory(new DOMException('sensitive', 'AbortError')), 'REQUEST_ABORTED');
  assert.equal(networkFailureCategory(new DOMException('sensitive', 'TimeoutError')), 'NETWORK_TIMEOUT');
});
test('cycles, excessive nesting and throwing accessors are bounded', () => {
  const cycle = {};
  cycle.cause = cycle;
  assert.equal(networkFailureCategory(cycle), 'UNCLASSIFIED_FETCH_FAILURE');
  const deep = Array.from({ length: 20 }).reduce(cause => ({ cause }), { code: 'ECONNRESET' });
  assert.equal(networkFailureCategory(deep), 'UNCLASSIFIED_FETCH_FAILURE');
  assert.equal(
    networkFailureCategory({
      get code() {
        throw new Error('secret');
      },
    }),
    'UNCLASSIFIED_FETCH_FAILURE',
  );
});
test('wrapper preserves request arguments and response identity without adding a retry', async () => {
  const args = ['https://fixed.invalid/mcp', { method: 'POST' }];
  const response = new Response('{}');
  let calls = 0;
  const report = await runDiagnosedSmoke({
    expectedRevision: 'a'.repeat(40),
    fetchImpl: async (...actual) => {
      calls++;
      assert.deepEqual(actual, args);
      return response;
    },
    run: async ({ fetchImpl, expectedRevision }) => {
      assert.equal(expectedRevision, 'a'.repeat(40));
      assert.equal(await fetchImpl(...args), response);
      return { passed: true };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(report, { passed: true, transportFailureCount: 0, transportFailures: [] });
});
test('wrapper rethrows original errors and cannot change the failed canary verdict', async () => {
  const failure = new TypeError('private', { cause: { code: 'UND_ERR_SOCKET', secret: 'hidden' } });
  let calls = 0;
  const report = await runDiagnosedSmoke({
    fetchImpl: async () => {
      calls++;
      throw failure;
    },
    run: async ({ fetchImpl }) => {
      await assert.rejects(fetchImpl('synthetic'), error => error === failure);
      return { passed: false, failure: 'TRANSPORT_OR_PROTOCOL_FAILURE' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.passed, false);
  assert.deepEqual(report.transportFailures, ['REMOTE_SOCKET_CLOSED']);
  assert.ok(!JSON.stringify(report).includes('private') && !JSON.stringify(report).includes('hidden'));
});
test('diagnostic storage is bounded but failure count remains complete', async () => {
  const report = await runDiagnosedSmoke({
    fetchImpl: async () => {
      throw { code: 'ECONNRESET' };
    },
    run: async ({ fetchImpl }) => {
      for (let index = 0; index < 100; index++) {
        try {
          await fetchImpl();
        } catch {}
      }
      return { passed: false };
    },
  });
  assert.equal(report.transportFailureCount, 100);
  assert.equal(report.transportFailures.length, 16);
});
