/** Real harmless JSON-lines peers; execution-boundary tests, not native qualification. */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { browserSession } from '../evals/browser-session.js';

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
function peer(t, source, timeoutMs = 1000) {
  const dir = mkdtempSync(join(tmpdir(), 'webmcp-request-boundary-'));
  const path = join(dir, 'peer.mjs');
  writeFileSync(path, source);
  const session = browserSession(`${quote(process.execPath)} ${quote(path)}`, timeoutMs, {
    closeGraceMs: 20,
  });
  t.after(async () => {
    await session.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return session;
}
const echo = `import { createInterface } from 'node:readline'; let count = 0;
for await (const line of createInterface({ input: process.stdin })) console.log(JSON.stringify({ count: ++count, line }));`;

for (const prefix of ['{', '{"forged":', '{"nested":{"value":']) {
  test(`unsolicited partial reply cannot borrow the next request: ${prefix}`, { timeout: 5000 }, async t => {
    const suffix = prefix === '{' ? '"forged":true}' : prefix.includes('nested') ? 'true}}' : 'true}';
    const session = peer(
      t,
      `import { createInterface } from 'node:readline'; let count = 0;
      for await (const line of createInterface({ input: process.stdin })) {
        process.stdout.write(++count === 1 ? ${JSON.stringify(`{"first":true}\n${prefix}`)} : ${JSON.stringify(`${suffix}\n`)});
      }`,
    );
    assert.deepEqual(await session.request({ first: true }), { first: true });
    await assert.rejects(session.request({ second: true }), /unavailable|unsolicited/);
  });
}
for (const elapsed of [1000, 1001]) {
  test(`serialization consumed ${elapsed}ms: no browser action is dispatched and the session stays reusable`, {
    timeout: 5000,
  }, async t => {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const session = peer(t, echo);
    await assert.rejects(
      session.request({
        toJSON() {
          clock += elapsed;
          return { late: true };
        },
      }),
      /timed out|deadline/,
    );
    assert.equal(session.state, 'open', 'local expiry before dispatch is not an ambiguous browser action');
    assert.deepEqual(await session.request({ healthy: true }), { count: 1, line: '{"healthy":true}' });
  });
  test(`response at elapsed ${elapsed}ms cannot beat a delayed timeout callback`, {
    timeout: 5000,
  }, async t => {
    let clock = 0;
    t.mock.method(performance, 'now', () => clock);
    const session = peer(t, echo);
    const pending = session.request({ first: true });
    clock += elapsed;
    await assert.rejects(pending, /timed out|deadline/);
    await assert.rejects(session.request({ next: true }), /unavailable|closed/);
  });
}

test('ordinary reply fragments within one pending request still form one valid observation', {
  timeout: 5000,
}, async t => {
  const session = peer(
    t,
    `import { createInterface } from 'node:readline';
    for await (const line of createInterface({ input: process.stdin })) {
      process.stdout.write('{"value":');
      await new Promise(resolve => setTimeout(resolve, 5));
      process.stdout.write('"ελληνικά"}\\n');
    }`,
  );
  assert.deepEqual(await session.request({}), { value: 'ελληνικά' });
  assert.deepEqual(await session.request({}), { value: 'ελληνικά' });
});
