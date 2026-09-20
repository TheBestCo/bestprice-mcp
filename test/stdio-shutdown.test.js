import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));
// Test the actual entrypoint's shutdown while handshake startup never attaches a reader.
// Only dependency imports are substituted; this is not SDK or native-browser evidence.
const loader = `
const bridge = 'export function readConfig(){return {remoteUrl:"http://unused.invalid/mcp"}};'
  + 'export function createBridge(){let timer;return {'
  + 'start(){timer=setInterval(()=>{},1000);return new Promise(()=>{})},'
  + 'close(){clearInterval(timer);return Promise.resolve()}}}';
const transport = 'export class StdioServerTransport {}';
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/stdio.mjs')) {
    const text = specifier === './src/bridge.js' ? bridge :
      specifier === '@modelcontextprotocol/sdk/server/stdio.js' ? transport : null;
    if (text) return {url:'data:text/javascript,'+encodeURIComponent(text),shortCircuit:true};
  }
  return nextResolve(specifier, context);
}
`;

for (const [label, bytes, expectedCode] of [
  ['empty EOF', Buffer.alloc(0), 0],
  ['buffered valid EOF', Buffer.from('{"query":"Ελληνικά privacy-canary"}\n'), 0],
  ['buffered truncated EOF', Buffer.concat([Buffer.from('privacy-canary'), Buffer.from([0xe2, 0x82])]), 1],
  ['malformed bytes', Buffer.from([0xff]), 1],
]) {
  test(`stalled startup settles ${label} without waiting for the upstream`, { timeout: 10000 }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bp-stdio-startup-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const fixture = path.join(dir, 'loader.mjs');
    await writeFile(fixture, loader);
    const child = spawn(process.execPath, ['--no-warnings', '--loader', fixture, ENTRY], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', bytes => {
      stdout += bytes;
    });
    child.stderr.on('data', bytes => {
      stderr += bytes;
    });
    child.stdin.on('error', () => {});
    const closed = once(child, 'close');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    t.after(() => clearTimeout(timer));
    child.stdin.end(bytes);
    const [code, signal] = await closed;
    assert.equal(signal, null, 'stdio waited for an upstream reader after input was validated');
    assert.equal(code, expectedCode, stderr);
    assert.equal(stdout, '');
    assert.equal(stderr.includes('privacy-canary'), false);
    assert.match(
      stderr,
      expectedCode ? /Shutting down \(invalid stdin\)/u : /Shutting down \(stdin closed\)/u,
    );
  });
}
