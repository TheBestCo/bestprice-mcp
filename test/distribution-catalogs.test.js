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
    assert.equal(entry.metadata.sourceSet, 'bestprice-mcp');
    assert.equal(entry.metadata.repoPath, 'skills/bestprice-shopping/SKILL.md');
    for (const tag of [
      'shopping',
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

  it('pins Docker remote-server metadata to the unauthenticated production endpoint', () => {
    const yaml = read('distribution/docker/bestprice-shopping/server.yaml');
    assert.match(yaml, /^name: bestprice-shopping$/mu);
    assert.match(yaml, /^type: remote$/mu);
    assert.match(yaml, /^ {2}category: ecommerce$/mu);
    assert.match(yaml, /^ {2}transport_type: streamable-http$/mu);
    assert.match(yaml, new RegExp(`^ {2}url: ${ENDPOINT.replaceAll('.', '\\.')}import assert from 'node:assert/strict';
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
    assert.equal(entry.metadata.sourceSet, 'bestprice-mcp');
    assert.equal(entry.metadata.repoPath, 'skills/bestprice-shopping/SKILL.md');
    for (const tag of [
      'shopping',
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

  it('pins Docker remote-server metadata to the unauthenticated production endpoint', () => {
    const yaml = read('distribution/docker/bestprice-shopping/server.yaml');
    assert.match(yaml, /^name: bestprice-shopping$/mu);
    assert.match(yaml, /^type: remote$/mu);
    assert.match(yaml, /^ {2}category: ecommerce$/mu);
    assert.match(yaml, /^ {2}transport_type: streamable-http$/mu);
    assert.match(yaml, , 'mu'));
    assert.doesNotMatch(yaml, /^oauth:/mu);
    assert.doesNotMatch(yaml, /^dynamic:/mu);
    assert.deepEqual(JSON.parse(read('distribution/docker/bestprice-shopping/tools.json')), []);
    const documentation = read('distribution/docker/bestprice-shopping/readme.md');
    assert.match(documentation, /https:\/\/www\.bestprice\.gr\/mcp/u);
    assert.match(documentation, new RegExp(ENDPOINT.replaceAll('.', '\\.'), 'u'));
  });

  it('states clearly that external contribution payloads are not accepted listings', () => {
    const guide = read('distribution/README.md');
    assert.match(guide, /does \*\*not\*\* mean the external catalog has accepted or published/u);
    assert.match(guide, /fork \+ pull request/u);
    assert.match(guide, /Smithery/u);
    assert.match(guide, /Glama/u);
  });
});
