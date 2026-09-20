import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('offline npm package ships and executes the guarded input module', { timeout: 20000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bp-packed-input-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { stdout } = await run(
    'npm',
    [
      'pack',
      '--offline',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      dir,
      '--cache',
      path.join(dir, 'cache'),
    ],
    { cwd: ROOT, timeout: 10000, maxBuffer: 1024 * 1024 },
  );
  const [packed] = JSON.parse(stdout);
  assert.equal(packed.filename, path.basename(packed.filename));
  const files = new Set(packed.files.map(file => file.path));
  for (const required of ['stdio.mjs', 'src/bridge.js', 'src/utf8-response.js', 'src/utf8-input.js']) {
    assert.ok(files.has(required), `missing package dependency ${required}`);
  }
  assert.equal(
    [...files].some(file => /(^|\/)(?:\.env|\.git|test|artifacts)(\/|$)/u.test(file)),
    false,
  );
  await run('tar', ['-xzf', path.join(dir, packed.filename), '-C', dir], { timeout: 10000 });
  const shipped = await readFile(path.join(dir, 'package', 'src/utf8-input.js'));
  assert.deepEqual(shipped, await readFile(path.join(ROOT, 'src/utf8-input.js')));
  const { createUtf8Input, MAX_INPUT_FRAME_BYTES } = await import(
    pathToFileURL(path.join(dir, 'package/src/utf8-input.js')).href
  );
  assert.equal(MAX_INPUT_FRAME_BYTES, 8 * 1024 * 1024);
  const input = createUtf8Input({ maxFrameBytes: 8 });
  const output = [];
  input.on('data', chunk => output.push(chunk));
  const completed = finished(input);
  const valid = Buffer.from('€€\n€€\n');
  input.end(valid);
  await completed;
  assert.deepEqual(Buffer.concat(output), valid);
  const oversized = createUtf8Input({ maxFrameBytes: 8 });
  oversized.resume();
  const rejected = assert.rejects(finished(oversized), { code: 'ERR_MCP_STDIN_SIZE' });
  oversized.end(Buffer.from('123456789\n'));
  await rejected;
});
