import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../submission/openai-next/', import.meta.url));
const manifest = JSON.parse(await readFile(`${root}.codex-plugin/plugin.json`, 'utf8'));
if (manifest.version !== '1.3.0') throw new Error('Review the release version before packaging.');
const files = [
  '.codex-plugin/plugin.json',
  '.mcp.json',
  'skills/bestprice-shopping/SKILL.md',
  'assets/bestprice-logo.png',
  'assets/native-home.jpg',
  'assets/native-offers.jpg',
  'assets/native-history.png',
];
const hashes = {};
for (const file of files) {
  if (!(await lstat(root + file)).isFile()) throw new Error(`Package inputs must be ordinary files: ${file}`);
  hashes[file] = createHash('sha256')
    .update(await readFile(root + file))
    .digest('hex');
}
const archive = '/tmp/bestprice-plugin-1.3.0.zip';
await rm(archive, { force: true });
execFileSync('zip', ['-X', '-q', archive, ...files], { cwd: root });
const receipt = {
  version: manifest.version,
  app: manifest.name,
  status: 'prepared_not_submitted',
  archive,
  sha256: createHash('sha256')
    .update(await readFile(archive))
    .digest('hex'),
  files: hashes,
};
await writeFile('/tmp/bestprice-plugin-1.3.0-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
