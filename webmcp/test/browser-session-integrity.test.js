/** Harmless real subprocesses. Transport integrity, not browser/model qualification evidence. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { browserSession } from '../evals/browser-session.js';

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const peer = (t, source, options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'webmcp-byte-integrity-'));
  const path = join(dir, 'peer.mjs');
  writeFileSync(path, source);
  const session = browserSession(`${shellQuote(process.execPath)} ${shellQuote(path)}`, 1500, {
    closeGraceMs: 25,
    ...options,
  });
  t.after(async () => {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return session;
};
const bytePeer = (t, chunks) =>
  peer(
    t,
    `
  import { createInterface } from 'node:readline';
  import { setTimeout as delay } from 'node:timers/promises';
  for await (const line of createInterface({ input: process.stdin })) {
    for (const chunk of ${JSON.stringify(chunks)}) {
      await new Promise(resolve => process.stdout.write(Buffer.from(chunk), resolve));
      await delay(5);
    }
  }
`,
  );
const echoPeer = t =>
  peer(
    t,
    `
  import { createInterface } from 'node:readline';
  let count = 0;
  for await (const line of createInterface({ input: process.stdin })) {
    console.log(JSON.stringify({ count: ++count, line }));
  }
`,
  );

for (const [name, invalid] of [
  ['isolated continuation', [0x80]],
  ['overlong encoding', [0xc0, 0xaf]],
  ['UTF-16 surrogate', [0xed, 0xa0, 0x80]],
  ['outside Unicode', [0xf4, 0x90, 0x80, 0x80]],
  ['truncated multibyte', [0xe2, 0x82]],
]) {
  for (const split of [false, true]) {
    test(`refuses ${name} bytes (${split ? 'fragmented' : 'one frame'}) without silent replacement`, async t => {
      const bytes = [...Buffer.from('{"ok":true,"value":"'), ...invalid, ...Buffer.from('"}\n')];
      const chunks = split ? bytes.map(byte => [byte]) : [bytes];
      const session = bytePeer(t, chunks);
      await assert.rejects(session.request({}), /invalid browser reply.*UTF-8/u);
      await assert.rejects(session.request({}), /unavailable/u);
    });
  }
}

for (const text of ['ελληνικά € 😀', '\uFFFD', 'e\u0301', '\uFEFFinside']) {
  test(`preserves valid UTF-8 even at every byte boundary: ${text}`, async t => {
    const reply = { ok: true, text };
    const bytes = [...Buffer.from(`${JSON.stringify(reply)}\n`)];
    const session = bytePeer(
      t,
      bytes.map(byte => [byte]),
    );
    assert.deepEqual(await session.request({}), reply);
  });
}

test('keeps a leading BOM invalid rather than silently changing the JSON framing contract', async t => {
  const session = bytePeer(t, [[0xef, 0xbb, 0xbf, ...Buffer.from('{}\n')]]);
  await assert.rejects(session.request({}), /invalid browser reply/u);
});

test('accepts CRLF and exact-cap multibyte frames without changing observed bytes', async t => {
  const reply = { value: 'ε € 😀' };
  const wire = `${JSON.stringify(reply)}\r\n`;
  const source = `process.stdin.once('data', () => process.stdout.write(Buffer.from(${JSON.stringify([...Buffer.from(wire)])})));`;
  const session = peer(t, source, { maxFrameBytes: Buffer.byteLength(wire) - 1 });
  assert.deepEqual(await session.request({}), reply);
});

for (const [name, make] of [
  [
    'circular object',
    () => {
      const value = {};
      value.self = value;
      return value;
    },
  ],
  ['BigInt', () => ({ value: 1n })],
  [
    'throwing getter',
    () => ({
      get value() {
        throw new Error('cannot serialize');
      },
    }),
  ],
  ['undefined', () => undefined],
  ['function', () => () => {}],
  ['symbol', () => Symbol('not JSON')],
  ['toJSON returning undefined', () => ({ toJSON: () => undefined })],
]) {
  test(`unsent ${name} cannot strand the next request behind a phantom pending operation`, async t => {
    const session = echoPeer(t);
    await assert.rejects(session.request(make()));
    assert.equal(session.state, 'open', 'an unsent local input error must not poison the peer');
    const payload = { calls: [], query: 'καφές' };
    assert.deepEqual(await session.request(payload), { count: 1, line: JSON.stringify(payload) });
  });
}

test('serialization reserves ownership against reentrant request dispatch', async t => {
  const session = echoPeer(t);
  let nested;
  const first = session.request({
    toJSON() {
      nested = session.request({ nested: true });
      return { first: true };
    },
  });
  await assert.rejects(nested, /busy/u);
  assert.deepEqual(await first, { count: 1, line: '{"first":true}' });
  assert.deepEqual(await session.request({ next: true }), { count: 2, line: '{"next":true}' });
});

test('close during serialization cannot dispatch an action after shutdown begins', async t => {
  const session = echoPeer(t);
  await assert.rejects(
    session.request({
      toJSON() {
        session.close();
        return {};
      },
    }),
    /closed/u,
  );
  await session.close();
  assert.equal(session.state, 'closed');
});

for (const [name, values, build] of [
  ['timeoutMs', [0, -1, 0.5, NaN, Infinity, 2147483648], value => [value, { closeGraceMs: 0 }]],
  ['closeGraceMs', [-1, 0.5, NaN, Infinity, 2147483648], value => [100, { closeGraceMs: value }]],
  [
    'maxFrameBytes',
    [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1],
    value => [100, { closeGraceMs: 0, maxFrameBytes: value }],
  ],
]) {
  test(`rejects invalid ${name} before spawning a process`, async () => {
    for (const value of values) {
      let session;
      try {
        assert.throws(() => {
          session = browserSession('exit 0', ...build(value));
        }, new RegExp(name, 'u'));
      } finally {
        await session?.close();
      }
    }
  });
}
