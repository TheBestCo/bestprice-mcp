/** Real installed SDK with controlled HTTP streams; no production traffic or qualification evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge.js';
import { startFakeRemote } from './helpers/fake-remote.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const capture = promise =>
  promise.then(
    value => ({ value }),
    error => ({ error }),
  );
const tick = async () => {
  await nextTurn();
  await nextTurn();
};

async function fixture(t, intercept, timeoutMs = 500) {
  const remote = await startFakeRemote({ withPrompts: true });
  const seen = [];
  const fetch = async (input, init) => {
    const request = new Request(input, init);
    const message = request.method === 'POST' ? await request.clone().json() : null;
    const observation = { request, message };
    seen.push(observation);
    const result = intercept?.(observation);
    return result === undefined ? remote.fetch(input, init) : result;
  };
  const bridge = createBridge({ remoteUrl: 'https://fixture.invalid/mcp', fetch, timeoutMs });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'wire-lifetime-control', version: '1.0.0' });
  t.after(() => Promise.allSettled([bridge.close(), host.close(), remote.close()]));
  await bridge.start(bridgeSide);
  await host.connect(hostSide);
  return { bridge, host, seen };
}

for (const [method, invoke] of [
  [
    'tools/call',
    (host, options) => host.callTool({ name: 'echo', arguments: { text: 'held' } }, undefined, options),
  ],
  ['tools/list', (host, options) => host.listTools({}, options)],
  ['prompts/list', (host, options) => host.listPrompts({}, options)],
]) {
  test(`${method}: cancellation aborts the physical POST, not merely the waiting SDK promise`, {
    timeout: 3000,
  }, async t => {
    const entered = deferred();
    let held;
    const f = await fixture(t, observation => {
      if (observation.message?.method !== method) return;
      held = observation.request;
      entered.resolve();
      return new Promise((_, reject) =>
        held.signal.addEventListener('abort', () => reject(held.signal.reason), { once: true }),
      );
    });
    const session = f.bridge.client().transport.sessionId;
    const caller = new AbortController();
    const outcome = capture(invoke(f.host, { signal: caller.signal }));
    await entered.promise;
    caller.abort(new Error('cancel just this operation'));
    assert.ok((await outcome).error);
    await tick();
    assert.equal(held.signal.aborted, true, 'the transport still owns an orphan POST after cancellation');
    assert.equal(f.bridge.client().transport.sessionId, session);
    const notification = f.seen.find(row => row.message?.method === 'notifications/cancelled');
    assert.ok(notification, 'cancellation notification still must reach the remote');
    assert.equal(
      notification.request.signal.aborted,
      false,
      'do not send cancellation on the cancelled request signal',
    );
  });
}

for (const type of ['application/json', 'text/event-stream']) {
  test(`${type}: deadline also aborts a response whose headers arrived but body is stalled`, {
    timeout: 3000,
  }, async t => {
    let held;
    const f = await fixture(
      t,
      ({ message, request }) => {
        if (message?.method !== 'tools/call') return;
        held = request;
        return new Response(
          new ReadableStream({
            start(controller) {
              request.signal.addEventListener('abort', () => controller.error(request.signal.reason), {
                once: true,
              });
            },
          }),
          { headers: { 'content-type': type } },
        );
      },
      100,
    );
    const outcome = await capture(f.host.callTool({ name: 'echo', arguments: {} }));
    assert.ok(outcome.error);
    await tick();
    assert.equal(held.signal.aborted, true, 'a stalled body survived the logical deadline');
  });
}

test('successful SSE completion releases its open POST stream without closing the shared session', {
  timeout: 3000,
}, async t => {
  let held;
  const f = await fixture(t, ({ message, request }) => {
    if (message?.method !== 'tools/call' || message.params.arguments.text !== 'held') return;
    held = request;
    return new Response(
      new ReadableStream({
        start(controller) {
          request.signal.addEventListener('abort', () => controller.error(request.signal.reason), {
            once: true,
          });
          controller.enqueue(
            Buffer.from(
              `data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'completed' }] } })}\n\n`,
            ),
          );
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const session = f.bridge.client().transport.sessionId;
  const result = await f.host.callTool({ name: 'echo', arguments: { text: 'held' } });
  assert.equal(result.content[0].text, 'completed');
  await tick();
  assert.equal(held.signal.aborted, true, 'completed result left its SSE POST open');
  const next = await f.host.callTool({ name: 'echo', arguments: { text: 'healthy' } });
  assert.equal(next.structuredContent.text, 'healthy');
  assert.equal(f.bridge.client().transport.sessionId, session);
});

test('cancellation does not abort an unrelated in-flight POST', { timeout: 3000 }, async t => {
  const opened = deferred();
  const requests = [];
  const releases = [];
  const f = await fixture(t, ({ message, request }) => {
    if (message?.method !== 'tools/call') return;
    requests.push(request);
    if (requests.length === 2) opened.resolve();
    return new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      releases.push(() =>
        resolve(Response.json({ jsonrpc: '2.0', id: message.id, result: { content: [] } })),
      );
    });
  });
  const caller = new AbortController();
  const first = capture(
    f.host.callTool({ name: 'echo', arguments: { text: 'cancel' } }, undefined, { signal: caller.signal }),
  );
  const sibling = capture(f.host.callTool({ name: 'echo', arguments: { text: 'keep' } }));
  await opened.promise;
  caller.abort();
  assert.ok((await first).error);
  await tick();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal.aborted, false, 'shared-session cancellation leaked to a sibling');
  releases[1]();
  assert.ok((await sibling).value);
});

test('a late non-cooperative response is cancelled without consuming or retaining its body', {
  timeout: 3000,
}, async t => {
  const entered = deferred();
  const release = deferred();
  let disposals = 0;
  const f = await fixture(t, ({ message }) => {
    if (message?.method !== 'tools/call') return;
    entered.resolve();
    return release.promise;
  });
  const caller = new AbortController();
  const result = capture(
    f.host.callTool({ name: 'echo', arguments: {} }, undefined, { signal: caller.signal }),
  );
  await entered.promise;
  caller.abort();
  assert.ok((await result).error);
  release.resolve(
    new Response(
      new ReadableStream({
        cancel() {
          disposals++;
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
  await tick();
  assert.equal(disposals, 1);
});

test('twenty abandoned calls leave no live request signals and do not replay', { timeout: 5000 }, async t => {
  const held = [];
  let entered;
  const f = await fixture(t, ({ message, request }) => {
    if (message?.method !== 'tools/call' || message.params.arguments.text !== 'hold') return;
    held.push(request);
    entered.resolve();
    return new Promise((_, reject) =>
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }),
    );
  });
  const session = f.bridge.client().transport.sessionId;
  for (let index = 0; index < 20; index++) {
    entered = deferred();
    const caller = new AbortController();
    const result = capture(
      f.host.callTool({ name: 'echo', arguments: { text: 'hold' } }, undefined, { signal: caller.signal }),
    );
    await entered.promise;
    caller.abort();
    assert.ok((await result).error);
    await tick();
    assert.ok(held.every(request => request.signal.aborted));
  }
  assert.equal(held.length, 20);
  assert.equal(
    (await f.host.callTool({ name: 'echo', arguments: { text: 'still healthy' } })).structuredContent.text,
    'still healthy',
  );
  assert.equal(f.bridge.client().transport.sessionId, session);
});

test('a stalled cancellation notification has its own finite transport budget', {
  timeout: 3000,
}, async t => {
  const entered = deferred();
  let notification;
  const f = await fixture(
    t,
    ({ message, request }) => {
      if (message?.method === 'tools/call') {
        entered.resolve();
        return new Promise((_, reject) =>
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }),
        );
      }
      if (message?.method === 'notifications/cancelled') {
        notification = request;
        return new Promise((_, reject) =>
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }),
        );
      }
    },
    100,
  );
  const caller = new AbortController();
  const result = capture(
    f.host.callTool({ name: 'echo', arguments: {} }, undefined, { signal: caller.signal }),
  );
  await entered.promise;
  caller.abort();
  assert.ok((await result).error);
  await tick();
  assert.ok(notification);
  assert.equal(notification.signal.aborted, false);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(notification.signal.aborted, true, 'cancellation leaked a different unbounded POST');
});
