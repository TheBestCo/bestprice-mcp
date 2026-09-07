import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { FAKE_SERVER_INFO, FAKE_TOOLS, startFakeRemote } from './helpers/fake-remote.js';

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));
const WAIT_MS = 10_000;

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

/** Serves the in-process fake remote over a real loopback port so a child process can reach it. */
async function listenFakeRemote() {
  const remote = await startFakeRemote();
  const http = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body,
    });
    const response = await remote.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) return res.end();
    for await (const chunk of response.body) res.write(chunk);
    res.end();
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => Promise.allSettled([remote.close(), new Promise(resolve => http.close(resolve))]));
  return { remote, url: `http://127.0.0.1:${http.address().port}/mcp` };
}

/**
 * Spawns stdio.mjs through the SDK's stdio client transport.
 * With `host: true` an MCP client is connected to it; otherwise the transport is only started.
 */
async function spawnBridge(env, { host = false } = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    env: { ...process.env, ...env },
    stderr: 'pipe',
  });
  let client;
  if (host) {
    client = new Client({ name: 'host', version: '0.0.0' });
    await client.connect(transport);
  } else {
    await transport.start();
  }

  let stderr = '';
  const stderrWaiters = [];
  transport.stderr.on('data', chunk => {
    stderr += chunk;
    for (const waiter of stderrWaiters.splice(0)) waiter();
  });
  const exited = once(transport.stderr, 'end');
  const waitForStderr = pattern =>
    new Promise(resolve => {
      const check = () => (pattern.test(stderr) ? resolve() : stderrWaiters.push(check));
      check();
    });

  cleanups.push(() => Promise.allSettled([client?.close(), transport.close()]));
  return { transport, client, exited, waitForStderr, stderr: () => stderr, pid: transport.pid };
}

const withinLimit = promise =>
  Promise.race([promise, once(AbortSignal.timeout(WAIT_MS), 'abort').then(() => assert.fail('timed out'))]);

describe('stdio.mjs', () => {
  it('honours BESTPRICE_MCP_URL and completes initialize, tools/list, and tools/call over stdio', async () => {
    const { url } = await listenFakeRemote();
    const { client, stderr } = await spawnBridge({ BESTPRICE_MCP_URL: url }, { host: true });

    assert.deepEqual(client.getServerVersion(), FAKE_SERVER_INFO);
    const { tools } = await client.listTools();
    assert.deepEqual(tools, FAKE_TOOLS);
    const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
    assert.equal(result.structuredContent.text, 'hi');

    assert.match(stderr(), /^BestPrice MCP stdio forwarder started\n/u);
    assert.ok(stderr().includes(`Forwarding to: ${url}`), stderr());
  });

  it('starts even when the upstream is unreachable and reports it on the first request', async () => {
    const { client, stderr } = await spawnBridge(
      { BESTPRICE_MCP_URL: 'http://127.0.0.1:9/mcp' },
      { host: true },
    );
    assert.equal(client.getServerVersion().name, 'bestprice-mcp-stdio');
    await assert.rejects(client.listTools(), /Upstream 127\.0\.0\.1:9/u);
    assert.match(stderr(), /^BestPrice MCP stdio forwarder started\n/u);
    assert.match(stderr(), /unavailable at startup/u);
  });

  it('exits when the host closes stdin', async () => {
    const { url } = await listenFakeRemote();
    const { transport, exited, waitForStderr, stderr } = await spawnBridge({ BESTPRICE_MCP_URL: url });
    await withinLimit(waitForStderr(/Forwarding to:/u));
    await transport.close();
    await withinLimit(exited);
    assert.match(stderr(), /Shutting down \(stdin closed\)/u);
  });

  it('exits on SIGTERM', async () => {
    const { url } = await listenFakeRemote();
    const { pid, exited, waitForStderr, stderr } = await spawnBridge({ BESTPRICE_MCP_URL: url });
    await withinLimit(waitForStderr(/Forwarding to:/u));
    process.kill(pid, 'SIGTERM');
    await withinLimit(exited);
    assert.match(stderr(), /Shutting down \(SIGTERM\)/u);
  });

  it('exits with a configuration error on an invalid BESTPRICE_MCP_URL', async () => {
    const { exited, stderr } = await spawnBridge({ BESTPRICE_MCP_URL: 'nope' });
    await withinLimit(exited);
    assert.match(stderr(), /Configuration error: BESTPRICE_MCP_URL is not a valid URL: nope/u);
  });
});
