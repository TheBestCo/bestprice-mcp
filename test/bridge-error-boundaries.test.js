/** Real SDK integration with controlled HTTP; no production traffic or qualification evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge.js';
import { startFakeRemote } from './helpers/fake-remote.js';

const URL = 'https://remote.test/mcp';
const rpcError = (code, message, data) =>
  JSON.stringify({
    jsonrpc: '2.0',
    id: null,
    error: { code, message, ...(data ? { data } : {}) },
  });
const readMessage = async (input, init) => {
  const request = new Request(input, init);
  return { request, body: request.method === 'POST' ? await request.clone().json() : null };
};
async function remoteFor(t, options) {
  const remote = await startFakeRemote(options);
  t.after(() => remote.close());
  return remote;
}
async function hostFor(t, options) {
  const bridge = createBridge({ remoteUrl: URL, ...options });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'error-boundaries', version: '1.0.0' });
  t.after(() => Promise.allSettled([host.close(), bridge.close()]));
  await bridge.start(bridgeSide);
  await host.connect(hostSide);
  return { bridge, host };
}

for (const [name, body] of [
  ['invalid parameter mentioning session', rpcError(-32602, 'session_length must be <= 10')],
  ['application error mentioning session', rpcError(-32000, 'session_length is not supported')],
  ['plain-text validation error', 'Invalid session_length supplied'],
  ['embedded phrase in error data', rpcError(-32700, 'Parse error', 'Bad Request: Server not initialized')],
  ['canonical phrase with wrong RPC code', rpcError(-32602, 'Bad Request: Server not initialized')],
  ['inexact initialization phrase', rpcError(-32000, 'Dependency not initialized: catalog session store')],
]) {
  test(`does not replay a tool call after ${name}`, async t => {
    const first = await remoteFor(t);
    const second = await remoteFor(t);
    let calls = 0;
    let initializations = 0;
    const { bridge, host } = await hostFor(t, {
      fetch: async (input, init) => {
        const { body: message } = await readMessage(input, init);
        if (message?.method === 'initialize') initializations += 1;
        if (message?.method === 'tools/call') {
          calls += 1;
          return new Response(body, { status: 400 });
        }
        return (initializations > 1 ? second : first).fetch(input, init);
      },
    });
    const original = bridge.client();
    await assert.rejects(host.callTool({ name: 'echo', arguments: { text: 'once' } }));
    assert.equal(calls, 1, 'an application error does not authorize a replay');
    assert.equal(initializations, 1, 'a healthy session must not be discarded');
    assert.equal(bridge.client(), original);
  });
}

for (const status of [400, 404]) {
  test(`does not invent session recovery for sessionless HTTP ${status}`, async t => {
    let calls = 0;
    let initializations = 0;
    // Reusing a stateless SDK server transport across requests is invalid. This wire fixture
    // instead completes a real SDK client handshake without ever issuing a session header.
    const { bridge, host } = await hostFor(t, {
      fetch: async (input, init) => {
        const { request, body } = await readMessage(input, init);
        assert.equal(request.headers.has('mcp-session-id'), false);
        if (request.method === 'GET') return new Response(null, { status: 405 });
        if (body?.method === 'initialize') {
          initializations += 1;
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                protocolVersion: body.params.protocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: 'stateless-fixture', version: '1.0.0' },
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        if (body?.method === 'tools/call') {
          calls += 1;
          return new Response(rpcError(-32000, 'Bad Request: Server not initialized'), { status });
        }
        return new Response(null, { status: 202 });
      },
    });
    assert.ok(bridge.client(), 'the stateless handshake must have actually succeeded');
    assert.equal(bridge.client().transport.sessionId, undefined);
    await assert.rejects(host.callTool({ name: 'echo', arguments: { text: 'once' } }));
    assert.equal(calls, 1);
    assert.equal(initializations, 1);
  });
}

for (const status of [400, 404]) {
  test(`retains one recovery for a real stale session returning HTTP ${status}`, async t => {
    const first = await remoteFor(t);
    const second = await remoteFor(t);
    let calls = 0;
    let initializations = 0;
    const { host } = await hostFor(t, {
      fetch: async (input, init) => {
        const { body } = await readMessage(input, init);
        if (body?.method === 'initialize') initializations += 1;
        if (body?.method === 'tools/call' && ++calls === 1) {
          return new Response(rpcError(-32000, 'Bad Request: Server not initialized'), { status });
        }
        return (initializations > 1 ? second : first).fetch(input, init);
      },
    });
    const result = await host.callTool({ name: 'echo', arguments: { text: 'recovered' } });
    assert.equal(result.content[0].text, 'recovered');
    assert.equal(calls, 2);
    assert.equal(initializations, 2);
  });
}

test('a throwing diagnostic sink cannot prevent fallback startup and later recovery', async t => {
  const remote = await remoteFor(t);
  let reachable = false;
  const { host } = await hostFor(t, {
    fetch: (input, init) => (reachable ? remote.fetch(input, init) : Promise.reject(new Error('offline'))),
    log: () => {
      throw new Error('diagnostic sink failed');
    },
  });
  reachable = true;
  assert.ok((await host.listTools()).tools.length > 0);
});

test('a throwing diagnostic sink cannot skip transport abort after failed DELETE', async t => {
  const remote = await remoteFor(t);
  let deleteSignal;
  const { bridge } = await hostFor(t, {
    fetch: async (input, init) => {
      const { request } = await readMessage(input, init);
      if (request.method === 'DELETE') {
        deleteSignal = init.signal;
        return new Response('termination failed', { status: 503 });
      }
      return remote.fetch(input, init);
    },
    log: () => {
      throw new Error('diagnostic sink failed');
    },
  });
  const client = bridge.client();
  t.after(() => client.close());
  await bridge.close();
  assert.equal(deleteSignal?.aborted, true, 'cleanup must run despite logging failure');
});

for (const remoteUrl of ['ftp://remote.test/mcp', 'file:///tmp/mcp', 'data:text/plain,mcp']) {
  test(`direct construction rejects non-HTTP endpoint ${remoteUrl.split(':')[0]}`, () => {
    assert.throws(() => createBridge({ remoteUrl }), TypeError);
  });
}

test('an asynchronously rejected diagnostic sink cannot poison fallback startup', async t => {
  const remote = await remoteFor(t);
  let reachable = false;
  let observations = 0;
  const { host } = await hostFor(t, {
    fetch: (input, init) => (reachable ? remote.fetch(input, init) : Promise.reject(new Error('offline'))),
    log: async () => {
      observations += 1;
      throw new Error('asynchronous diagnostic failure');
    },
  });
  reachable = true;
  assert.ok((await host.listTools()).tools.length > 0);
  assert.ok(observations > 0, 'the rejecting sink must have been exercised');
  await new Promise(resolve => setImmediate(resolve));
});

test('an asynchronously rejected diagnostic sink cannot escape shutdown cleanup', async t => {
  const remote = await remoteFor(t);
  let observations = 0;
  let deleteSignal;
  const { bridge } = await hostFor(t, {
    fetch: async (input, init) => {
      const { request } = await readMessage(input, init);
      if (request.method === 'DELETE') {
        deleteSignal = init.signal;
        return new Response('termination failed', { status: 503 });
      }
      return remote.fetch(input, init);
    },
    log: async () => {
      observations += 1;
      throw new Error('asynchronous diagnostic failure');
    },
  });
  await bridge.close();
  assert.ok(observations > 0);
  assert.equal(deleteSignal?.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
});
