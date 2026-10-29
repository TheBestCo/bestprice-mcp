import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const SKILL_URL = 'https://github.com/TheBestCo/bestprice-mcp/blob/main/skills/bestprice-shopping/SKILL.md';

describe('external catalog contribution payloads', () => {
  it('pins a valid GitHub Agent Finder Skill entry to the canonical Skill', () => {
    const entry = JSON.parse(read('distribution/agentfinder/bestprice-shopping.json'));
    assert.equal(entry.identifier, 'urn:ai:github.com:TheBestCo:bestprice-mcp:bestprice-shopping');
    assert.equal(entry.displayName, 'BestPrice Shopping');
    assert.equal(entry.mediaType, 'application/ai-skill');
    assert.equal(entry.url, SKILL_URL);
    assert.equal(entry.metadata.sourceSet, 'TheBestCo/bestprice-mcp');
    assert.equal(entry.metadata.repoPath, 'skills/bestprice-shopping/SKILL.md');
    for (const tag of [
      'shopping',
      'e-commerce',
      'product-recommendations',
      'price-comparison',
      'delivered-price',
      'greece',
    ]) {
      assert.ok(entry.tags.includes(tag), tag);
    }
    assert.match(entry.description, /Greece/u);
    assert.match(entry.description, /delivered totals/u);
  });

  it('pins a valid Cline Marketplace remote MCP entry to the public endpoint', () => {
    const entry = JSON.parse(read('distribution/cline/bestprice-shopping/entry.json'));
    assert.equal(entry.$schema, '../../../schemas/mcp.schema.json');
    assert.equal(entry.id, 'bestprice-shopping');
    assert.equal(entry.type, 'mcp');
    assert.equal(entry.name, 'BestPrice Shopping');
    assert.deepEqual(entry.tags, ['business', 'research']);
    assert.equal(entry.license, 'Apache-2.0');
    assert.equal(entry.verified, false);
    assert.equal(entry.featured, false);
    assert.equal(entry.repo, 'https://github.com/TheBestCo/bestprice-mcp');
    assert.equal(entry.homepage, 'https://www.bestprice.gr/mcp');
    assert.deepEqual(entry.install, {
      args: ['bestprice-shopping', '--transport', 'http', ENDPOINT],
    });
    assert.match(entry.description, /shopping decisions/u);
    assert.match(entry.description, /delivered totals/u);
    assert.match(entry.description, /No BestPrice account or API key/u);
  });

  it('pins Docker remote-server metadata to the unauthenticated production endpoint', () => {
    const yaml = read('distribution/docker/bestprice-shopping/server.yaml');
    assert.match(yaml, /^name: bestprice-shopping$/mu);
    assert.match(yaml, /^type: remote$/mu);
    assert.match(yaml, /^ {2}category: ecommerce$/mu);
    assert.match(yaml, /^ {2}transport_type: streamable-http$/mu);
    assert.match(yaml, new RegExp(`^ {2}url: ${ENDPOINT.replaceAll('.', '\\.')}$`, 'mu'));
    assert.match(
      yaml,
      /^ {2}icon: https:\/\/raw\.githubusercontent\.com\/TheBestCo\/bestprice-mcp\/main\/assets\/bestprice-mcp-logo-1024\.png$/mu,
    );
    assert.doesNotMatch(yaml, /logo\.svg/u);
    assert.doesNotMatch(yaml, /^oauth:/mu);
    assert.doesNotMatch(yaml, /^dynamic:/mu);
    assert.deepEqual(JSON.parse(read('distribution/docker/bestprice-shopping/tools.json')), []);
    const documentation = read('distribution/docker/bestprice-shopping/readme.md');
    assert.match(documentation, /https:\/\/www\.bestprice\.gr\/mcp/u);
    assert.match(documentation, new RegExp(ENDPOINT.replaceAll('.', '\\.'), 'u'));
  });

  it('pins the agent-readable install guide to the same machine discovery surfaces', () => {
    const install = read('llms-install.md');
    assert.match(install, /https:\/\/www\.bestprice\.gr\/\.well-known\/ard\.json/u);
    assert.match(install, /https:\/\/www\.bestprice\.gr\/\.well-known\/ai-catalog\.json/u);
    assert.match(install, /skill:\/\/bestprice-shopping\/SKILL\.md/u);
    assert.match(install, /skills\/list/u);
    assert.match(install, /skills\/get/u);
    assert.match(install, /gr\.bestprice\/mcp/u);
  });

  it('states clearly that external contribution payloads are not accepted listings', () => {
    const guide = read('distribution/README.md');
    assert.match(guide, /does \*\*not\*\* mean the external catalog has accepted or published/u);
    assert.match(guide, /fork \+ pull request/u);
    assert.match(guide, /Smithery/u);
    assert.match(guide, /2026-10-31/u);
    assert.match(guide, /Glama/u);
    assert.match(guide, /#5228/u);
    assert.match(guide, /#4900/u);
    assert.match(guide, /#4798/u);
  });

  it('prepares a Grok Build catalog entry without pinning a commit that predates this tree', () => {
    const entry = JSON.parse(read('distribution/grok/marketplace-entry.json'));
    assert.equal(entry.name, 'bestprice-shopping');
    assert.equal(entry.license, 'Apache-2.0');
    assert.equal(entry.homepage, 'https://www.bestprice.gr/mcp');
    assert.deepEqual(entry.domains, ['www.bestprice.gr', 'mcp.bestprice.gr']);
    assert.equal(entry.source.source, 'url');
    assert.equal(entry.source.url, 'https://github.com/TheBestCo/bestprice-mcp.git');
    assert.equal(entry.version, JSON.parse(read('package.json')).version);
    assert.equal(entry.source.sha, undefined);
    assert.match(read('distribution/README.md'), /source\.sha/u);
    const card = JSON.parse(read('submission/site/mcp-server-card.template.json'));
    assert.equal(
      card.iconUrl,
      'https://raw.githubusercontent.com/TheBestCo/bestprice-mcp/main/assets/bestprice-mcp-logo-1024.png',
    );
    assert.equal(card.icons[0].mimeType, 'image/png');
    assert.doesNotMatch(JSON.stringify(card), /logo\.svg/u);
    const agentCard = JSON.parse(read('submission/a2a/agent-card.template.json'));
    assert.deepEqual(
      agentCard.skills.map(skill => skill.id),
      ['get-shopping-decision', 'search-products', 'compare-offers', 'get-price-history'],
    );
    assert.match(read('submission/a2a/README.md'), /404/u);
    const smithery = read('smithery.yaml');
    assert.match(smithery, /type: http/u);
    assert.match(smithery, new RegExp(ENDPOINT.replaceAll('.', '\\.'), 'u'));
    assert.doesNotMatch(smithery, /^upstream:/mu);
    assert.doesNotMatch(smithery, /stdio/u);
  });
});
