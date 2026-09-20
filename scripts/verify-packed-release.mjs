#!/usr/bin/env node
/**
 * Prove the npm tarball works outside the checkout with the release's locked dependencies.
 * This is an installed-package diagnostic, not publication or shopper-task qualification.
 * npm ci must have warmed the cache first. No registry fallback or production requests.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TESTS = [
  'test/stdio.test.js',
  'test/stdio-utf8.test.js',
  'test/stdio-eof-sdk.test.js',
  'test/utf8-input.test.js',
  'test/utf8-input-bounds.test.js',
];
const SUPPORT = [...TESTS, 'test/helpers/fake-remote.js'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const childEnv = () => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: tmpdir(),
  NODE_PATH: '',
  NODE_OPTIONS: '',
});

export function isWithin(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export async function runtimePaths(root) {
  const paths = ['package.json', 'stdio.mjs'];
  const visit = async directory => {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const name = `${directory}/${entry.name}`;
      assert.ok(!entry.isSymbolicLink(), 'Runtime source must not contain symlinks');
      if (entry.isDirectory()) await visit(name);
      else {
        assert.ok(entry.isFile() && /\.(?:js|mjs|cjs)$/u.test(name), 'Unexpected runtime source file');
        paths.push(name);
      }
    }
  };
  await visit('src');
  return paths.sort();
}

export function validatePack(packs, manifest, runtime) {
  assert.ok(Array.isArray(packs) && packs.length === 1, 'Expected exactly one npm package');
  const packed = packs[0];
  assert.equal(manifest.name, 'bestprice-mcp');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assert.equal(packed.filename, `bestprice-mcp-${manifest.version}.tgz`);
  assert.ok(Array.isArray(packed.files), 'Missing package file inventory');
  const files = packed.files.map(file => file.path);
  assert.equal(new Set(files).size, files.length, 'Duplicate package paths');
  assert.deepEqual([...files].sort(), [...runtime, 'LICENSE', 'README.md'].sort());
  return packed;
}

export async function verifyRuntimeFiles(source, installed, paths) {
  const hashes = {};
  for (const name of paths) {
    assert.ok(!path.isAbsolute(name) && !name.split('/').includes('..'), 'Invalid runtime path');
    for (const root of [source, installed]) {
      assert.ok(
        isWithin(await realpath(root), await realpath(path.join(root, name))),
        'Runtime escaped root',
      );
      assert.ok((await lstat(path.join(root, name))).isFile(), 'Runtime is not a regular file');
    }
    const expected = await readFile(path.join(source, name));
    const actual = await readFile(path.join(installed, name));
    assert.ok(expected.equals(actual), `Installed bytes differ: ${name}`);
    hashes[name] = sha256(actual);
  }
  return hashes;
}

export function parseTestSummary(log) {
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...log.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`, 'gm'))];
    assert.equal(matches.length, 1, `Expected one ${key} summary`);
    counts[key] = Number(matches[0][1]);
  }
  assert.ok(counts.tests >= 63 && Number.isSafeInteger(counts.tests), 'Incomplete installed-package tests');
  assert.equal(counts.pass, counts.tests, 'Not every installed-package test passed');
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(counts[key], 0);
  return counts;
}

export async function verifyPackedRelease(output) {
  assert.ok(typeof output === 'string' && output.length > 0, 'An output directory is required');
  const root = await realpath(ROOT);
  const destination = path.resolve(output);
  assert.ok(!isWithin(root, destination), 'Output must be outside checkout');
  await mkdir(path.dirname(destination), { recursive: true });
  const parent = await realpath(path.dirname(destination));
  assert.ok(
    !isWithin(root, path.join(parent, path.basename(destination))),
    'Output must be outside checkout',
  );
  // Refuse to overwrite any prior receipt or package, including a symlinked directory.
  await mkdir(destination);
  const report = {
    schemaVersion: 1,
    purpose: 'installed-package-diagnostic',
    qualification: false,
    ok: false,
    startedAt: new Date().toISOString(),
  };
  let workspace;
  let stage = 'source';
  const execute = (command, args, cwd = root, timeout = 30000) =>
    run(command, args, { cwd, env: childEnv(), timeout, maxBuffer: 2 * 1024 * 1024 });
  try {
    const revision = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
    assert.match(revision, /^[a-f0-9]{40}$/u);
    await execute('git', ['diff', '--exit-code', 'HEAD', '--', '.']);
    report.revision = revision;
    report.nodeVersion = process.version;
    report.npmVersion = (await execute('npm', ['--version'])).stdout.trim();
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const lockBytes = await readFile(path.join(root, 'package-lock.json'));
    const lock = JSON.parse(lockBytes);
    assert.equal(lock.packages[''].version, manifest.version);
    report.lockSha256 = sha256(lockBytes);
    const runtime = await runtimePaths(root);
    const tracked = (await execute('git', ['ls-files', '--', 'package.json', 'stdio.mjs', 'src'])).stdout;
    assert.deepEqual(
      tracked.trim().split('\n').sort(),
      runtime,
      'Runtime inventory differs from tracked source',
    );
    await execute('git', ['ls-files', '--error-unmatch', '--', ...SUPPORT]);
    workspace = await mkdtemp(path.join(tmpdir(), 'bp-installed-release-'));
    stage = 'pack';
    const packResult = await execute('npm', [
      'pack',
      '--offline',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      destination,
    ]);
    const packed = validatePack(JSON.parse(packResult.stdout), manifest, runtime);
    const tarball = path.join(destination, packed.filename);
    const bytes = await readFile(tarball);
    assert.equal(packed.integrity, `sha512-${createHash('sha512').update(bytes).digest('base64')}`);
    report.package = {
      name: packed.name,
      version: packed.version,
      sha256: sha256(bytes),
      integrity: packed.integrity,
    };
    const names = (await execute('tar', ['-tzf', tarball])).stdout.trim().split('\n');
    assert.deepEqual(names.sort(), packed.files.map(file => `package/${file.path}`).sort());
    const types = (await execute('tar', ['-tvzf', tarball])).stdout.trim().split('\n');
    assert.ok(
      types.every(line => line.startsWith('-')),
      'Package must contain only regular files',
    );
    await execute('tar', ['-xzf', tarball, '-C', workspace]);
    const installed = path.join(workspace, 'package');
    report.runtimeSha256 = await verifyRuntimeFiles(root, installed, runtime);
    stage = 'locked-offline-install';
    // A package-lock is not published by npm pack. Supply the unchanged release lock for
    // this diagnostic explicitly; this is not a claim about arbitrary consumer resolution.
    await writeFile(path.join(installed, 'package-lock.json'), lockBytes, { flag: 'wx' });
    const cache = (await execute('npm', ['config', 'get', 'cache'])).stdout.trim();
    await execute(
      'npm',
      ['ci', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--cache', cache],
      installed,
      120000,
    );
    assert.ok(lockBytes.equals(await readFile(path.join(installed, 'package-lock.json'))), 'Lock changed');
    const require = createRequire(path.join(installed, 'stdio.mjs'));
    const sdk = await realpath(require.resolve('@modelcontextprotocol/sdk/server/stdio.js'));
    assert.ok(isWithin(path.join(installed, 'node_modules'), sdk), 'SDK resolved outside isolated install');
    const versions = {};
    for (const [name, entry] of Object.entries(lock.packages)) {
      if (!name || entry.dev) continue;
      const metadata = JSON.parse(await readFile(path.join(installed, name, 'package.json'), 'utf8'));
      assert.equal(metadata.version, entry.version, `Dependency drift: ${name}`);
      versions[name] = metadata.version;
    }
    report.dependencies = versions;
    stage = 'installed-tests';
    // Test support is copied only AFTER the tarball's complete inventory and runtime bytes
    // are checked. No loader, mock SDK, checkout node_modules or runtime replacements.
    report.testSupportSha256 = {};
    for (const name of SUPPORT) {
      await mkdir(path.dirname(path.join(installed, name)), { recursive: true });
      await copyFile(path.join(root, name), path.join(installed, name));
      report.testSupportSha256[name] = sha256(await readFile(path.join(installed, name)));
    }
    try {
      const tests = await execute(
        process.execPath,
        ['--test', '--test-reporter=tap', ...TESTS],
        installed,
        60000,
      );
      await writeFile(path.join(destination, 'tests.tap'), tests.stdout, { flag: 'wx' });
      report.tests = parseTestSummary(tests.stdout);
    } catch (error) {
      if (typeof error.stdout === 'string') {
        await writeFile(path.join(destination, 'failed-tests.tap'), error.stdout, { flag: 'wx' });
      }
      throw error;
    }
    assert.deepEqual(await verifyRuntimeFiles(root, installed, runtime), report.runtimeSha256);
    assert.ok(lockBytes.equals(await readFile(path.join(root, 'package-lock.json'))), 'Source lock changed');
    await execute('git', ['diff', '--exit-code', 'HEAD', '--', '.']);
    report.ok = true;
  } catch {
    // Do not serialize exception messages, npm configuration, credentials or remote bodies.
    report.failedStage = stage;
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    await writeFile(path.join(destination, 'receipt.json'), `${JSON.stringify(report, null, 2)}\n`, {
      flag: 'wx',
    });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await verifyPackedRelease(process.argv[2]);
    console.log(
      JSON.stringify({ ok: report.ok, stage: report.failedStage ?? 'complete', qualification: false }),
    );
    if (!report.ok) process.exitCode = 1;
  } catch {
    console.error('Installed package verification could not start safely.');
    process.exitCode = 1;
  }
}
