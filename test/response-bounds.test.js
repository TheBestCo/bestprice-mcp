/** Synthetic byte streams and actual SDK exchanges; not production load or task qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge.js';
import { validateUtf8Response } from '../src/utf8-response.js';
import { startFakeRemote } from './helpers/fake-remote.js';

const LIMIT = 8 * 1024 * 1024;
const source = (text, mime, chunkSize = 1) => {
  const bytes = Buffer.from(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const start = offset;
        offset += chunkSize;
        controller.enqueue(bytes.subarray(start, offset));
      },
    }),
    { headers: { 'content-type': mime } },
  );
};
const bounded = (response, maxBytes) => validateUtf8Response(response, { maxBytes });

for (const mime of ['application/json', 'application/json; charset=utf-8', 'text/plain']) {
  test(`${mime}: finite response accepts its exact byte budget and rejects one extra byte`, async () => {
    const text = '{"text":"ε € 😀"}';
    const length = Buffer.byteLength(text);
    assert.equal(await bounded(source(text, mime), length).text(), text);
    await assert.rejects(bounded(source(text, mime), length - 1).text(), /byte limit/u);
  });
}
for (const newline of ['\n', '\r', '\r\n']) {
  for (const chunkSize of [1, 2, 4096]) {
    test(`SSE ${JSON.stringify(newline)}, chunks=${chunkSize}: budget resets at an event boundary`, async () => {
      const event = `data: {"value":"ε"}${newline}${newline}`;
      const stream = event.repeat(8);
      assert.equal(
        await bounded(
          source(stream, 'Text/Event-Stream; charset=utf-8', chunkSize),
          Buffer.byteLength(event),
        ).text(),
        stream,
      );
      await assert.rejects(
        bounded(source(event, 'text/event-stream', chunkSize), Buffer.byteLength(event) - 1).text(),
        /byte limit/u,
      );
    });
  }
}
test('multiline data is bounded as a whole event, not independently per data line', async () => {
  const line = 'data: 123456789\n';
  await assert.rejects(
    bounded(source(`${line.repeat(20)}\n`, 'text/event-stream'), 64).text(),
    /byte limit/u,
  );
});
test('large unterminated lines cannot evade the event delimiter check', async () => {
  await assert.rejects(
    bounded(source(`data: ${'x'.repeat(128)}`, 'text/event-stream'), 64).text(),
    /byte limit/u,
  );
});
test('comments do not accumulate into a false event-size failure', async () => {
  const text = `${': heartbeat\r\n'.repeat(100)}data: {}\r\n\r\n`;
  assert.equal(await bounded(source(text, 'text/event-stream'), 32).text(), text);
});
test('a single comment line is still bounded', async () => {
  await assert.rejects(
    bounded(source(`:${'x'.repeat(128)}\n`, 'text/event-stream'), 64).text(),
    /byte limit/u,
  );
});
test('comment lines cannot reset an unfinished oversized data event', async () => {
  const text = `${'data: 123456789\n:keepalive\n'.repeat(20)}\n`;
  await assert.rejects(bounded(source(text, 'text/event-stream'), 64).text(), /byte limit/u);
});
test('corrupt UTF-8 remains rejected after adding size bounds', async () => {
  await assert.rejects(bounded(new Response(Uint8Array.of(0xff)), 64).text(), TypeError);
});
test('content-length cannot override observed byte counts', async () => {
  const response = new Response('x'.repeat(65), { headers: { 'content-length': '1' } });
  await assert.rejects(bounded(response, 64).text(), /byte limit/u);
});
test('size rejection cancels a long producer without draining it', async () => {
  let pulls = 0;
  let reason;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls > 10) controller.close();
        else controller.enqueue(Buffer.alloc(32, 120));
      },
      cancel(error) {
        reason = error;
      },
    }),
  );
  await assert.rejects(bounded(response, 64).text(), /byte limit/u);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(reason.message, /byte limit/u);
  assert.ok(pulls <= 5, `continued pulling: ${pulls}`);
});
for (const maxBytes of [0, -1, NaN, Infinity, '64', 0.5, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid bound ${String(maxBytes)} is rejected without consuming the source`, () => {
    const response = new Response('{}');
    assert.throws(() => bounded(response, maxBytes), /maxBytes/u);
    assert.equal(response.bodyUsed, false);
  });
}
for (const mime of ['application/json', 'text/event-stream']) {
  test(`${mime}: real SDK cannot accept a tool result larger than the default bound or replay it`, {
    timeout: 8000,
  }, async t => {
    const remote = await startFakeRemote();
    let calls = 0;
    let oversize = true;
    const bridge = createBridge({
      remoteUrl: 'https://remote.test/mcp',
      timeoutMs: 1500,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const body = request.method === 'POST' ? await request.clone().json() : null;
        if (body?.method === 'tools/call') {
          calls += 1;
          if (oversize) {
            const json = JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { content: [{ type: 'text', text: 'x'.repeat(LIMIT) }] },
            });
            return source(mime === 'text/event-stream' ? `data: ${json}\n\n` : json, mime, 65536);
          }
        }
        return remote.fetch(input, init);
      },
    });
    const [hostTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
    const host = new Client({ name: 'bounds-test', version: '1.0.0' });
    t.after(() => Promise.allSettled([host.close(), bridge.close(), remote.close()]));
    await bridge.start(bridgeTransport);
    await host.connect(hostTransport);
    const session = bridge.client().transport.sessionId;
    await assert.rejects(host.callTool({ name: 'echo', arguments: {} }));
    assert.equal(calls, 1);
    oversize = false;
    const recovered = await host.callTool({ name: 'echo', arguments: { text: 'healthy' } });
    assert.equal(recovered.structuredContent.text, 'healthy');
    assert.equal(bridge.client().transport.sessionId, session);
    assert.equal(calls, 2);
  });
}
