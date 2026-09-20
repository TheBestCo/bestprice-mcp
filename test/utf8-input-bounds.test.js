import assert from 'node:assert/strict';
import { finished } from 'node:stream/promises';
import test from 'node:test';
import * as utf8 from '../src/utf8-input.js';

async function pass(chunks, options) {
  const input = utf8.createUtf8Input(options);
  const output = [];
  input.on('data', chunk => output.push(chunk));
  const done = finished(input);
  for (const chunk of chunks) input.write(chunk);
  input.end();
  await done;
  return Buffer.concat(output);
}

for (const maxFrameBytes of [0, -1, 0.5, NaN, Infinity, '8', null, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid frame bound ${String(maxFrameBytes)} before consuming stdin`, () => {
    assert.throws(() => utf8.createUtf8Input({ maxFrameBytes }), TypeError);
  });
}

for (const ending of ['', '\n', '\r\n']) {
  test(`accepts the exact byte cap with ending ${JSON.stringify(ending)}`, async () => {
    const bytes = Buffer.from(`Ελλάδα€${ending}`);
    const maxFrameBytes = bytes.length - (ending.endsWith('\n') ? 1 : 0);
    for (let split = 0; split <= bytes.length; split++) {
      assert.deepEqual(
        await pass([bytes.subarray(0, split), bytes.subarray(split)], { maxFrameBytes }),
        bytes,
      );
    }
  });

  test(`rejects one byte over the cap with ending ${JSON.stringify(ending)}`, async () => {
    const bytes = Buffer.from(`Ελλάδα€${ending}`);
    const maxFrameBytes = bytes.length - (ending.endsWith('\n') ? 1 : 0) - 1;
    for (let split = 0; split <= bytes.length; split++) {
      await assert.rejects(pass([bytes.subarray(0, split), bytes.subarray(split)], { maxFrameBytes }), {
        code: 'ERR_MCP_STDIN_SIZE',
      });
    }
  });
}

test('newline resets only the frame budget, not the stream lifetime budget', async () => {
  const bytes = Buffer.from('€€\n'.repeat(100));
  assert.deepEqual(await pass([bytes], { maxFrameBytes: 6 }), bytes);
  assert.deepEqual(
    await pass(
      [...bytes].map(byte => Buffer.from([byte])),
      { maxFrameBytes: 6 },
    ),
    bytes,
  );
});

test('carriage returns do not reset the SDK newline-delimited frame budget', async () => {
  await assert.rejects(pass([Buffer.from('aa\raa\raa\n')], { maxFrameBytes: 4 }), {
    code: 'ERR_MCP_STDIN_SIZE',
  });
});

test('an oversized fragmented frame never forwards its terminating newline', async () => {
  const input = utf8.createUtf8Input({ maxFrameBytes: 8 });
  const output = [];
  input.on('data', chunk => output.push(chunk));
  const rejected = assert.rejects(finished(input), { code: 'ERR_MCP_STDIN_SIZE' });
  input.write(Buffer.from('12345678'));
  input.end(Buffer.from('9\n'));
  await rejected;
  assert.equal(Buffer.concat(output).includes(10), false);
  assert.ok(Buffer.concat(output).length <= 8);
});

test('oversize diagnostics never copy the shopper payload', async () => {
  await assert.rejects(pass([Buffer.from('private-shopper-canary')], { maxFrameBytes: 8 }), error => {
    assert.equal(error.code, 'ERR_MCP_STDIN_SIZE');
    assert.equal(error.message.includes('private-shopper-canary'), false);
    return true;
  });
});

test('default input cap is 8 MiB and rejects an unfinished oversized frame', async () => {
  assert.equal(utf8.MAX_INPUT_FRAME_BYTES, 8 * 1024 * 1024);
  await assert.rejects(pass([Buffer.alloc(8 * 1024 * 1024 + 1, 0x61)]), {
    code: 'ERR_MCP_STDIN_SIZE',
  });
});

test('each stream owns its own pending frame length', async () => {
  const first = utf8.createUtf8Input({ maxFrameBytes: 4 });
  const second = utf8.createUtf8Input({ maxFrameBytes: 4 });
  first.resume();
  second.resume();
  const rejected = assert.rejects(finished(first), { code: 'ERR_MCP_STDIN_SIZE' });
  const passed = finished(second);
  first.write(Buffer.from('1234'));
  second.write(Buffer.from('abcd'));
  first.end(Buffer.from('5'));
  second.end(Buffer.from('\n'));
  await Promise.all([rejected, passed]);
});

test('UTF-8 corruption and truncated tails remain failures below the size cap', async () => {
  for (const bytes of [[0xff], [0xe2, 0x82]]) {
    await assert.rejects(pass([Buffer.from(bytes)], { maxFrameBytes: 16 }), {
      code: 'ERR_MCP_STDIN_UTF8',
    });
  }
});

test('size is enforced before allocating the UTF-8 validation string', async () => {
  await assert.rejects(pass([Buffer.alloc(16, 0xff)], { maxFrameBytes: 8 }), {
    code: 'ERR_MCP_STDIN_SIZE',
  });
});
