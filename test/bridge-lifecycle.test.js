/** Real SDK client/server transports with controlled in-process HTTP. Not live qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay, setImmediate as nextTurn } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createBridge, readConfig } from '../src/bridge.js';
import { FAKE_TOOLS, startFakeRemote } from './helpers/fake-remote.js';

const REMOTE_URL = 'https://remote.test/mcp';
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
const within = async (promise, ms = 1000) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('observation deadline exceeded')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const messageOf = async (input, init) => {
  const request = new Request(input, init);
  return { request, body: request.method === 'POST' ? await request.clone().json() : null };
};

async function connectHost(t, options) {
  const bridge = createBridge({ remoteUrl: REMOTE_URL, timeoutMs: 2000, ...options });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'lifecycle-test-host', version: '1.0.0' });
  t.after(() => Promise.allSettled([host.close(), bridge.close()]));
  await bridge.start(bridgeSide);
  await host.connect(hostSide);
  return { bridge, host };
}
async function remoteFor(t, options) {
  const remote = await startFakeRemote(options);
  t.after(() => remote.close());
  return remote;
}

for (const timeoutMs of [2147483648, Number.MAX_SAFE_INTEGER, Infinity, 0, -1, 1.5]) {
  test(`rejects unusable timeout ${timeoutMs} at both configuration entry points`, () => {
    assert.throws(() => readConfig({ env: { BESTPRICE_MCP_TIMEOUT_MS: String(timeoutMs) } }), TypeError);
    assert.throws(() => createBridge({ remoteUrl: REMOTE_URL, timeoutMs }), TypeError);
  });
}

test('accepts both ends of the supported timer interval without starting work', () => {
  for (const timeoutMs of [1, 2147483647]) {
    assert.equal(readConfig({ env: { BESTPRICE_MCP_TIMEOUT_MS: String(timeoutMs) } }).timeoutMs, timeoutMs);
    assert.doesNotThrow(() => createBridge({ remoteUrl: REMOTE_URL, timeoutMs }));
  }
});

for (const [method, schema, result, invoke] of [
  [
    'tools/list',
    ListToolsRequestSchema,
    { tools: FAKE_TOOLS },
    (host, signal) => host.listTools({}, { signal }),
  ],
  [
    'tools/call',
    CallToolRequestSchema,
    { content: [] },
    (host, signal) => host.callTool({ name: 'echo' }, undefined, { signal }),
  ],
  [
    'prompts/list',
    ListPromptsRequestSchema,
    { prompts: [] },
    (host, signal) => host.listPrompts({}, { signal }),
  ],
]) {
  test(`propagates host cancellation to the upstream ${method} handler`, { timeout: 5000 }, async t => {
    const remote = await remoteFor(t, { withPrompts: true });
    const { host } = await connectHost(t, { fetch: remote.fetch });
    const entered = deferred();
    const aborted = deferred();
    const release = deferred();
    t.after(() => release.resolve());
    remote.server.setRequestHandler(schema, async (_request, extra) => {
      extra.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve();
      await release.promise;
      return result;
    });
    const controller = new AbortController();
    const outcome = capture(invoke(host, controller.signal));
    await within(entered.promise);
    controller.abort(new Error('shopper cancelled'));
    assert.ok((await within(outcome)).error, 'the host request must reject');
    await within(aborted.promise, 500);
  });
}

test('cancelling one request does not cancel a sibling or discard the shared session', async t => {
  const remote = await remoteFor(t);
  const { bridge, host } = await connectHost(t, { fetch: remote.fetch });
  const session = bridge.client().transport.sessionId;
  const entered = deferred();
  const aborted = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  remote.server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
    if (params.arguments?.text === 'slow') {
      extra.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve();
      await release.promise;
    }
    return { content: [{ type: 'text', text: params.arguments?.text ?? '' }] };
  });
  const controller = new AbortController();
  const cancelled = capture(
    host.callTool({ name: 'echo', arguments: { text: 'slow' } }, undefined, { signal: controller.signal }),
  );
  await within(entered.promise);
  controller.abort(new Error('stop only this request'));
  assert.ok((await within(cancelled)).error);
  const sibling = await host.callTool({ name: 'echo', arguments: { text: 'healthy' } });
  assert.equal(sibling.content[0].text, 'healthy');
  await within(aborted.promise, 500);
  assert.equal(bridge.client().transport.sessionId, session);
});

test('a cancelled waiter never dispatches after a shared lazy connection completes', async t => {
  const remote = await remoteFor(t);
  let reachable = false;
  const entered = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  const fetch = async (input, init) => {
    if (!reachable) throw new Error('offline fixture');
    const { body } = await messageOf(input, init);
    if (body?.method === 'initialize') {
      entered.resolve();
      await release.promise;
    }
    return remote.fetch(input, init);
  };
  const { host } = await connectHost(t, { fetch });
  reachable = true;
  const controller = new AbortController();
  const cancelled = capture(host.listTools({}, { signal: controller.signal }));
  await within(entered.promise);
  const sibling = capture(host.listTools());
  controller.abort(new Error('cancel while connecting'));
  assert.ok((await within(cancelled)).error);
  release.resolve();
  assert.deepEqual((await within(sibling)).value?.tools, FAKE_TOOLS);
  await nextTurn();
  const methods = await remote.methods();
  assert.equal(methods.filter(method => method === 'initialize').length, 1);
  assert.equal(methods.includes('notifications/cancelled'), false, 'initialize must not be cancelled');
  assert.equal(
    methods.filter(method => method === 'tools/list').length,
    1,
    'cancelled work must not be sent upstream',
  );
});

test('close during initialization prevents late client resurrection', async t => {
  const remote = await remoteFor(t);
  const entered = deferred();
  const release = deferred();
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    timeoutMs: 1000,
    fetch: async (input, init) => {
      const { body } = await messageOf(input, init);
      if (body?.method === 'initialize') {
        entered.resolve();
        await release.promise; // Deliberately ignores abort: late completion must still be harmless.
      }
      return remote.fetch(input, init);
    },
  });
  const pending = capture(bridge.connectRemote());
  t.after(async () => {
    release.resolve();
    await pending;
    await bridge.close();
  });
  await within(entered.promise);
  await within(bridge.close());
  release.resolve();
  assert.ok((await within(pending)).error, 'a closed bridge must reject a late connection');
  assert.equal(bridge.client(), undefined);
});

test('close is terminal: neither start nor connectRemote can reopen the bridge', async t => {
  const remote = await remoteFor(t);
  const bridge = createBridge({ remoteUrl: REMOTE_URL, fetch: remote.fetch });
  const [, bridgeSide] = InMemoryTransport.createLinkedPair();
  t.after(() => bridge.close());
  await bridge.close();
  await assert.rejects(bridge.connectRemote(), /closed/iu);
  await assert.rejects(bridge.start(bridgeSide), /closed/iu);
  assert.equal(remote.requests.length, 0, 'no network activity after close');
});

test('concurrent start calls reserve one local server before awaiting upstream initialization', async t => {
  const remote = await remoteFor(t);
  const entered = deferred();
  const release = deferred();
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    fetch: async (input, init) => {
      const { body } = await messageOf(input, init);
      if (body?.method === 'initialize') {
        entered.resolve();
        await release.promise;
      }
      return remote.fetch(input, init);
    },
  });
  const [, firstSide] = InMemoryTransport.createLinkedPair();
  const [, secondSide] = InMemoryTransport.createLinkedPair();
  const first = capture(bridge.start(firstSide));
  let second;
  t.after(async () => {
    release.resolve();
    await Promise.allSettled([first, second]);
    await Promise.allSettled([bridge.close(), firstSide.close(), secondSide.close()]);
  });
  await within(entered.promise);
  second = capture(bridge.start(secondSide));
  const result = await within(second, 100);
  assert.match(result.error?.message ?? '', /already started/iu);
  release.resolve();
  assert.ok((await first).value);
});

test('shutdown is bounded when DELETE never completes and still aborts the transport', async t => {
  const remote = await remoteFor(t);
  const release = deferred();
  let deleteSignal;
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    timeoutMs: 50,
    fetch: async (input, init) => {
      const { request } = await messageOf(input, init);
      if (request.method === 'DELETE') {
        deleteSignal = init?.signal;
        await release.promise; // Even a fetch implementation ignoring abort cannot hold close forever.
      }
      return remote.fetch(input, init);
    },
  });
  await bridge.connectRemote();
  const closing = bridge.close();
  t.after(async () => {
    release.resolve();
    await closing;
  });
  await within(closing, 500);
  assert.equal(bridge.client(), undefined);
  assert.equal(deleteSignal?.aborted, true);
});

test('concurrent expired-session requests recover once without retiring the replacement session', async t => {
  const first = await remoteFor(t);
  const second = await remoteFor(t);
  const held = deferred();
  const release = deferred();
  let staleSession;
  t.after(() => release.resolve());
  const fetch = async (input, init) => {
    const { request, body } = await messageOf(input, init);
    if (staleSession && request.headers.get('mcp-session-id') === staleSession) {
      if (body?.method === 'tools/call') {
        held.resolve();
        await release.promise;
      }
      return new Response('Session not found', { status: 404 });
    }
    return (staleSession ? second : first).fetch(input, init);
  };
  const { bridge, host } = await connectHost(t, { fetch });
  staleSession = bridge.client().transport.sessionId;
  const slow = capture(host.callTool({ name: 'echo', arguments: { text: 'survivor' } }));
  await within(held.promise);
  assert.deepEqual((await host.listTools()).tools, FAKE_TOOLS);
  const replacement = bridge.client().transport.sessionId;
  release.resolve();
  const result = await within(slow);
  assert.equal(result.error, undefined);
  assert.equal(result.value.content[0].text, 'survivor');
  assert.equal(bridge.client().transport.sessionId, replacement);
  assert.notEqual(replacement, staleSession);
  assert.equal((await second.methods()).filter(method => method === 'initialize').length, 1);
});

test('one request deadline includes expired-session recovery instead of resetting at each hop', async t => {
  const first = await remoteFor(t);
  const second = await remoteFor(t);
  let staleSession;
  const fetch = async (input, init) => {
    const { request, body } = await messageOf(input, init);
    if (staleSession && request.headers.get('mcp-session-id') === staleSession) {
      if (body?.method === 'tools/list') await delay(130);
      return new Response('Session not found', { status: 404 });
    }
    if (staleSession && body?.method === 'initialize') await delay(130);
    return (staleSession ? second : first).fetch(input, init);
  };
  const { bridge, host } = await connectHost(t, { fetch, timeoutMs: 200 });
  staleSession = bridge.client().transport.sessionId;
  await assert.rejects(host.listTools(), error => error.code === ErrorCode.RequestTimeout);
});

for (const failure of ['HTTP 503', 'ambiguous transport error']) {
  test(`does not replay tools/call after ${failure}`, async t => {
    const remote = await remoteFor(t);
    let calls = 0;
    const { host } = await connectHost(t, {
      fetch: async (input, init) => {
        const { body } = await messageOf(input, init);
        if (body?.method === 'tools/call') {
          calls += 1;
          if (failure === 'HTTP 503') return new Response('unavailable', { status: 503 });
          throw new Error('connection dropped; execution outcome unknown');
        }
        return remote.fetch(input, init);
      },
    });
    await assert.rejects(host.callTool({ name: 'echo' }));
    assert.equal(calls, 1);
    assert.equal((await remote.methods()).filter(method => method === 'initialize').length, 1);
  });
}

test('a sibling accepted by the old session finishes once while a new session is established', async t => {
  const first = await remoteFor(t);
  const second = await remoteFor(t);
  const entered = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  let oldSignal;
  let accepted = 0;
  first.server.setRequestHandler(CallToolRequestSchema, async (_request, extra) => {
    oldSignal = extra.signal;
    accepted += 1;
    entered.resolve();
    await release.promise;
    return { content: [{ type: 'text', text: 'original execution' }] };
  });
  let staleSession;
  const { bridge, host } = await connectHost(t, {
    fetch: async (input, init) => {
      const { request, body } = await messageOf(input, init);
      if (staleSession && request.headers.get('mcp-session-id') === staleSession) {
        if (body?.method === 'tools/list') return new Response('expired', { status: 404 });
        return first.fetch(input, init);
      }
      return (staleSession ? second : first).fetch(input, init);
    },
  });
  const slow = capture(host.callTool({ name: 'echo' }));
  await within(entered.promise);
  staleSession = bridge.client().transport.sessionId;
  assert.deepEqual((await host.listTools()).tools, FAKE_TOOLS);
  assert.equal(oldSignal.aborted, false, 'session recovery must not cancel an accepted sibling');
  release.resolve();
  const outcome = await within(slow);
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.value.content[0].text, 'original execution');
  assert.equal(accepted, 1);
  assert.equal((await second.methods()).includes('tools/call'), false, 'no replay on the new session');
});

test('repeated session rejection is bounded to one retry and leaves no known-invalid client', async t => {
  const first = await remoteFor(t);
  const second = await remoteFor(t);
  let initializations = 0;
  let calls = 0;
  const { bridge, host } = await connectHost(t, {
    fetch: async (input, init) => {
      const { body } = await messageOf(input, init);
      if (body?.method === 'initialize') initializations += 1;
      if (body?.method === 'tools/list') {
        calls += 1;
        return new Response('session expired', { status: 404 });
      }
      return (initializations > 1 ? second : first).fetch(input, init);
    },
  });
  await assert.rejects(host.listTools());
  assert.equal(calls, 2);
  assert.equal(initializations, 2);
  assert.equal(bridge.client(), undefined);
});

test('close is idempotent and terminates a live session only once', async t => {
  const remote = await remoteFor(t);
  const { bridge } = await connectHost(t, { fetch: remote.fetch });
  const first = bridge.close();
  const second = bridge.close();
  assert.equal(first, second);
  await first;
  assert.equal(remote.requests.filter(request => request.method === 'DELETE').length, 1);
});

test('the bridge deadline cancels the upstream handler without discarding a healthy session', async t => {
  const remote = await remoteFor(t);
  const { bridge, host } = await connectHost(t, { fetch: remote.fetch, timeoutMs: 100 });
  const session = bridge.client().transport.sessionId;
  const aborted = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  remote.server.setRequestHandler(CallToolRequestSchema, async (_request, extra) => {
    extra.signal.addEventListener('abort', () => aborted.resolve(), { once: true });
    await release.promise;
    return { content: [] };
  });
  await assert.rejects(host.callTool({ name: 'echo' }), error => error.code === ErrorCode.RequestTimeout);
  await within(aborted.promise, 500);
  assert.equal(bridge.client().transport.sessionId, session);
  assert.deepEqual((await host.listTools()).tools, FAKE_TOOLS);
});
