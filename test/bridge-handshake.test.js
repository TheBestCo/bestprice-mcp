/** Actual SDK handshakes with controlled HTTP; not native shopper qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BRIDGE_INFO, createBridge } from '../src/bridge.js';
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
async function within(promise, ms = 1000) {
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
}
async function messageOf(input, init) {
  const request = new Request(input, init);
  return request.method === 'POST' ? request.clone().json() : null;
}
async function setup(t, { fetch, timeoutMs = 500, withPrompts = false } = {}) {
  const remote = await startFakeRemote({ withPrompts });
  const bridge = createBridge({ remoteUrl: REMOTE_URL, timeoutMs, fetch: fetch ?? remote.fetch });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'handshake-test', version: '1.0.0' });
  t.after(() => Promise.allSettled([host.close(), bridge.close(), remote.close()]));
  await bridge.start(bridgeSide);
  await host.connect(hostSide);
  return { remote, bridge, host };
}

for (const phase of ['initialize', 'notifications/initialized']) {
  test(`connection deadline bounds a stalled ${phase} and aborts its transport`, async t => {
    const remote = await startFakeRemote();
    const entered = deferred();
    const release = deferred();
    let stalledSignal;
    const bridge = createBridge({
      remoteUrl: REMOTE_URL,
      timeoutMs: 80,
      fetch: async (input, init) => {
        if ((await messageOf(input, init))?.method === phase) {
          stalledSignal = init.signal;
          entered.resolve();
          await release.promise; // Deliberately ignore abort: the caller must still settle.
        }
        return remote.fetch(input, init);
      },
    });
    const pending = capture(bridge.connectRemote());
    t.after(async () => {
      release.resolve();
      await Promise.allSettled([pending, bridge.close(), remote.close()]);
    });
    await within(entered.promise);
    const result = await within(pending, 500);
    assert.equal(result.error?.code, ErrorCode.RequestTimeout);
    assert.equal(bridge.client(), undefined);
    assert.equal(stalledSignal.aborted, true);
    assert.equal(
      (await remote.methods()).includes('notifications/cancelled'),
      false,
      'initialize must be closed, never cancelled by protocol notification',
    );
  });
}

test('close interrupts a stalled initialized notification rather than waiting for its response', async t => {
  const remote = await startFakeRemote();
  const entered = deferred();
  const release = deferred();
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    timeoutMs: 2000,
    fetch: async (input, init) => {
      if ((await messageOf(input, init))?.method === 'notifications/initialized') {
        entered.resolve();
        await release.promise;
      }
      return remote.fetch(input, init);
    },
  });
  const pending = capture(bridge.connectRemote());
  t.after(async () => {
    release.resolve();
    await Promise.allSettled([pending, bridge.close(), remote.close()]);
  });
  await within(entered.promise);
  await within(bridge.close());
  assert.equal((await within(pending, 300)).error?.code, ErrorCode.ConnectionClosed);
  assert.equal(bridge.client(), undefined);
});

test('failed handshake falls back at startup, recovers lazily, and ignores its late completion', async t => {
  const first = await startFakeRemote();
  const second = await startFakeRemote();
  const release = deferred();
  let current = first;
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    timeoutMs: 100,
    fetch: async (input, init) => {
      const owned = current;
      if (owned === first && (await messageOf(input, init))?.method === 'notifications/initialized') {
        await release.promise;
      }
      return owned.fetch(input, init);
    },
  });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'recovery-host', version: '1.0.0' });
  const startup = capture(bridge.start(bridgeSide));
  t.after(async () => {
    release.resolve();
    await startup;
    await Promise.allSettled([host.close(), bridge.close(), first.close(), second.close()]);
  });
  assert.ok((await within(startup, 500)).value);
  await host.connect(hostSide);
  assert.deepEqual(host.getServerVersion(), BRIDGE_INFO);
  current = second;
  assert.deepEqual((await host.listTools()).tools, FAKE_TOOLS);
  const healthy = bridge.client();
  release.resolve();
  await delay(20);
  assert.equal(bridge.client(), healthy);
  assert.deepEqual((await host.listTools()).tools, FAKE_TOOLS);
});

test('the connection deadline is shared across both handshake phases', async t => {
  const remote = await startFakeRemote();
  const bridge = createBridge({
    remoteUrl: REMOTE_URL,
    timeoutMs: 200,
    fetch: async (input, init) => {
      const message = await messageOf(input, init);
      if (['initialize', 'notifications/initialized'].includes(message?.method)) await delay(130);
      return remote.fetch(input, init);
    },
  });
  t.after(() => Promise.allSettled([bridge.close(), remote.close()]));
  await assert.rejects(bridge.connectRemote(), error => error.code === ErrorCode.RequestTimeout);
});

for (const [method, schema, result] of [
  ['tools/list', ListToolsRequestSchema, { tools: FAKE_TOOLS }],
  ['tools/call', CallToolRequestSchema, { content: [] }],
  ['prompts/list', ListPromptsRequestSchema, { prompts: [] }],
]) {
  test(`relays ${method} progress to its host token, including numeric zero`, async t => {
    const { remote, host } = await setup(t, { withPrompts: true });
    const received = [];
    host.setNotificationHandler(ProgressNotificationSchema, notification => {
      received.push(notification.params);
    });
    remote.server.setRequestHandler(schema, async (request, extra) => {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken: request.params._meta.progressToken,
          progress: 1,
          total: 2,
          message: 'reading',
        },
      });
      return result;
    });
    for (const token of [0, 'host-progress-token']) {
      received.length = 0;
      await host.request(
        {
          method,
          params: { ...(method === 'tools/call' ? { name: 'echo' } : {}), _meta: { progressToken: token } },
        },
        // Any result is enough here: the established bridge tests validate method result fidelity.
        (await import('@modelcontextprotocol/sdk/types.js')).ResultSchema,
      );
      assert.deepEqual(received, [{ progressToken: token, progress: 1, total: 2, message: 'reading' }]);
    }
  });
}

test('concurrent progress stays with its own request rather than sharing a global handler', async t => {
  const { remote, host } = await setup(t);
  remote.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    await delay(request.params.arguments.delay);
    await extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken: request.params._meta.progressToken,
        progress: 1,
        message: request.params.arguments.label,
      },
    });
    return { content: [] };
  });
  const first = [];
  const second = [];
  await Promise.all([
    host.callTool({ name: 'echo', arguments: { label: 'first', delay: 20 } }, undefined, {
      onprogress: progress => first.push(progress.message),
    }),
    host.callTool({ name: 'echo', arguments: { label: 'second', delay: 0 } }, undefined, {
      onprogress: progress => second.push(progress.message),
    }),
  ]);
  assert.deepEqual(first, ['first']);
  assert.deepEqual(second, ['second']);
});

test('a request without a progress token does not solicit progress upstream', async t => {
  const { remote, host } = await setup(t);
  remote.server.setRequestHandler(CallToolRequestSchema, async request => {
    assert.equal(request.params?._meta?.progressToken, undefined);
    return { content: [] };
  });
  await host.callTool({ name: 'echo' });
});
