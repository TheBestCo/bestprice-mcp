import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);
const bundle = 'distribution/antigravity/bestprice-shopping/';
const read = path => readFileSync(new URL(path, root), 'utf8');
const readJson = path => JSON.parse(read(path));

// Keys allowed by https://antigravity.google/schemas/v1/plugin.json (additionalProperties: false).
const SCHEMA_KEYS = new Set([
  '$schema',
  'name',
  'displayName',
  'description',
  'version',
  'disabled',
  'logo',
  'suggestedPrompts',
  'skills',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
  'extensions',
]);

describe('Antigravity plugin bundle', () => {
  const manifest = readJson(`${bundle}plugin.json`);

  it('has every field the Marketplace requires, within the published schema', () => {
    assert.equal(manifest.$schema, 'https://antigravity.google/schemas/v1/plugin.json');
    for (const key of Object.keys(manifest)) assert.ok(SCHEMA_KEYS.has(key), `schema rejects ${key}`);
    assert.equal(manifest.name, 'bestprice-shopping');
    assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/u);
    assert.equal(manifest.displayName, 'BestPrice');
    assert.equal(manifest.version, readJson('package.json').version);
    assert.ok(manifest.description.length >= 120 && manifest.description.length <= 160);
    assert.ok(manifest.suggestedPrompts.length > 0 && manifest.suggestedPrompts.length <= 3);
    assert.deepEqual(Object.keys(manifest.author).sort(), ['email', 'name', 'url']);
    assert.equal(manifest.author.name, 'BestPrice');
    assert.ok(manifest.author.url.startsWith('https://'));
    assert.equal(manifest.homepage, 'https://www.bestprice.gr/mcp');
    assert.equal(manifest.repository, 'https://github.com/TheBestCo/bestprice-mcp');
    assert.equal(manifest.license, 'Apache-2.0');
    for (const keyword of manifest.keywords) assert.equal(keyword, keyword.toLowerCase());
  });

  it('bundles the square logo byte for byte', () => {
    assert.equal(manifest.logo, 'assets/bestprice-mcp-logo-1024.png');
    const bundled = readFileSync(new URL(`${bundle}${manifest.logo}`, root));
    assert.ok(bundled.equals(readFileSync(new URL('assets/bestprice-mcp-logo-1024.png', root))));
  });

  it('connects only the keyless hosted endpoint', () => {
    const config = readJson(`${bundle}mcp_config.json`);
    assert.deepEqual(config, { mcpServers: { bestprice: { serverUrl: 'https://mcp.bestprice.gr/mcp' } } });
  });

  it('ships the canonical skill and a read-only rule', () => {
    assert.deepEqual(readdirSync(new URL(`${bundle}skills/`, root)), ['bestprice-shopping']);
    assert.equal(
      read(`${bundle}skills/bestprice-shopping/SKILL.md`),
      read('skills/bestprice-shopping/SKILL.md'),
    );
    const rule = read(`${bundle}rules/AGENTS.md`);
    assert.match(rule, /read-only/u);
    assert.match(rule, /price_from/u);
    assert.match(rule, /Never guess one/u);
    const readme = read(`${bundle}README.md`);
    assert.match(readme, /https:\/\/www\.bestprice\.gr\/policies\/privacy/u);
    for (const tool of ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history']) {
      assert.match(readme, new RegExp(tool, 'u'));
    }
  });
});
