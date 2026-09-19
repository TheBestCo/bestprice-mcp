/** Real SDK exchange over controlled HTTP bytes. Not a public-endpoint qualification campaign. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge.js';
import { startFakeRemote } from './helpers/fake-remote.js';

async function setup(t, bytes, mime) {
  const remote = await startFakeRemote();
  let changed = true;
  let calls = 0;
  const bridge = createBridge({
    remoteUrl: 'https://remote.test/mcp',
    timeoutMs: 400,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const body = request.method === 'POST' ? await request.clone().json() : null;
      if (body?.method === 'tools/call') {
        calls += 1;
        if (changed) {
          const head = mime === 'text/event-stream' ? 'data: ' : '';
          const prefix = `${head}{"jsonrpc":"2.0","id":${JSON.stringify(body.id)},"result":{"content":[{"type":"text","text":"`;
          const suffix = `"}]}}${mime === 'text/event-stream' ? '\n\n' : ''}`;
          const pieces = [
            Buffer.from(prefix),
            ...bytes.map(byte => Uint8Array.of(byte)),
            Buffer.from(suffix),
          ];
          return new Response(
            new ReadableStream({
              pull(controller) {
                const next = pieces.shift();
                if (next) controller.enqueue(next);
                else controller.close();
              },
            }),
            {
              headers: { 'content-type': mime },
            },
          );
        }
      }
      return remote.fetch(input, init);
    },
  });
  const [hostTransport, bridgeTransport] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: 'utf8-test-host', version: '1.0.0' });
  t.after(() => Promise.allSettled([host.close(), bridge.close(), remote.close()]));
  await bridge.start(bridgeTransport);
  await host.connect(hostTransport);
  return {
    bridge,
    host,
    calls: () => calls,
    recover: () => {
      changed = false;
    },
  };
}

for (const mime of ['application/json', 'text/event-stream']) {
  for (const [name, bytes] of [
    ['isolated continuation', [0x80]],
    ['overlong encoding', [0xc0, 0xaf]],
    ['UTF-16 surrogate', [0xed, 0xa0, 0x80]],
    ['outside Unicode', [0xf4, 0x90, 0x80, 0x80]],
    ['truncated code point', [0xe2, 0x82]],
  ]) {
    test(`${mime}: corrupted ${name} never becomes a successful tool result`, async t => {
      const fixture = await setup(t, bytes, mime);
      const session = fixture.bridge.client().transport.sessionId;
      await assert.rejects(fixture.host.callTool({ name: 'echo', arguments: { text: 'control' } }));
      assert.equal(fixture.calls(), 1, 'ambiguous malformed response must not replay the tool');
      fixture.recover();
      const result = await fixture.host.callTool({ name: 'echo', arguments: { text: 'recovered' } });
      assert.equal(result.structuredContent.text, 'recovered');
      assert.equal(
        fixture.bridge.client().transport.sessionId,
        session,
        'healthy session must survive the failed request',
      );
    });
  }
  for (const text of ['ελληνικά € 😀', '\uFFFD', '\uFEFFinside']) {
    test(`${mime}: preserves valid split UTF-8: ${text}`, async t => {
      const fixture = await setup(t, [...Buffer.from(text)], mime);
      const result = await fixture.host.callTool({ name: 'echo', arguments: {} });
      assert.equal(result.content[0].text, text);
    });
  }
}
