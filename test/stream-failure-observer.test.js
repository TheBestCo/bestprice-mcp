/** Failure signaling and byte identity; synthetic streams, not native task evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateUtf8Response } from '../src/utf8-response.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

for (const mode of ['invalid-byte', 'partial-eof', 'oversize', 'upstream']) {
  test(`reports ${mode} exactly once without replacing the source failure`, async () => {
    const expected = new Error('source failed');
    const response =
      mode === 'upstream'
        ? new Response(
            new ReadableStream({
              start(c) {
                c.error(expected);
              },
            }),
          )
        : new Response(
            mode === 'invalid-byte'
              ? Uint8Array.of(0x80)
              : mode === 'partial-eof'
                ? Uint8Array.of(0xe2, 0x82)
                : 'x'.repeat(17),
          );
    const events = [];
    const checked = validateUtf8Response(response, { maxBytes: 16, onFailure: error => events.push(error) });
    let received;
    await assert.rejects(checked.text(), error => {
      received = error;
      return true;
    });
    await tick();
    assert.equal(events.length, 1);
    assert.equal(events[0], received);
    if (mode === 'upstream') assert.equal(received, expected);
  });
}
for (const asynchronous of [false, true]) {
  test(`broken ${asynchronous ? 'async' : 'sync'} observers cannot mask a stream failure`, async () => {
    const checked = validateUtf8Response(new Response(Uint8Array.of(0x80)), {
      onFailure: () => {
        if (asynchronous) return Promise.reject(new Error('observer failed'));
        throw new Error('observer failed');
      },
    });
    await assert.rejects(checked.text(), TypeError);
    await tick();
  });
}
test('valid data remains byte-for-byte identical and reports no failure', async () => {
  const events = [];
  const bytes = Buffer.from('data: {"text":"ελληνικά € 😀"}\r\n\r\n');
  const checked = validateUtf8Response(
    new Response(bytes, { headers: { 'content-type': 'text/event-stream' } }),
    {
      onFailure: error => events.push(error),
    },
  );
  assert.deepEqual(Buffer.from(await checked.arrayBuffer()), bytes);
  await tick();
  assert.deepEqual(events, []);
});
for (const reason of [undefined, new Error('discarded')]) {
  // The SDK cancels every 202 body with no reason. Deterministic here, where the bridge
  // handshake only lost the race to this report from undici 7.12 (Node 24-26).
  test(`a consumer discarding the body (reason ${reason}) is not reported as a failure`, async () => {
    const events = [];
    let cancelled;
    const source = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.from('{}'));
      },
      cancel(value) {
        cancelled = value;
      },
    });
    const checked = validateUtf8Response(new Response(source), { onFailure: error => events.push(error) });
    await checked.body.cancel(reason);
    await tick();
    assert.deepEqual(events, []);
    assert.equal(cancelled, reason);
  });
}
test('validation error is signaled before a hanging upstream cancellation settles', async () => {
  const events = [];
  const source = new ReadableStream({
    start(c) {
      c.enqueue(Uint8Array.of(0x80));
    },
    cancel() {
      return new Promise(() => {});
    },
  });
  const checked = validateUtf8Response(new Response(source), { onFailure: error => events.push(error) });
  await assert.rejects(checked.text(), TypeError);
  await tick();
  assert.equal(events.length, 1);
});
