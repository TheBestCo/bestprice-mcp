/** Stream mechanics for the production bridge adapter; no network or endpoint claims. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateUtf8Response } from '../src/utf8-response.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};

test('keeps status, routing headers, fetch metadata and original response bytes', async () => {
  const bytes = Buffer.from('\uFEFFdata: {"value":"ε € 😀"}\r\n\r\n');
  const original = new Response(bytes, {
    status: 503,
    statusText: 'Unavailable',
    headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'session', 'retry-after': '2' },
  });
  for (const [name, value] of Object.entries({
    url: 'https://remote.test/mcp',
    redirected: true,
    type: 'cors',
  })) {
    Object.defineProperty(original, name, { value });
  }
  const checked = validateUtf8Response(original);
  assert.equal(checked.status, 503);
  assert.equal(checked.statusText, 'Unavailable');
  assert.equal(checked.ok, false);
  assert.deepEqual([...checked.headers], [...original.headers]);
  for (const name of ['url', 'redirected', 'type']) assert.equal(checked[name], original[name]);
  assert.deepEqual(Buffer.from(await checked.arrayBuffer()), bytes);
});

for (const status of [204, 304]) {
  test(`preserves empty response identity: ${status}`, () => {
    const original = new Response(null, { status, headers: { 'mcp-session-id': 'session' } });
    assert.equal(validateUtf8Response(original), original);
  });
}

for (const bytes of [[0xe2], [0xe2, 0x82], [0xf0, 0x9f, 0x98]]) {
  test(`rejects an unfinished UTF-8 code point at EOF: ${bytes.join(',')}`, async () => {
    const checked = validateUtf8Response(new Response(Uint8Array.from(bytes)));
    await assert.rejects(checked.arrayBuffer(), TypeError);
  });
}

test('delivers bytes before EOF rather than buffering an entire long-lived event stream', {
  timeout: 1500,
}, async () => {
  let source;
  const first = Buffer.from('data: {"event":"first"}\n\n');
  const original = new Response(
    new ReadableStream({
      start(controller) {
        source = controller;
        controller.enqueue(first);
      },
    }),
  );
  const reader = validateUtf8Response(original).body.getReader();
  assert.deepEqual((await reader.read()).value, first);
  source.enqueue(Buffer.from('data: {"event":"second"}\n\n'));
  source.close();
  assert.equal((await reader.read()).done, false);
  assert.equal((await reader.read()).done, true);
  reader.releaseLock();
});

test('downstream cancellation reaches the upstream stream with the original reason', {
  timeout: 1500,
}, async () => {
  const cancelled = deferred();
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('data: {}\n\n'));
    },
    cancel(reason) {
      cancelled.resolve(reason);
    },
  });
  const reader = validateUtf8Response(new Response(source)).body.getReader();
  await reader.read();
  const reason = new Error('caller stopped');
  await reader.cancel(reason);
  assert.equal(await cancelled.promise, reason);
  reader.releaseLock();
});

test('upstream read errors preserve their identity instead of becoming valid empty content', async () => {
  const failure = new Error('upstream failed');
  const source = new ReadableStream({
    start(controller) {
      controller.error(failure);
    },
  });
  await assert.rejects(validateUtf8Response(new Response(source)).text(), error => error === failure);
});

test('malformed chunks cancel upstream without reading an endless remainder', { timeout: 1500 }, async () => {
  const cancelled = deferred();
  let pulls = 0;
  const source = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(Uint8Array.of(0x80));
    },
    cancel(reason) {
      cancelled.resolve(reason);
    },
  });
  await assert.rejects(validateUtf8Response(new Response(source)).text(), TypeError);
  assert.ok((await cancelled.promise) instanceof TypeError);
  assert.ok(pulls < 5, `unexpected continued consumption: ${pulls}`);
});

test('an unread response applies backpressure instead of draining an infinite source', {
  timeout: 1500,
}, async () => {
  let pulls = 0;
  const cancelled = deferred();
  const source = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(Buffer.from('data: {}\n\n'));
    },
    cancel(reason) {
      cancelled.resolve(reason);
    },
  });
  const checked = validateUtf8Response(new Response(source));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(pulls < 5, `unread adapter drained ${pulls} chunks`);
  const reason = new Error('unused response');
  await checked.body.cancel(reason);
  assert.equal(await cancelled.promise, reason);
});
