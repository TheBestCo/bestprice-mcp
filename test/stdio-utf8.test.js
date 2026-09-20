import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createUtf8Input } from '../src/utf8-input.js';

// Real installed SDK + real subprocess tests; no merchant, production endpoint or model calls.
// These require npm ci and are distinct from the dependency-free transform regressions.
async function sdk(t) {
  const input = createUtf8Input();
  const output = new PassThrough();
  const messages = [];
  const transport = new StdioServerTransport(input, output);
  transport.onmessage = message => messages.push(message);
  transport.onerror = () => {};
  t.after(async () => {
    await transport.close();
    input.destroy();
    output.destroy();
  });
  await transport.start();
  return { input, messages };
}

test('installed SDK receives byte-split Greek shopper arguments unchanged', async t => {
  const { input, messages } = await sdk(t);
  const message = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'search_products', arguments: { query: 'όχι Windows, έως 1.234,56 € 🛒' } },
  };
  const done = finished(input);
  for (const byte of Buffer.from(`${JSON.stringify(message)}\n`)) input.write(Buffer.from([byte]));
  input.end();
  await done;
  assert.deepEqual(messages, [message]);
});

test('installed SDK accepts a legitimately encoded replacement character', async t => {
  const { input, messages } = await sdk(t);
  const message = { jsonrpc: '2.0', id: 1, method: 'test', params: { text: '\uFFFD' } };
  const done = finished(input);
  input.end(Buffer.from(`${JSON.stringify(message)}\n`));
  await done;
  assert.deepEqual(messages, [message]);
});

for (const split of [false, true]) {
  test(`installed SDK never sees a replacement-decoded malformed argument (split=${split})`, async t => {
    const { input, messages } = await sdk(t);
    const prefix = Buffer.from('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"query":"');
    const suffix = Buffer.from('"}}\n');
    const rejected = assert.rejects(finished(input), { code: 'ERR_MCP_STDIN_UTF8' });
    if (split) {
      input.write(Buffer.concat([prefix, Buffer.from([0xe2])]));
      input.end(Buffer.concat([Buffer.from([0x28, 0xa1]), suffix]));
    } else {
      input.end(Buffer.concat([prefix, Buffer.from([0xff]), suffix]));
    }
    await rejected;
    assert.deepEqual(messages, []);
  });
}

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));
for (const [label, bytes, code] of [
  [
    'malformed frame',
    Buffer.concat([Buffer.from('{"private":"privacy-canary-'), Buffer.from([0xff]), Buffer.from('"}\n')]),
    1,
  ],
  ['truncated EOF', Buffer.concat([Buffer.from('privacy-canary-'), Buffer.from([0xe2, 0x82])]), 1],
  ['clean EOF', Buffer.alloc(0), 0],
]) {
  test(`stdio process exits correctly on ${label} without exposing input`, { timeout: 10000 }, async t => {
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        BESTPRICE_MCP_URL: 'http://127.0.0.1:9/mcp',
        BESTPRICE_MCP_TIMEOUT_MS: '1000',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.stdin.on('error', error => assert.equal(error.code, 'EPIPE'));
    const closed = once(child, 'close');
    child.stdin.end(bytes);
    const [exitCode, signal] = await closed;
    assert.equal(signal, null);
    assert.equal(exitCode, code, stderr);
    assert.equal(stdout, '');
    assert.equal(stderr.includes('privacy-canary'), false);
    assert.match(stderr, code ? /Shutting down \(invalid stdin\)/u : /Shutting down \(stdin closed\)/u);
  });
}
