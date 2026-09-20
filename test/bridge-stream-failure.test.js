/** Real MCP SDK, controlled streams. No production requests or qualification artifacts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createBridge } from '../src/bridge.js';
import { MAX_RESPONSE_BYTES } from '../src/utf8-response.js';
import { startFakeRemote } from './helpers/fake-remote.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};

async function setup(t, mime, { cancelNeverSettles = false } = {}) {
  const remote = await startFakeRemote();
  const entered = deferred();
  const siblingEntered = deferred();
  const siblingRelease = deferred();
  const cancelled = deferred();
  const observed = [];
  let producer;
  const bridge = createBridge({
    remoteUrl: 'https://remote.test/mcp',
    timeoutMs: 1000,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const message = request.method === 'POST' ? await request.clone().json() : null;
      if (message?.method === 'tools/call') {
        observed.push({ text: message.params.arguments.text, signal: init.signal });
        if (message.params.arguments.text === 'broken') {
          const stream = new ReadableStream({
            start(controller) {
              producer = controller;
            },
            cancel(reason) {
              cancelled.resolve(reason);
              if (cancelNeverSettles) return new Promise(() => {});
            },
          });
          entered.resolve();
          return new Response(stream, { headers: { 'content-type': mime } });
        }
        if (message.params.arguments.text === 'sibling') {
          siblingEntered.resolve();
          await siblingRelease.promise;
        }
      }
      return remote.fetch(input, init);
    },
  });
  const host = new Client({ name: 'stream-failure-host', version: '1.0.0' });
  const [hostTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    siblingRelease.resolve();
    await Promise.allSettled([host.close(), bridge.close(), remote.close()]);
  });
  await bridge.start(bridgeTransport);
  await host.connect(hostTransport);
  return {
    bridge,
    host,
    entered,
    siblingEntered,
    siblingRelease,
    cancelled,
    observed,
    producer: () => producer,
  };
}
const outcome = promise =>
  promise.then(
    value => ({ value }),
    error => ({ error }),
  );

for (const mime of ['application/json', 'text/event-stream']) {
  for (const mode of ['utf8', 'size', 'upstream']) {
    test(`${mime}: ${mode} failure is immediate request failure, not a timeout or a session reset`, {
      timeout: 5000,
    }, async t => {
      const f = await setup(t, mime);
      const session = f.bridge.client().transport.sessionId;
      const failed = outcome(f.host.callTool({ name: 'echo', arguments: { text: 'broken' } }));
      await f.entered.promise;
      const sibling = outcome(f.host.callTool({ name: 'echo', arguments: { text: 'sibling' } }));
      await f.siblingEntered.promise;
      const start = performance.now();
      if (mode === 'utf8') f.producer().enqueue(Uint8Array.of(0xff));
      else if (mode === 'size') f.producer().enqueue(Buffer.alloc(MAX_RESPONSE_BYTES + 1, 120));
      else f.producer().error(new Error('synthetic upstream stream failed'));
      const result = await failed;
      t.diagnostic(`failure-to-settlement=${Math.round(performance.now() - start)}ms`);
      // A timeout with the same final rejection shape is not acceptable evidence of fast failure.
      assert.equal(result.error?.code, ErrorCode.InternalError, result.error?.message);
      assert.doesNotMatch(result.error.message, /timed out|timeout/iu);
      assert.equal(f.observed.find(call => call.text === 'sibling').signal.aborted, false);
      f.siblingRelease.resolve();
      assert.equal((await sibling).value?.structuredContent.text, 'sibling');
      assert.equal(f.bridge.client().transport.sessionId, session);
      assert.equal(f.observed.filter(call => call.text === 'broken').length, 1, 'never replay corruption');
      const next = await f.host.callTool({ name: 'echo', arguments: { text: 'healthy' } });
      assert.equal(next.structuredContent.text, 'healthy');
    });
  }
}

test('SSE invalid-byte failure does not wait for a non-cooperative producer cancellation promise', {
  timeout: 4000,
}, async t => {
  const f = await setup(t, 'text/event-stream', { cancelNeverSettles: true });
  const failed = outcome(f.host.callTool({ name: 'echo', arguments: { text: 'broken' } }));
  await f.entered.promise;
  f.producer().enqueue(Uint8Array.of(0x80));
  const result = await failed;
  assert.equal(result.error?.code, ErrorCode.InternalError, result.error?.message);
  assert.ok((await f.cancelled.promise) instanceof Error);
});
