/** Actual loopback HTTP, native fetch and real SDK. No external network or billing traffic. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createBridge } from '../src/bridge.js';

for (const mode of ['invalid-utf8', 'connection-reset']) {
  test(`native fetch ${mode}: fails the request and closes its socket without dropping the session`, {
    timeout: 5000,
  }, async t => {
    let disconnect;
    const disconnected = new Promise(resolve => {
      disconnect = resolve;
    });
    let calls = 0;
    const service = createServer(async (request, response) => {
      if (request.method === 'GET') {
        response.writeHead(405).end();
        return;
      }
      if (request.method === 'DELETE') {
        response.writeHead(204).end();
        return;
      }
      let body = '';
      for await (const part of request) body += part;
      const message = JSON.parse(body);
      if (!Object.hasOwn(message, 'id')) {
        response.writeHead(202).end();
        return;
      }
      const reply = result =>
        response
          .writeHead(200, {
            'content-type': 'application/json',
            'mcp-session-id': 'stable-test-session',
          })
          .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      if (message.method === 'initialize') {
        reply({
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'local-stream-control', version: '1.0.0' },
        });
      } else if (message.method === 'tools/list') {
        reply({ tools: [{ name: 'broken', inputSchema: { type: 'object' } }] });
      } else {
        calls++;
        response.on('close', () => disconnect({ ended: response.writableEnded }));
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write('data: ');
        if (mode === 'invalid-utf8') response.write(Buffer.from([0xff]));
        else setImmediate(() => response.destroy());
      }
    });
    await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
    const bridge = createBridge({
      remoteUrl: `http://127.0.0.1:${service.address().port}/mcp`,
      timeoutMs: 1000,
    });
    const host = new Client({ name: 'stream-network-host', version: '1.0.0' });
    const [hostTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
    t.after(async () => {
      await Promise.allSettled([host.close(), bridge.close()]);
      service.closeAllConnections();
      await new Promise(resolve => service.close(resolve));
    });
    await bridge.start(bridgeTransport);
    await host.connect(hostTransport);
    const session = bridge.client().transport.sessionId;
    const start = performance.now();
    await assert.rejects(host.callTool({ name: 'broken', arguments: {} }), error => {
      assert.equal(error.code, ErrorCode.InternalError, error.message);
      assert.doesNotMatch(error.message, /timed out/iu);
      return true;
    });
    t.diagnostic(`fault-to-settlement=${Math.round(performance.now() - start)}ms`);
    assert.equal((await disconnected).ended, false);
    assert.equal((await host.listTools()).tools.length, 1);
    assert.equal(bridge.client().transport.sessionId, session);
    assert.equal(calls, 1);
  });
}
