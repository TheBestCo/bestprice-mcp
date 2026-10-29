import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const readJson = path => JSON.parse(read(path));
const pngSize = path => {
  const bytes = readFileSync(new URL(path, root));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

const identity = readJson('distribution/identity.json');
const ENDPOINT = 'https://mcp.bestprice.gr/mcp';

describe('Microsoft 365 Copilot package', () => {
  it('points a no-auth declarative agent at the public endpoint', () => {
    const app = readJson('distribution/microsoft-copilot/manifest.json');
    const agent = readJson('distribution/microsoft-copilot/declarativeAgent.json');
    const plugin = readJson('distribution/microsoft-copilot/ai-plugin.json');
    assert.equal(app.version, readJson('package.json').version);
    assert.equal(app.developer.privacyUrl, identity.privacy);
    assert.equal(app.developer.termsOfUseUrl, identity.terms);
    assert.equal(app.icons.color, 'color.png');
    assert.equal(app.icons.outline, 'outline.png');
    assert.ok(app.description.short.length <= 80);
    assert.ok(app.name.short.length <= 30);
    assert.equal(app.copilotAgents.declarativeAgents[0].file, 'declarativeAgent.json');
    assert.equal(agent.actions[0].file, 'ai-plugin.json');
    assert.equal(plugin.schema_version, 'v2.4');
    assert.ok(plugin.name_for_human.length <= 20);
    assert.ok(plugin.description_for_human.length <= 100);
    assert.equal(plugin.runtimes[0].type, 'RemoteMCPServer');
    assert.deepEqual(plugin.runtimes[0].auth, { type: 'None' });
    assert.equal(plugin.runtimes[0].spec.url, ENDPOINT);
    assert.deepEqual(plugin.runtimes[0].run_for_functions, identity.tools);
    const tools = plugin.runtimes[0].spec.mcp_tool_description.tools;
    assert.deepEqual(
      tools.map(tool => tool.name),
      identity.tools,
    );
    for (const tool of tools) {
      assert.equal(tool.annotations.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations.destructiveHint, false, tool.name);
      assert.equal(tool.annotations.openWorldHint, true, tool.name);
      assert.equal(tool.inputSchema.type, 'object', tool.name);
    }
    assert.deepEqual(pngSize('distribution/microsoft-copilot/color.png'), [192, 192]);
    assert.deepEqual(pngSize('distribution/microsoft-copilot/outline.png'), [32, 32]);
    const guide = read('distribution/microsoft-copilot/README.md');
    assert.match(guide, /Partner Center/u);
    assert.match(guide, /bestprice-shopping\.zip/u);
    assert.match(guide, new RegExp(ENDPOINT.replaceAll('.', '\\.'), 'u'));
  });
});

describe('connector copy', () => {
  it('gives every requested client the keyless endpoint', () => {
    const guide = read('docs/connect.md');
    assert.match(read('README.md'), /docs\/connect\.md/u);
    for (const heading of [
      'Perplexity',
      'Claude',
      'ChatGPT developer mode',
      'Gemini CLI',
      'Copilot',
      'Grok Bot',
      'Cursor',
    ]) {
      assert.match(guide, new RegExp(`## ${heading}`, 'u'), heading);
    }
    assert.match(guide, /Pro, Max, and Enterprise/u);
    const matches = guide.match(/https:\/\/mcp\.bestprice\.gr\/mcp/gu) ?? [];
    assert.ok(matches.length >= 7);
    assert.match(guide, /No API key/u);
  });
});
