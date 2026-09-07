import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  BRIDGE_INFO,
  createBridge,
  DEFAULT_REMOTE_URL,
  DEFAULT_TIMEOUT_MS,
  readConfig,
} from '../src/bridge.js';
import { FAKE_INSTRUCTIONS, FAKE_SERVER_INFO, FAKE_TOOLS, startFakeRemote } from './helpers/fake-remote.js';

const pkg = createRequire(import.meta.url)('../package.json');
const REMOTE_URL = 'https://remote.test/mcp';

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

/** Starts a bridge against `fetch` and connects a host client to it through an in-memory transport. */
async function connectHost({ fetch, timeoutMs, log } = {}) {
  const bridge = createBridge({ remoteUrl: REMOTE_URL, fetch, timeoutMs, log });
  const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const server = await bridge.start(bridgeSide);
  const host = new Client({ name: 'host', version: '0.0.0' });
  await host.connect(hostSide);
  cleanups.push(() => Promise.allSettled([host.close(), bridge.close()]));
  return { bridge, host, server };
}

async function withRemote(options) {
  const remote = await startFakeRemote(options);
  cleanups.push(() => remote.close());
  return remote;
}

describe('readConfig', () => {
  it('uses the public endpoint and a sixty second timeout by default', () => {
    const config = readConfig({ env: {} });
    assert.equal(config.remoteUrl.href, DEFAULT_REMOTE_URL);
    assert.equal(config.timeoutMs, DEFAULT_TIMEOUT_MS);
  });

  it('reads the endpoint and timeout from the environment', () => {
    const config = readConfig({
      env: { BESTPRICE_MCP_URL: 'http://localhost:8080/mcp', BESTPRICE_MCP_TIMEOUT_MS: '1500' },
    });
    assert.equal(config.remoteUrl.href, 'http://localhost:8080/mcp');
    assert.equal(config.timeoutMs, 1500);
  });

  it('rejects malformed or non-http endpoints', () => {
    assert.throws(() => readConfig({ env: { BESTPRICE_MCP_URL: 'not a url' } }), TypeError);
    assert.throws(() => readConfig({ env: { BESTPRICE_MCP_URL: 'ftp://example.com/mcp' } }), TypeError);
  });

  it('rejects timeouts that are not positive integers', () => {
    for (const value of ['0', '-5', '1.5', 'soon']) {
      assert.throws(() => readConfig({ env: { BESTPRICE_MCP_TIMEOUT_MS: value } }), TypeError, value);
    }
  });
});

describe('bridge', () => {
  it('identifies itself upstream with the package version', async () => {
    const remote = await withRemote();
    await connectHost({ fetch: remote.fetch });
    assert.deepEqual(BRIDGE_INFO, { name: 'bestprice-mcp-stdio', version: pkg.version });
    assert.deepEqual(remote.server.getClientVersion(), BRIDGE_INFO);
  });

  it('forwards the remote server info, instructions, and capabilities at initialize', async () => {
    const remote = await withRemote({ withPrompts: true });
    const { host } = await connectHost({ fetch: remote.fetch });
    assert.deepEqual(host.getServerVersion(), FAKE_SERVER_INFO);
    assert.equal(host.getInstructions(), FAKE_INSTRUCTIONS);
    assert.deepEqual(host.getServerCapabilities(), { tools: { listChanged: true }, prompts: {} });
  });

  it('forwards tools/list and returns the remote definitions verbatim', async () => {
    const remote = await withRemote();
    const { host } = await connectHost({ fetch: remote.fetch });
    const { tools } = await host.listTools();
    assert.deepEqual(tools, FAKE_TOOLS);
  });

  it('forwards tools/call arguments and returns content and structuredContent unchanged', async () => {
    const remote = await withRemote();
    const { host } = await connectHost({ fetch: remote.fetch });
    const result = await host.callTool({ name: 'echo', arguments: { text: 'γεια' } });
    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'γεια' }],
      structuredContent: { text: 'γεια' },
    });
  });

  it('passes isError tool results through as results, not protocol errors', async () => {
    const remote = await withRemote();
    const { host } = await connectHost({ fetch: remote.fetch });
    const result = await host.callTool({ name: 'fail_softly', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'The fixture declined.');
  });

  it('preserves the remote error code, message, and data', async () => {
    const remote = await withRemote();
    const { host } = await connectHost({ fetch: remote.fetch });
    await assert.rejects(host.callTool({ name: 'boom', arguments: {} }), error => {
      assert.equal(error.code, ErrorCode.InvalidParams);
      assert.equal(error.message, 'MCP error -32602: boom exploded');
      assert.deepEqual(error.data, { hint: 'do not call boom' });
      return true;
    });
  });

  it('forwards methods it has no explicit handler for', async () => {
    const remote = await withRemote({ withPrompts: true });
    const { host } = await connectHost({ fetch: remote.fetch });
    const { prompts } = await host.listPrompts();
    assert.deepEqual(prompts, [{ name: 'greet' }]);
  });

  it('reuses the session issued at initialize on every later request', async () => {
    const remote = await withRemote();
    const { host } = await connectHost({ fetch: remote.fetch });
    await host.listTools();
    await host.callTool({ name: 'echo', arguments: { text: 'x' } });

    const sessionIds = remote.requests.slice(1).map(request => request.headers.get('mcp-session-id'));
    assert.ok(sessionIds.length >= 3, 'expected requests after initialize');
    assert.ok(
      sessionIds.every(id => id && id === sessionIds[0]),
      `session ids differ: ${sessionIds}`,
    );
  });

  it('surfaces an upstream HTTP failure as an error instead of an empty tool list', async () => {
    const remote = await withRemote();
    let broken = false;
    const fetch = (input, init) =>
      broken ? Promise.resolve(new Response('upstream down', { status: 503 })) : remote.fetch(input, init);
    const { host } = await connectHost({ fetch });

    broken = true;
    await assert.rejects(host.listTools(), error => {
      assert.equal(error.code, ErrorCode.InternalError);
      assert.match(error.message, /Upstream remote\.test/u);
      return true;
    });
  });

  it('times out a hanging upstream call with RequestTimeout', async () => {
    const remote = await withRemote();
    const fetch = async (input, init) => {
      const request = new Request(input, init);
      const body = request.method === 'POST' ? await request.clone().json() : undefined;
      if (body?.method === 'tools/call') {
        return new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(init.signal.reason)),
        );
      }
      return remote.fetch(input, init);
    };
    const { host } = await connectHost({ fetch, timeoutMs: 200 });
    await assert.rejects(host.callTool({ name: 'echo', arguments: { text: 'slow' } }), error => {
      assert.equal(error.code, ErrorCode.RequestTimeout);
      return true;
    });
  });

  it('starts with fallback identity when the remote is unreachable and connects lazily later', async () => {
    const remote = await withRemote();
    let reachable = false;
    const logs = [];
    const fetch = (input, init) =>
      reachable ? remote.fetch(input, init) : Promise.reject(new Error('connect ECONNREFUSED'));
    const { host } = await connectHost({ fetch, log: message => logs.push(message) });

    assert.deepEqual(host.getServerVersion(), BRIDGE_INFO);
    assert.equal(host.getInstructions(), undefined);
    assert.deepEqual(host.getServerCapabilities(), { tools: {} });
    assert.ok(logs.some(line => /unavailable at startup/u.test(line)));

    await assert.rejects(host.listTools(), error => error.code === ErrorCode.InternalError);

    reachable = true;
    const { tools } = await host.listTools();
    assert.deepEqual(tools, FAKE_TOOLS);
  });

  it('re-initializes when the remote no longer knows the session', async () => {
    const first = await withRemote();
    let current = first;
    const fetch = (input, init) => current.fetch(input, init);
    const { bridge, host } = await connectHost({ fetch });
    await host.listTools();
    const firstSession = bridge.client().transport.sessionId;

    // Simulate a remote restart: a fresh server that has never seen our session id.
    current = await withRemote();
    const { tools } = await host.listTools();
    assert.deepEqual(tools, FAKE_TOOLS);
    const secondSession = bridge.client().transport.sessionId;
    assert.ok(firstSession && secondSession && firstSession !== secondSession, 'expected a new session');
    assert.deepEqual(
      (await current.methods()).filter(method => method !== 'notifications/initialized'),
      ['tools/list', 'initialize', 'tools/list'],
    );
  });

  it('re-initializes when the remote answers 404 for the session', async () => {
    const first = await withRemote();
    const second = await withRemote();
    let staleSession;
    const fetch = (input, init) => {
      const request = new Request(input, init);
      if (staleSession && request.headers.get('mcp-session-id') === staleSession) {
        return Promise.resolve(new Response('Session not found', { status: 404 }));
      }
      return (staleSession ? second : first).fetch(input, init);
    };
    const { bridge, host } = await connectHost({ fetch });
    await host.listTools();

    staleSession = bridge.client().transport.sessionId;
    const { tools } = await host.listTools();
    assert.deepEqual(tools, FAKE_TOOLS);
    assert.notEqual(bridge.client().transport.sessionId, staleSession);
    assert.deepEqual(
      (await second.methods()).filter(method => method !== 'notifications/initialized'),
      ['initialize', 'tools/list'],
    );
  });

  it('closes cleanly even when the remote rejects session termination', async () => {
    const remote = await withRemote();
    const fetch = (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'DELETE') return Promise.resolve(new Response('no', { status: 500 }));
      return remote.fetch(input, init);
    };
    const bridge = createBridge({ remoteUrl: REMOTE_URL, fetch });
    const [, bridgeSide] = InMemoryTransport.createLinkedPair();
    await bridge.start(bridgeSide);
    await bridge.close();
    assert.equal(bridge.client(), undefined);
  });

  it('refuses to start twice', async () => {
    const remote = await withRemote();
    const { bridge } = await connectHost({ fetch: remote.fetch });
    const [, other] = InMemoryTransport.createLinkedPair();
    await assert.rejects(bridge.start(other), /already started/u);
  });
});
