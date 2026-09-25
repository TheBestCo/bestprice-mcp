import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const release = await readFile(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
const tagStep = release.match(
  /name: Check whether the tag exists[\s\S]*? {8}run: \|\n([\s\S]*?)(?=\n {6}-)/u,
);
assert.ok(tagStep, 'The release tag check must remain testable');
const tagCommand = tagStep[1].replace(/^ {10}/gmu, '');

for (const status of [0, 2, 1, 128, 129, 143]) {
  test(`actual release shell handles git lookup status ${status} without inventing absence`, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bp-tag-state-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const bin = path.join(directory, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'git'), '#!/bin/sh\nexit "$BP_TEST_GIT_STATUS"\n');
    await chmod(path.join(bin, 'git'), 0o755);
    const output = path.join(directory, 'output');
    await writeFile(output, '');
    let exitCode = 0;
    try {
      await run('/bin/bash', ['-e', '-o', 'pipefail', '-c', tagCommand], {
        env: {
          PATH: `${bin}:/usr/bin:/bin`,
          BP_TEST_GIT_STATUS: String(status),
          VERSION: '1.2.0',
          GITHUB_OUTPUT: output,
        },
        // This is a process-start watchdog, not a release latency assertion.
        // Contended runners can spend more than two seconds starting a shell.
        timeout: 10000,
      });
    } catch (error) {
      assert.equal(error.killed, false, 'Shell fixture exceeded its bounded watchdog');
      assert.equal(error.signal, null, 'Shell fixture ended by signal, not a git exit status');
      exitCode = error.code;
    }
    const result = await readFile(output, 'utf8');
    if (status === 0) {
      assert.equal(exitCode, 0);
      assert.equal(result, 'created=false\n');
    } else if (status === 2) {
      assert.equal(exitCode, 0);
      assert.equal(result, 'created=true\n');
    } else {
      assert.equal(exitCode, status);
      assert.equal(result, '');
    }
  });
}

test('release checks genuine history and both installed artifacts before tagging', () => {
  assert.match(release, /fetch-depth: 0/u);
  assert.match(release, /node-version: 20/u);
  assert.equal((release.match(/run: npm test/gu) ?? []).length, 2);
  assert.match(release, /run: npm run check/u);
  for (const version of [20, 22]) {
    const verify = release.indexOf(
      `run: node scripts/verify-packed-release.mjs "$RUNNER_TEMP/installed-package-node${version}"`,
    );
    assert.ok(verify > 0 && verify < release.indexOf('gh release create'));
  }
  assert.match(release, /cmp "\$RUNNER_TEMP\/installed-package-node20\//u);
  assert.match(
    release,
    /gh release create "v\$VERSION" \\\n {12}"\$RUNNER_TEMP\/installed-package-node22\/bestprice-mcp-\$VERSION.tgz"/u,
  );
});

test('single-job CI still verifies the isolated package without weakening test gates', async () => {
  const ci = await readFile(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  // One billed job on the .nvmrc Node; Release covers Node 20 and 22 on version bumps.
  assert.match(ci, /node-version-file: \.nvmrc/u);
  assert.doesNotMatch(ci, /matrix:/u);
  assert.match(ci, /run: npm run check/u);
  assert.ok(ci.indexOf('run: npm run check') < ci.indexOf('run: npm test'));
  assert.ok(ci.indexOf('run: npm test') < ci.indexOf('run: node scripts/verify-packed-release.mjs'));
  assert.match(ci, /run: node scripts\/verify-packed-release.mjs/u);
  assert.match(ci, /run: \.\/mcp-publisher validate server.json/u);
  assert.doesNotMatch(ci, /continue-on-error: true/u);
  // Superseded runs are cancelled instead of billed to completion.
  assert.match(ci, /cancel-in-progress: true/u);
  assert.match(ci, /name: installed-package-\$\{\{ github.run_id \}\}/u);
});

test('CI also tests the current Node line, whose stream timing the .nvmrc Node cannot show', async () => {
  const ci = await readFile(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const job = ci.slice(ci.indexOf('\n  current-node:'));
  assert.ok(job.length > 1, 'The current-Node job must remain');
  assert.match(job, /node-version: 26\n/u);
  assert.ok(job.indexOf('run: npm ci') < job.indexOf('run: npm test'));
});

test('failed verifier writes a negative receipt and cannot overwrite it on retry', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bp-negative-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin');
  await mkdir(bin);
  await writeFile(path.join(bin, 'git'), '#!/bin/sh\necho PRIVATE_GIT_CANARY >&2\nexit 128\n');
  await chmod(path.join(bin, 'git'), 0o755);
  const destination = path.join(directory, 'receipt');
  const args = [path.join(ROOT, 'scripts/verify-packed-release.mjs'), destination];
  const options = { env: { PATH: `${bin}:/usr/bin:/bin` }, timeout: 5000 };
  await assert.rejects(run(process.execPath, args, options), error => {
    assert.equal(error.code, 1);
    assert.equal(`${error.stdout}${error.stderr}`.includes('PRIVATE_GIT_CANARY'), false);
    return true;
  });
  const receipt = await readFile(path.join(destination, 'receipt.json'));
  assert.equal(JSON.parse(receipt).ok, false);
  assert.equal(JSON.parse(receipt).failedStage, 'source');
  assert.equal(JSON.parse(receipt).qualification, false);
  await assert.rejects(run(process.execPath, args, options));
  assert.deepEqual(await readFile(path.join(destination, 'receipt.json')), receipt);
});
