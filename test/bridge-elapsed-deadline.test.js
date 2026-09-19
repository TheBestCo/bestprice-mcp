/** Real SDK over controlled HTTP; elapsed-clock cases are deterministic, not live latency claims. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createBridge } from '../src/bridge.js';
import { startFakeRemote } from './helpers/fake-remote.js';

async function setup(t, intercept) {
  const remote = await startFakeRemote({ withPrompts: true });
  const bridge = createBridge({
    remoteUrl: 'https://remote.test/mcp',
    timeoutMs: 1000,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = request.method === 'POST' ? await request.clone().json() : null;
      const response = await intercept?.(body, request);
      return response ?? remote.fetch(input, init);
    },
  });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'deadline-test-host', version: '1.0.0' });
  t.after(() => Promise.allSettled([host.close(), bridge.close(), remote.close()]));
  return {
    bridge,
    host,
    remote,
    async start() {
      await bridge.start(bridgeSide);
      await host.connect(hostSide);
    },
  };
}

const methods = [
  ['tools/list', host => host.listTools()],
  ['tools/call', host => host.callTool({ name: 'echo', arguments: { text: 'hello' } })],
  ['prompts/list', host => host.listPrompts()],
];
for (const [method, invoke] of methods) {
  for (const elapsed of [1000, 1001]) {
    test(`${method} cannot succeed at elapsed=${elapsed} before the timer queue runs`, async t => {
      let clock = 0;
      t.mock.method(performance, 'now', () => clock);
      const fixture = await setup(t, body => {
        if (body?.method === method) clock += elapsed;
      });
      await fixture.start();
      const session = fixture.bridge.client().transport.sessionId;
      await assert.rejects(invoke(fixture.host), error => error.code === ErrorCode.RequestTimeout);
      assert.equal(
        fixture.bridge.client().transport.sessionId,
        session,
        'deadline must not discard a healthy session',
      );
    });
  }
}

for (const method of ['initialize', 'notifications/initialized']) {
  test(`the whole handshake refuses late ${method} completion`, async t => {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const fixture = await setup(t, body => {
      if (body?.method === method) clock += 1000;
    });
    await assert.rejects(fixture.bridge.connectRemote(), error => error.code === ErrorCode.RequestTimeout);
    assert.equal(fixture.bridge.client(), undefined, 'a late handshake must not publish a client');
  });
}

for (const status of [404, 503]) {
  test(`HTTP ${status} after the elapsed deadline cannot trigger recovery or mask timeout`, async t => {
    let clock = 0;
    let initializations = 0;
    t.mock.method(performance, 'now', () => clock);
    const fixture = await setup(t, body => {
      if (body?.method === 'initialize') initializations += 1;
      if (body?.method === 'tools/list') {
        clock += 1000;
        return new Response('rejected', { status });
      }
    });
    await fixture.start();
    await assert.rejects(fixture.host.listTools(), error => error.code === ErrorCode.RequestTimeout);
    assert.equal(initializations, 1, 'no new initialization once the original deadline has expired');
  });
}

for (const [method, invoke] of methods) {
  test(`${method} still succeeds before its elapsed deadline`, async t => {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const fixture = await setup(t, body => {
      if (body?.method === method) clock += 999;
    });
    await fixture.start();
    assert.ok(await invoke(fixture.host));
  });
}

test('request deadline includes shared lazy initialization elapsed time', async t => {
  let clock = 0;
  let reachable = false;
  let calls = 0;
  t.mock.method(performance, 'now', () => clock);
  const fixture = await setup(t, body => {
    if (!reachable) throw new Error('offline control');
    if (body?.method === 'initialize') clock += 600;
    if (body?.method === 'tools/list') {
      clock += 500;
      calls += 1;
    }
  });
  await fixture.start();
  reachable = true;
  await assert.rejects(fixture.host.listTools(), error => error.code === ErrorCode.RequestTimeout);
  assert.equal(calls, 1);
});

for (const status of [400, 503]) {
  test(`late handshake HTTP ${status} cannot mask the elapsed initialization deadline`, async t => {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const fixture = await setup(t, body => {
      if (body?.method === 'initialize') {
        clock += 1000;
        return new Response('rejected', { status });
      }
    });
    await assert.rejects(fixture.bridge.connectRemote(), error => error.code === ErrorCode.RequestTimeout);
    assert.equal(fixture.bridge.client(), undefined);
  });
}

test('a recovery handshake failure cannot mask the original request deadline', async t => {
  let clock = 0;
  let initializations = 0;
  t.mock.method(performance, 'now', () => clock);
  const fixture = await setup(t, body => {
    if (body?.method === 'initialize' && ++initializations > 1) {
      clock += 500;
      return new Response('temporarily unavailable', { status: 503 });
    }
    if (body?.method === 'tools/list') {
      clock += 600;
      return new Response('session expired', { status: 404 });
    }
  });
  await fixture.start();
  await assert.rejects(fixture.host.listTools(), error => error.code === ErrorCode.RequestTimeout);
  assert.equal(initializations, 2);
});

test('explicit close retains cancellation precedence even when the clock also expires', async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const fixture = await setup(t, body => {
    if (body?.method === 'initialize') {
      clock += 1000;
      fixture.bridge.close();
    }
  });
  await assert.rejects(fixture.bridge.connectRemote(), error => error.code === ErrorCode.ConnectionClosed);
  assert.equal(fixture.bridge.client(), undefined);
});
