import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { browserSession } from '../evals/browser-session.js';

/* Audit pass 8, F03. Every peer here is a harmless local Node program; nothing launches a browser. */

const dir = mkdtempSync(join(tmpdir(), 'webmcp-session-'));
const started = [];
after(() => {
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
});

const script = (name, source) => {
  const path = join(dir, name);
  writeFileSync(path, source);
  return path;
};
const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const waitForPid = async path => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const pid = Number(readFileSync(path, 'utf8'));
      if (pid > 0) {
        started.push(pid);
        return pid;
      }
    } catch {}
    await delay(10);
  }
  throw new Error('peer never started');
};

/* `; true` keeps the shell alive around the peer, so the peer is a grandchild, not the shell. */
const retained = path => `node ${path} ; true`;

test('a timeout terminates the whole process tree, not only the shell', async () => {
  const pidFile = join(dir, 'silent.pid');
  const peer = script(
    'silent.mjs',
    `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
  );
  const session = browserSession(retained(peer), 300, { closeGraceMs: 200 });
  const request = session.request({ calls: [] });
  const pid = await waitForPid(pidFile);
  await assert.rejects(request, /timed out after 300ms; the action may have run and is not retried/u);
  await session.close();
  assert.equal(alive(pid), false);
});

test('a descendant that ignores SIGTERM is killed after the grace period', async () => {
  const pidFile = join(dir, 'stubborn.pid');
  const peer = script(
    'stubborn.mjs',
    `import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {}); writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
  );
  const session = browserSession(retained(peer), 200, { closeGraceMs: 150 });
  const request = session.request({});
  const pid = await waitForPid(pidFile);
  await assert.rejects(request, /timed out/u);
  await session.close();
  assert.equal(alive(pid), false);
});

test('close is idempotent, awaitable, and ends a peer that exits on EOF without signals', async () => {
  const peer = script(
    'echo.mjs',
    `import { createInterface } from 'node:readline'; let n = 0; for await (const line of createInterface({ input: process.stdin })) console.log(JSON.stringify({ n: ++n, line: JSON.parse(line) }));`,
  );
  const session = browserSession(retained(peer), 2000);
  assert.deepEqual(await session.request({ a: 1 }), { n: 1, line: { a: 1 } });
  assert.equal((await session.request({})).n, 2);
  const first = session.close();
  const second = session.close();
  await Promise.all([first, second]);
  assert.equal(session.state, 'closed');
  /* A request after close rejects normally: no ERR_STREAM_WRITE_AFTER_END reaches the caller. */
  await assert.rejects(session.request({}), /browser session is closed/u);
});

test('a malformed reply poisons the session instead of leaving a usable one behind', async () => {
  const peer = script(
    'garbage.mjs',
    `import { createInterface } from 'node:readline'; for await (const line of createInterface({ input: process.stdin })) console.log('not json');`,
  );
  const session = browserSession(retained(peer), 2000, { closeGraceMs: 200 });
  await assert.rejects(session.request({}), /invalid browser reply/u);
  await assert.rejects(session.request({}), /unavailable: invalid browser reply/u);
  await session.close();
});

test('an oversized frame and an unsolicited reply each poison the session', async () => {
  const flood = script('flood.mjs', `process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000);`);
  const flooded = browserSession(retained(flood), 2000, { closeGraceMs: 200, maxFrameBytes: 1024 });
  await delay(100);
  await assert.rejects(flooded.request({}), /unavailable: browser reply exceeded 1024 bytes/u);
  await flooded.close();

  const chatty = script('chatty.mjs', `console.log('{}'); setInterval(() => {}, 1000);`);
  const unsolicited = browserSession(retained(chatty), 2000, { closeGraceMs: 200 });
  await delay(150);
  await assert.rejects(unsolicited.request({}), /unavailable: unsolicited browser reply/u);
  await unsolicited.close();
});

test('an unexpected exit rejects the pending action with a bounded stderr tail', async () => {
  const peer = script('crash.mjs', `process.stderr.write('chrome failed to start'); process.exit(3);`);
  const session = browserSession(`node ${peer}`, 2000, { closeGraceMs: 200 });
  await assert.rejects(
    session.request({}),
    /browser session (exited|input failed).*chrome failed to start/su,
  );
  await session.close();
});

/* Audit pass 9, P9-F03. The cap used to be compared only against the
 * unterminated tail, so a reply carrying its newline in the final fragment was
 * concatenated and JSON-parsed before its size was ever checked: the same bytes
 * got a different verdict depending on how the OS divided them into chunks. */
const replyOfFrameBytes = bytes => {
  const head = '{"ok":true,"pad":"';
  const tail = '"}';
  const pad = bytes - head.length - tail.length;
  assert.ok(pad >= 0, 'frame budget must fit the envelope');
  return `${head}${'x'.repeat(pad)}${tail}`;
};

/* Writes each chunk after a real (async) delay and then exits, so a failed
 * expectation cannot leave a live peer holding the runner open. */
const echoingPeer = (name, chunks) =>
  script(
    name,
    `const chunks = ${JSON.stringify(chunks)};
     process.stdin.once('data', async () => {
       for (const [text, delayMs] of chunks) {
         if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
         await new Promise(resolve => process.stdout.write(text, resolve));
       }
       process.exit(0);
     });`,
  );

/* Every assertion closes its session: a failed expectation must not leave a live
 * peer behind, or the runner hangs instead of reporting the failure. */
const withSession = async (peer, run) => {
  const session = browserSession(retained(peer), 2000, { closeGraceMs: 200, maxFrameBytes: 128 });
  try {
    return await run(session);
  } finally {
    await session.close();
  }
};

test('an oversized reply is rejected when its newline arrives in the same fragment', async () => {
  const peer = echoingPeer('newline-oversized.mjs', [[`${replyOfFrameBytes(129)}\n`, 0]]);
  await withSession(peer, session => assert.rejects(session.request({}), /exceeded 128 bytes/u));
});

test('an oversized reply is rejected when its bytes arrive in under-cap chunks', async () => {
  const frame = replyOfFrameBytes(200);
  const peer = echoingPeer('split-oversized.mjs', [
    [frame.slice(0, 100), 0],
    [`${frame.slice(100)}\n`, 30],
  ]);
  await withSession(peer, session => assert.rejects(session.request({}), /exceeded 128 bytes/u));
});

test('a reply of exactly the cap is still accepted', async () => {
  const frame = replyOfFrameBytes(128);
  assert.equal(Buffer.byteLength(frame), 128);
  const peer = echoingPeer('exact-limit.mjs', [[`${frame}\n`, 0]]);
  await withSession(peer, async session => {
    assert.deepEqual(await session.request({}), { ok: true, pad: 'x'.repeat(108) });
  });
});

test('one byte over the cap is rejected, even with a multi-byte character split across chunks', async () => {
  const envelope = '{"ok":true,"pad":"';
  const head = `${envelope}α`; // two-byte character placed on the split
  const frame = `${head}${'x'.repeat(129 - Buffer.byteLength(head) - 2)}"}`;
  assert.equal(Buffer.byteLength(frame), 129);
  const headBytes = Buffer.from(frame, 'utf8');
  const cut = Buffer.byteLength(envelope) + 1; // one byte into the two-byte character
  const peer = echoingPeer('split-utf8-oversized.mjs', [
    [headBytes.subarray(0, cut).toString('latin1'), 0],
    [`${headBytes.subarray(cut).toString('latin1')}\n`, 30],
  ]);
  await withSession(peer, session => assert.rejects(session.request({}), /exceeded 128 bytes/u));
});
