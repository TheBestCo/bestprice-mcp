import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  isWithin,
  parseTestSummary,
  runtimePaths,
  validatePack,
  verifyRuntimeFiles,
} from '../scripts/verify-packed-release.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const paths = ['package.json', 'stdio.mjs', 'src/bridge.js', 'src/utf8-input.js', 'src/utf8-response.js'];
const manifest = { name: 'bestprice-mcp', version: '1.2.0' };
const pack = () => [{
  name: 'bestprice-mcp', version: '1.2.0', filename: 'bestprice-mcp-1.2.0.tgz',
  files: [...paths, 'LICENSE', 'README.md'].map(file => ({ path: file })),
}];
const summary = '# tests 63\n# pass 63\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('the packed file contract accepts exactly the runtime and public documentation', () => {
  const value = pack();
  assert.equal(validatePack(value, manifest, paths), value[0]);
});

for (const [label, corrupt] of [
  ['missing validator', p => { p[0].files = p[0].files.filter(f => f.path !== 'src/utf8-input.js'); }],
  ['checkout-only bridge', p => { p[0].files = p[0].files.filter(f => f.path !== 'src/bridge.js'); }],
  ['duplicate entry', p => { p[0].files.push(p[0].files[0]); }],
  ['secret file', p => { p[0].files.push({ path: '.env' }); }],
  ['nested secret', p => { p[0].files.push({ path: 'src/.env' }); }],
  ['test support shipped', p => { p[0].files.push({ path: 'test/helpers/fake-remote.js' }); }],
  ['path escape', p => { p[0].files.push({ path: '../stdio.mjs' }); }],
  ['absolute path', p => { p[0].files.push({ path: '/tmp/stdio.mjs' }); }],
  ['wrong package', p => { p[0].name = 'other'; }],
  ['wrong version', p => { p[0].version = '0.0.0'; }],
  ['tarball escape', p => { p[0].filename = '../bestprice-mcp-1.2.0.tgz'; }],
  ['missing inventory', p => { delete p[0].files; }],
  ['two tarballs', p => { p.push(p[0]); }],
  ['no tarball', p => { p.length = 0; }],
]) {
  test(`package contract rejects ${label}`, () => {
    const value = pack();
    corrupt(value);
    assert.throws(() => validatePack(value, manifest, paths));
  });
}

test('only a complete positive zero-skip TAP summary certifies installed tests', () => {
  assert.deepEqual(parseTestSummary(summary), { tests: 63, pass: 63, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
});
for (const key of ['fail', 'cancelled', 'skipped', 'todo']) {
  test(`a nonzero ${key} cannot produce an installed pass`, () => {
    assert.throws(() => parseTestSummary(summary.replace(`# ${key} 0`, `# ${key} 1`)));
  });
}
for (const [label, value] of [
  ['empty', ''],
  ['too few tests', summary.replaceAll('63', '62')],
  ['wrong pass count', summary.replace('# pass 63', '# pass 62')],
  ['duplicate summary', summary + summary],
  ['partial summary', summary.replace('# skipped 0\n', '')],
]) {
  test(`rejects ${label} test evidence`, () => assert.throws(() => parseTestSummary(value)));
}

test('isolation boundary does not confuse a sibling with a child or use string prefixes', () => {
  assert.equal(isWithin('/tmp/package', '/tmp/package/src/bridge.js'), true);
  assert.equal(isWithin('/tmp/package', '/tmp/package'), true);
  assert.equal(isWithin('/tmp/package', '/tmp/package-neighbor'), false);
  assert.equal(isWithin('/tmp/package', '/tmp/package/../outside'), false);
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'bp-packed-verifier-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source');
  const installed = path.join(directory, 'installed');
  for (const root of [source, installed]) {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/bridge.js'), 'export const safe = true;\n');
  }
  return { source, installed, directory };
}

test('runtime byte verification accepts unchanged bytes and detects a changed installed module', async t => {
  const { source, installed } = await fixture(t);
  const files = ['src/bridge.js'];
  const hashes = await verifyRuntimeFiles(source, installed, files);
  assert.match(hashes[files[0]], /^[a-f0-9]{64}$/u);
  await writeFile(path.join(installed, files[0]), 'export const safe = false;\n');
  await assert.rejects(verifyRuntimeFiles(source, installed, files));
});

test('an omitted module cannot be satisfied by a checkout file or symlink', async t => {
  const { source, installed } = await fixture(t);
  await rm(path.join(installed, 'src/bridge.js'));
  await assert.rejects(verifyRuntimeFiles(source, installed, ['src/bridge.js']));
  await symlink(path.join(source, 'src/bridge.js'), path.join(installed, 'src/bridge.js'));
  await assert.rejects(verifyRuntimeFiles(source, installed, ['src/bridge.js']));
});

test('runtime inventory refuses non-code and symlinked source entries', async t => {
  const { source } = await fixture(t);
  await writeFile(path.join(source, 'src/.env'), 'PRIVATE_CANARY');
  await assert.rejects(runtimePaths(source));
  await rm(path.join(source, 'src/.env'));
  await symlink('bridge.js', path.join(source, 'src/alias.js'));
  await assert.rejects(runtimePaths(source));
});

test('real offline npm tarball satisfies the complete installed-runtime inventory contract', { timeout: 15000 }, async t => {
  const { directory } = await fixture(t);
  const { stdout } = await run('npm', [
    'pack', '--offline', '--ignore-scripts', '--json', '--pack-destination', directory,
    '--cache', path.join(directory, 'cache'),
  ], { cwd: ROOT, timeout: 10000, maxBuffer: 1024 * 1024 });
  const metadata = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  validatePack(JSON.parse(stdout), metadata, await runtimePaths(ROOT));
});
