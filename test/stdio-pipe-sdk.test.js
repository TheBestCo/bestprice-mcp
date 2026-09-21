import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { FAKE_SERVER_INFO, FAKE_TOOLS, startFakeRemote } from './helpers/fake-remote.js';

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));
// No loader or substituted imports: actual stdio entrypoint, installed SDK, real OS pipes,
// and a loopback HTTP server. DELETE proves upstream cleanup, not merely child exit.
async function fixture(t, { closeStderr = false } = {}) {
  const remote = await startFakeRemote();
  const sockets = new Set();
  let deletes = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (request.method === 'DELETE') deletes++;
      const controller = new AbortController();
      response.once('close', () => controller.abort());
      const result = await remote.fetch(
        new Request(`http://${request.headers.host}${request.url}`, {
          method: request.method,
          headers: request.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
          signal: controller.signal,
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) {
        for await (const chunk of result.body) response.write(chunk);
      }
      response.end();
    })().catch(() => response.destroy());
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [ENTRY], {
    env: {
      ...process.env,
      BESTPRICE_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp`,
      BESTPRICE_MCP_TIMEOUT_MS: '2000',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 8000);
  t.after(async () => {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled([remote.close(), new Promise(resolve => server.close(resolve)), closed]);
  });
  let stderr = '';
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.stdin.on('error', () => {});
  if (closeStderr) child.stderr.destroy();
  const lines = createInterface({ input: child.stdout });
  const messages = [];
  const waiters = new Set();
  const notify = () => {
    for (const check of waiters) check();
  };
  lines.on('line', line => {
    messages.push(JSON.parse(line));
    notify();
  });
  child.on('exit', notify);
  const answer = id =>
    new Promise((resolve, reject) => {
      const check = () => {
        const found = messages.find(message => message.id === id);
        if (found) {
          waiters.delete(check);
          resolve(found);
        } else if (child.exitCode !== null || child.signalCode !== null) {
          waiters.delete(check);
          reject(new Error('Stdio exited before the SDK response.'));
        }
      };
      waiters.add(check);
      check();
    });
  const send = message => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  send({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      clientInfo: { name: 'pipe-lifecycle-test', version: '1.0.0' },
      capabilities: {},
    },
  });
  assert.deepEqual((await answer(1)).result.serverInfo, FAKE_SERVER_INFO);
  send({ method: 'notifications/initialized' });
  return { child, closed, send, answer, stderr: () => stderr, deletes: () => deletes };
}

test('real SDK completes discovery with a closed diagnostic pipe and cleans up on EOF', {
  timeout: 12000,
}, async t => {
  const f = await fixture(t, { closeStderr: true });
  f.send({ id: 2, method: 'tools/list' });
  assert.deepEqual((await f.answer(2)).result.tools, FAKE_TOOLS);
  f.child.stdin.end();
  assert.deepEqual(await f.closed, [0, null]);
  assert.equal(f.deletes(), 1);
});

for (const closeStderr of [false, true]) {
  test(`real SDK terminates the upstream session on broken stdout (stderr closed=${closeStderr})`, {
    timeout: 12000,
  }, async t => {
    const f = await fixture(t, { closeStderr });
    f.child.stdout.destroy();
    f.send({ id: 2, method: 'tools/list' });
    assert.deepEqual(await f.closed, [1, null]);
    assert.equal(f.deletes(), 1, 'the host pipe failure must not orphan the upstream session');
    assert.doesNotMatch(f.stderr(), /Unhandled 'error' event|node:events/u);
    if (!closeStderr) assert.match(f.stderr(), /Shutting down \(stdout error\)/u);
  });
}
