import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseSkillFrontmatter } from '../scripts/validate-manifests.mjs';

const root = fileURLToPath(new URL('../submission/', import.meta.url));
const json = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

test('the next OpenAI package keeps the published identity and declares scoped mixed auth without credentials', () => {
  const current = json('openai/.codex-plugin/plugin.json');
  const next = json('openai-next/.codex-plugin/plugin.json');
  assert.equal(current.version, '1.2.0');
  assert.equal(next.version, '1.3.0');
  assert.ok([...next.interface.shortDescription].length <= 30);
  assert.ok([...next.extensions['com.openai'].publication.translations['el-GR'].subtitle].length <= 30);
  assert.equal(next.name, current.name);
  assert.equal(next.name, 'app-6a8d8ed6e2bc8191b3caaf7214f3c981');
  const servers = json('openai-next/.mcp.json').mcpServers;
  assert.equal(Object.keys(servers).length, 1);
  const [server] = Object.values(servers);
  assert.equal(server.url, 'https://mcp.bestprice.gr/mcp');
  assert.deepEqual(server.extensions['com.openai'].auth, {
    type: 'mixed',
    client: { mode: 'cimd' },
    baseScopes: ['events:subscribe'],
  });
  assert.doesNotMatch(
    JSON.stringify(servers),
    /clientSecret|access_token|refresh_token|gateway_secret|password/iu,
  );
  const skillPath = path.join(root, 'openai-next/skills/bestprice-shopping/SKILL.md');
  const skill = readFileSync(skillPath, 'utf8');
  assert.equal(parseSkillFrontmatter(skill, skillPath).name, 'bestprice-shopping');
  for (const boundary of [
    'comparisons:manage',
    'events:subscribe',
    'expected_version',
    'Unknown shipping',
    '180 days',
    'not the image',
  ])
    assert.ok(skill.includes(boundary), boundary);
  for (const asset of [next.interface.logo, ...next.interface.screenshots]) {
    const resolved = path.resolve(root, 'openai-next', asset);
    assert.ok(existsSync(resolved));
    assert.ok(realpathSync(resolved).startsWith(path.join(root, 'openai-next') + path.sep));
  }
});
