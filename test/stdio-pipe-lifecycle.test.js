import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));
// Exercise real OS pipes and the actual entrypoint; only SDK/bridge imports are replaced.
// Cleanup custody is recorded locally, not inferred from an exit status or a log message.
// This fixture is not MCP interoperability or native-browser evidence.
const fixtureBridge = `
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
export const readConfig = () => ({ remoteUrl: 'http://unused.invalid/mcp' });
export function createBridge({ log }) {
  let timer;
  return {
    async start(transport) {
      timer = setInterval(() => {}, 1000);
      const lines = createInterface({ input: transport.input });
      lines.on('line', line => {
        if (line === 'diagnostic') log('fixture diagnostic');
        if (line === 'ping') process.stdout.write('{"fixture":"pong"}\\n');
      });
      process.stdout.write('{"fixture":"ready"}\\n');
      return {};
    },
    close() {
      appendFileSync(process.env.BP_PIPE_CLEANUP, 'closed\\n');
      clearInterval(timer);
      return process.env.BP_PIPE_STALL === '1' ? new Promise(() => {}) : Promise.resolve();
    },
  };
}
`;
const loader = `
const bridge = ${JSON.stringify(fixtureBridge)};
const transport = 'export class StdioServerTransport { constructor(input) { this.input = input; } }';
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/stdio.mjs')) {
    const source = specifier === './src/bridge.js' ? bridge :
      specifier === '@modelcontextprotocol/sdk/server/stdio.js' ? transport : null;
    if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`;

async function start(t, { closeStderr = false, stall = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bp-stdio-pipes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = path.join(dir, 'loader.mjs');
  const cleanup = path.join(dir, 'cleanup.txt');
  await writeFile(fixture, loader);
  const child = spawn(process.execPath, ['--no-warnings', '--loader', fixture, ENTRY], {
    env: { ...process.env, BP_PIPE_CLEANUP: cleanup, BP_PIPE_STALL: stall ? '1' : '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 6000);
  t.after(() => {
    clearTimeout(watchdog);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  child.stdin.on('error', () => {});
  let stdout = '';
  let stderr = '';
  const waiters = new Set();
  const notify = () => {
    for (const check of waiters) check();
  };
  child.stdout.on('data', bytes => {
    stdout += bytes;
    notify();
  });
  child.stderr.on('data', bytes => {
    stderr += bytes;
  });
  child.on('exit', notify);
  if (closeStderr) child.stderr.destroy();
  const waitFor = value =>
    new Promise((resolve, reject) => {
      const check = () => {
        if (stdout.includes(value)) {
          waiters.delete(check);
          resolve();
        } else if (child.exitCode !== null || child.signalCode !== null) {
          waiters.delete(check);
          reject(new Error('Child exited before responding on the protocol pipe.'));
        }
      };
      waiters.add(check);
      check();
    });
  return {
    child,
    closed,
    waitFor,
    stdout: () => stdout,
    stderr: () => stderr,
    cleanup: () => readFile(cleanup, 'utf8'),
  };
}

for (const when of ['startup', 'after startup']) {
  test(`a closed diagnostic pipe ${when} does not kill the protocol`, { timeout: 10000 }, async t => {
    const f = await start(t, { closeStderr: when === 'startup' });
    await f.waitFor('ready');
    if (when !== 'startup') f.child.stderr.destroy();
    f.child.stdin.write('diagnostic\nping\n');
    await f.waitFor('pong');
    f.child.stdin.end();
    assert.deepEqual(await f.closed, [0, null]);
    assert.equal(await f.cleanup(), 'closed\n');
    assert.equal(f.stdout(), '{"fixture":"ready"}\n{"fixture":"pong"}\n');
  });
}

for (const closeStderr of [false, true]) {
  test(`a lost protocol pipe closes the bridge once (stderr closed=${closeStderr})`, {
    timeout: 10000,
  }, async t => {
    const f = await start(t, { closeStderr });
    await f.waitFor('ready');
    f.child.stdout.destroy();
    f.child.stdin.write('ping\n');
    assert.deepEqual(await f.closed, [1, null]);
    assert.equal(await f.cleanup(), 'closed\n');
    assert.doesNotMatch(f.stderr(), /Unhandled 'error' event|node:events|privacy-canary/u);
    if (!closeStderr) assert.match(f.stderr(), /Shutting down \(stdout error\)/u);
  });
}

test('broken stdout retains failure status even when cleanup never resolves', { timeout: 10000 }, async t => {
  const f = await start(t, { stall: true, closeStderr: true });
  await f.waitFor('ready');
  f.child.stdout.destroy();
  f.child.stdin.write('ping\n');
  assert.deepEqual(await f.closed, [1, null]);
  assert.equal(await f.cleanup(), 'closed\n');
});

test('healthy pipes retain ordinary EOF cleanup and diagnostics', { timeout: 10000 }, async t => {
  const f = await start(t);
  await f.waitFor('ready');
  f.child.stdin.write('ping\n');
  await f.waitFor('pong');
  f.child.stdin.end();
  assert.deepEqual(await f.closed, [0, null]);
  assert.equal(await f.cleanup(), 'closed\n');
  assert.match(f.stderr(), /Shutting down \(stdin closed\)/u);
  assert.doesNotMatch(f.stdout(), /Shutting down|Forwarding|fixture diagnostic/u);
});
