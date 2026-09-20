import assert from 'node:assert/strict';
import { finished } from 'node:stream/promises';
import test from 'node:test';
import { createUtf8Input } from '../src/utf8-input.js';

async function pass(chunks) {
  const input = createUtf8Input();
  const output = [];
  input.on('data', chunk => output.push(chunk));
  const done = finished(input);
  for (const chunk of chunks) input.write(chunk);
  input.end();
  await done;
  return Buffer.concat(output);
}

const valid = [
  '',
  'plain ASCII\r\n',
  'Ελληνικά: όχι Windows, έως 1.234,56 €',
  'emoji 🛒 and combining α\u0301',
  '\uFEFFBOM stays byte-identical',
  'literal replacement character \uFFFD is valid',
  '\u0000\u007F\u0080\u07FF\u0800\uD7FF\uE000\uFFFF\u{10000}\u{10FFFF}',
];
for (const [index, text] of valid.entries()) {
  test(`valid input ${index} is byte-identical at every split`, async () => {
    const bytes = Buffer.from(text);
    for (let split = 0; split <= bytes.length; split++) {
      assert.deepEqual(await pass([bytes.subarray(0, split), bytes.subarray(split)]), bytes);
    }
  });
}

test('one-byte chunks preserve multibyte shopper arguments and multiple JSON frames', async () => {
  const bytes = Buffer.from(`${JSON.stringify({ arguments: { query: 'όχι λευκό, 499,99 € 🛒' } })}\n{}\r\n`);
  assert.deepEqual(await pass([...bytes].map(byte => Buffer.from([byte]))), bytes);
});

const invalid = [
  [0x80],
  [0xbf],
  [0xc0, 0xaf],
  [0xc1, 0xbf],
  [0xc2, 0x20],
  [0xe0, 0x80, 0x80],
  [0xed, 0xa0, 0x80],
  [0xed, 0xbf, 0xbf],
  [0xf0, 0x80, 0x80, 0x80],
  [0xf4, 0x90, 0x80, 0x80],
  [0xf5, 0x80, 0x80, 0x80],
  [0xfe],
  [0xff],
];
for (const [index, bytes] of invalid.entries()) {
  test(`malformed sequence ${index} fails before its frame reaches a parser`, async () => {
    const frame = Buffer.concat([
      Buffer.from('{"query":"private-canary-'),
      Buffer.from(bytes),
      Buffer.from('"}\n'),
    ]);
    for (let split = 0; split <= frame.length; split++) {
      const input = createUtf8Input();
      const output = [];
      input.on('data', chunk => output.push(chunk));
      const rejected = assert.rejects(finished(input), error => {
        assert.equal(error.code, 'ERR_MCP_STDIN_UTF8');
        assert.equal(error.message.includes('private-canary'), false);
        return true;
      });
      input.write(frame.subarray(0, split));
      input.end(frame.subarray(split));
      await rejected;
      assert.equal(Buffer.concat(output).includes(0x0a), false);
    }
  });
}

for (const bytes of [[0xc2], [0xe2, 0x82], [0xf0, 0x9f, 0x92]]) {
  test(`truncated ${bytes.length}-byte tail fails at EOF`, async () => {
    await assert.rejects(pass(bytes.map(byte => Buffer.from([byte]))), { code: 'ERR_MCP_STDIN_UTF8' });
  });
}

test('pre-decoded strings are rejected instead of inventing byte provenance', async () => {
  await assert.rejects(pass(['shopper text']), { code: 'ERR_MCP_STDIN_UTF8' });
});

test('bounded backpressure is retained while the reader is stalled', async () => {
  const input = createUtf8Input();
  const chunk = Buffer.alloc(64 * 1024, 0x61);
  assert.equal(input.write(chunk), false);
  assert.ok(input.readableLength <= chunk.length);
  input.destroy();
  await finished(input).catch(error => assert.equal(error.code, 'ERR_STREAM_PREMATURE_CLOSE'));
});
