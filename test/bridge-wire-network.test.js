/** Real loopback HTTP and native fetch. No external endpoint or merchant traffic. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};
async function within(promise, ms = 750) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('local HTTP response did not close')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

for (const mode of ['cancel-json', 'deadline-json', 'complete-sse']) {
  test(`native fetch closes the physical response: ${mode}`, { timeout: 5000 }, async t => {
    const entered = deferred();
    const disconnected = deferred();
    const methods = [];
    const service = createServer(async (request, response) => {
      if (request.method === 'GET') {
        response.writeHead(405).end();
        return;
      }
      if (request.method === 'DELETE') {
        response.writeHead(204).end();
        return;
      }
      let text = '';
      for await (const part of request) text += part;
      const message = JSON.parse(text);
      methods.push(message.method);
      if (!Object.hasOwn(message, 'id')) {
        response.writeHead(202).end();
        return;
      }
      const reply = result =>
        response
          .writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'loopback-session' })
          .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      if (message.method === 'initialize') {
        reply({
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'loopback-control', version: '1.0.0' },
        });
      } else if (message.method === 'tools/list') {
        reply({ tools: [{ name: 'held', inputSchema: { type: 'object' } }] });
      } else {
        response.on('close', () => disconnected.resolve({ finished: response.writableEnded }));
        response.writeHead(200, {
          'content-type': mode === 'complete-sse' ? 'text/event-stream' : 'application/json',
        });
        response.write(
          mode === 'complete-sse'
            ? `data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'done' }] } })}\n\n`
            : '{"jsonrpc":"2.0",',
        );
        entered.resolve();
      }
    });
    await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
    const bridge = createBridge({
      remoteUrl: `http://127.0.0.1:${service.address().port}/mcp`,
      timeoutMs: mode === 'deadline-json' ? 150 : 1000,
    });
    const host = new Client({ name: 'loopback-host', version: '1.0.0' });
    const [hostSide, bridgeSide] = InMemoryTransport.createLinkedPair();
    t.after(async () => {
      await Promise.allSettled([host.close(), bridge.close()]);
      service.closeAllConnections();
      await new Promise(resolve => service.close(resolve));
    });
    await bridge.start(bridgeSide);
    await host.connect(hostSide);
    const session = bridge.client().transport.sessionId;
    const controller = new AbortController();
    const result = host
      .callTool({ name: 'held', arguments: {} }, undefined, { signal: controller.signal })
      .then(
        value => ({ value }),
        error => ({ error }),
      );
    await within(entered.promise);
    if (mode === 'cancel-json') controller.abort();
    const settled = await within(result);
    if (mode === 'complete-sse') assert.equal(settled.value.content[0].text, 'done');
    else assert.ok(settled.error);
    const closed = await within(disconnected.promise);
    assert.equal(closed.finished, false, 'the client closed the unfinished response');
    assert.equal((await host.listTools()).tools.length, 1, 'shared session must still work');
    assert.equal(bridge.client().transport.sessionId, session);
    assert.equal(methods.filter(method => method === 'tools/call').length, 1, 'never replay the action');
    if (mode === 'complete-sse') assert.equal(methods.includes('notifications/cancelled'), false);
  });
}
