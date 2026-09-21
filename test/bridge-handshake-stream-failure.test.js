/** Real SDK + controlled streams/loopback HTTP. No merchant requests or qualification evidence. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createBridge } from '../src/bridge.js';
import { MAX_RESPONSE_BYTES } from '../src/utf8-response.js';
import { startFakeRemote } from './helpers/fake-remote.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => {
    resolve = yes;
  });
  return { promise, resolve };
};
async function within(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Failure did not settle promptly')), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const outcome = promise =>
  promise.then(
    value => ({ value }),
    error => ({ error }),
  );

for (const mime of ['application/json', 'text/event-stream']) {
  for (const mode of ['utf8', 'truncated', 'size', 'upstream']) {
    test(`initialize ${mime} ${mode} fails at corruption, not at the handshake deadline`, {
      timeout: 10000,
    }, async t => {
      const remote = await startFakeRemote();
      const entered = deferred();
      const methods = [];
      let producer;
      let broken = true;
      let signal;
      const bridge = createBridge({
        remoteUrl: 'https://remote.test/mcp',
        timeoutMs: 5000,
        fetch: async (input, init) => {
          const message = init.method === 'POST' ? JSON.parse(init.body) : null;
          methods.push(message?.method ?? init.method);
          if (message?.method === 'initialize' && broken) {
            signal = init.signal;
            entered.resolve();
            return new Response(
              new ReadableStream({
                start(controller) {
                  producer = controller;
                },
                // Failure notification may not wait for a non-cooperative source cleanup.
                cancel() {
                  return new Promise(() => {});
                },
              }),
              { headers: { 'content-type': mime } },
            );
          }
          return remote.fetch(input, init);
        },
      });
      t.after(() => Promise.allSettled([bridge.close(), remote.close()]));
      const first = outcome(bridge.connectRemote());
      const sibling = outcome(bridge.connectRemote());
      await within(entered.promise);
      if (mode === 'utf8') producer.enqueue(Uint8Array.of(0xff));
      else if (mode === 'truncated') {
        producer.enqueue(Uint8Array.of(0xe2, 0x82));
        producer.close();
      } else if (mode === 'size') producer.enqueue(Buffer.alloc(MAX_RESPONSE_BYTES + 1, 120));
      else producer.error(new Error('synthetic read failure'));
      const [a, b] = await within(Promise.all([first, sibling]));
      assert.ok(a.error instanceof Error);
      assert.equal(a.error, b.error, 'shared handshake observes the same failure');
      assert.doesNotMatch(a.error.message, /timed out|timeout/iu);
      assert.equal(signal.aborted, true);
      assert.equal(bridge.client(), undefined);
      assert.equal(methods.filter(method => method === 'initialize').length, 1, 'no implicit corruption replay');
      assert.equal(
        methods.includes('notifications/cancelled'),
        false,
        'initialize is closed, not protocol-cancelled',
      );
      broken = false;
      const healthy = await bridge.connectRemote();
      assert.ok((await healthy.listTools()).tools.length > 0);
    });
  }
}

test('real HTTP initialize SSE body closes on handshake completion while the session stays usable', {
  timeout: 10000,
}, async t => {
  const initialClosed = deferred();
  const methods = [];
  const sockets = new Set();
  const http = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(405).end();
      return;
    }
    if (req.method === 'DELETE') {
      res.writeHead(200).end();
      return;
    }
    let bytes = '';
    for await (const chunk of req) bytes += chunk;
    const message = JSON.parse(bytes);
    methods.push(message.method);
    if (message.method === 'initialize') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'handshake-test' });
      res.on('close', () => initialClosed.resolve());
      const result = {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'loopback', version: '1.0.0' },
      };
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`);
      return; // Deliberately keep initialize's wire body open after its result.
    }
    if (message.method === 'notifications/initialized') {
      res.writeHead(202).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [] } }));
  });
  http.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const bridge = createBridge({ remoteUrl: `http://127.0.0.1:${http.address().port}/mcp`, timeoutMs: 5000 });
  t.after(async () => {
    await bridge.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => http.close(resolve));
  });
  const remote = await bridge.connectRemote();
  await within(initialClosed.promise);
  assert.equal(remote.transport.sessionId, 'handshake-test');
  assert.deepEqual(await remote.listTools(), { tools: [] });
  assert.equal(methods.filter(method => method === 'initialize').length, 1);
  assert.equal(methods.includes('notifications/cancelled'), false);
});
