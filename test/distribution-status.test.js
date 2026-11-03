import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TOOL_NAMES as WEBMCP_TOOL_NAMES } from '../webmcp/src/contracts.js';

const root = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const pkg = readJson('package.json');
const registry = readJson('server.json');
const status = readJson('distribution/status.json');

const EXPECTED_TOOLS = [
  'get_shopping_decision',
  'search_products',
  'compare_offers',
  'get_price_history',
  'optimize_basket',
  'check_deal',
];
const SKILL_URL = 'https://github.com/TheBestCo/bestprice-mcp/blob/main/skills/bestprice-shopping/SKILL.md';
const STATES = new Set(['published', 'submitted', 'prepared', 'missing', 'external-gate']);
const NEXT_ACTION_BY = new Set(['us-here', 'us-external-login', 'upstream', 'none']);

describe('distribution status ledger', () => {
  it('derives its canonical facts from the shipped package, server, Skill, and WebMCP contract', () => {
    assert.equal(status.schemaVersion, 2);
    assert.match(status.asOf, /^\d{4}-\d{2}-\d{2}$/u);
    assert.equal(status.canonical.registryId, registry.name);
    assert.equal(status.canonical.serverVersion, registry.version);
    assert.equal(status.canonical.packageVersion, pkg.version);
    assert.equal(status.canonical.endpoint, registry.remotes[0].url);
    assert.deepEqual(status.canonical.tools, EXPECTED_TOOLS);
    assert.equal(status.canonical.skill, SKILL_URL);
    assert.equal(status.canonical.webmcpContractToolCount, WEBMCP_TOOL_NAMES.length);
    assert.equal(WEBMCP_TOOL_NAMES.length, 22);
  });

  it('keeps one unambiguous state per distribution surface', () => {
    assert.ok(status.surfaces.length >= 25, 'ledger should cover the audited distribution matrix');
    const ids = status.surfaces.map(surface => surface.id);
    assert.equal(new Set(ids).size, ids.length, 'surface ids must be unique');

    for (const surface of status.surfaces) {
      assert.ok(STATES.has(surface.state), `${surface.id}: unknown state ${surface.state}`);
      assert.equal(typeof surface.freshness, 'string', `${surface.id}: freshness`);
      assert.ok(surface.freshness.length > 0, `${surface.id}: empty freshness`);
      assert.match(surface.url, /^https:\/\//u, `${surface.id}: public URL`);
      assert.equal(typeof surface.note, 'string', `${surface.id}: note`);
      assert.ok(surface.note.length > 0, `${surface.id}: empty note`);
      assert.ok(surface.verifiedAt <= status.asOf, `${surface.id}: verifiedAt after asOf`);
      assert.match(surface.verifiedAt, /^\d{4}-\d{2}-\d{2}$/u, `${surface.id}: verifiedAt`);
      assert.ok(surface.evidence?.length > 0, `${surface.id}: evidence`);
      assert.ok(surface.nextAction?.length > 0, `${surface.id}: nextAction`);
      assert.ok(
        NEXT_ACTION_BY.has(surface.nextActionBy),
        `${surface.id}: unknown nextActionBy ${surface.nextActionBy}`,
      );
    }
  });

  it('does not mistake open reviews or external gates for published listings', () => {
    const byId = new Map(status.surfaces.map(surface => [surface.id, surface]));
    for (const id of ['smithery']) {
      assert.equal(byId.get(id)?.state, 'external-gate', id);
      assert.match(byId.get(id).evidence, /bounced/u);
      assert.match(byId.get(id).evidence, /2026-10-31/u);
    }
    const grok = byId.get('grok-plugin-marketplace');
    assert.ok(grok, 'grok-plugin-marketplace');
    assert.equal(grok.state, 'prepared');
    assert.match(grok.nextAction, /source\.sha/u);
    assert.equal(Object.hasOwn(grok, 'source'), false);
    for (const id of [
      'official-mcp-registry',
      'openai',
      'mcp-harbor',
      'cursor-directory',
      'gemini-gallery',
      'lobehub',
    ]) {
      assert.equal(byId.get(id)?.state, 'published', id);
    }
    const chatgpt = byId.get('openai');
    assert.equal(chatgpt.url, 'https://chatgpt.com/plugins/plugin_asdk_app_6ad82ceb86108191ac9cd6b08197aabd');
    assert.equal(chatgpt.verifiedAt, '2026-11-03');
    assert.match(chatgpt.evidence, /approved and published/iu);
    assert.match(chatgpt.evidence, /asdk_app_6ad82ceb86108191ac9cd6b08197aabd/u);
    assert.match(chatgpt.evidence, /Display name BestPrice/u);
    assert.match(chatgpt.nextAction, /clean-account discovery/u);
    assert.doesNotMatch(chatgpt.evidence, /In review|temporarily unavailable|endors/iu);
    for (const id of ['claude', 'docker', 'agentfinder', 'kilo', 'cline']) {
      assert.equal(byId.get(id)?.state, 'submitted', id);
    }
    for (const surface of status.surfaces.filter(s => s.state !== 'published')) {
      assert.notEqual(
        surface.nextActionBy,
        'none',
        `${surface.id}: an unpublished surface needs a next action`,
      );
    }
  });
});
