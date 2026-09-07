/**
 * Consistency checks across every client manifest and public document in this repository.
 *
 * Two version axes exist on purpose: `server.json` carries the hosted server's version, while
 * `package.json` and every plugin or extension manifest carry this package's version.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const readJson = path => JSON.parse(read(path));

const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const HOMEPAGE = 'https://www.bestprice.gr/mcp';
const REPOSITORY = 'https://github.com/TheBestCo/bestprice-mcp';
const SERVER_NAME = 'bestprice-shopping';
const EXPECTED_TOOLS = ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'];
const SEMVER = /^\d+\.\d+\.\d+$/u;

const pkg = readJson('package.json');
const agentPlugin = readJson('plugin.json');
const agentMcp = readJson('mcp.json');
const claudeMcp = readJson('.mcp.json');
const codexPlugin = readJson('.codex-plugin/plugin.json');
const cursorPlugin = readJson('.cursor-plugin/plugin.json');
const geminiExtension = readJson('gemini-extension.json');
const qwenExtension = readJson('qwen-extension.json');
const registry = readJson('server.json');
const cases = readJson('test/fixtures/test-cases.json');

const readme = read('README.md');
const providerSetup = read('docs/provider-setup.md');
const security = read('SECURITY.md');
const contributing = read('CONTRIBUTING.md');
const changelog = read('CHANGELOG.md');

describe('package identity', () => {
  it('names the package after the repository with corporate authorship and a license', () => {
    assert.equal(pkg.name, 'bestprice-mcp');
    assert.equal(pkg.license, 'Apache-2.0');
    assert.equal(pkg.author.name, 'BestPrice');
    assert.equal(pkg.repository.url, `git+${REPOSITORY}.git`);
    assert.equal(pkg.homepage, HOMEPAGE);
    assert.match(pkg.engines.node, /^>=20/u);
    assert.match(pkg.version, SEMVER);
  });

  it('keeps every package manifest on the package version', () => {
    const versions = {
      'plugin.json': agentPlugin.version,
      '.codex-plugin/plugin.json': codexPlugin.version,
      '.cursor-plugin/plugin.json': cursorPlugin.version,
      'gemini-extension.json': geminiExtension.version,
      'qwen-extension.json': qwenExtension.version,
    };
    for (const [file, version] of Object.entries(versions)) assert.equal(version, pkg.version, file);
  });

  it('shares one description and one server name across the plugin manifests', () => {
    const description = agentPlugin.description;
    assert.ok(description.length <= 120 && description.startsWith('Read-only'));
    for (const manifest of [codexPlugin, cursorPlugin, geminiExtension, qwenExtension]) {
      assert.equal(manifest.description, description);
      assert.equal(manifest.name, SERVER_NAME);
    }
    assert.equal(agentPlugin.name, SERVER_NAME);
  });

  it('credits BestPrice, never an individual, in every manifest that names an author', () => {
    for (const manifest of [agentPlugin, codexPlugin, cursorPlugin]) {
      assert.equal(manifest.author.name, 'BestPrice');
      assert.match(manifest.author.url ?? manifest.author.email, /bestprice\.gr/u);
    }
    for (const file of [
      'plugin.json',
      '.codex-plugin/plugin.json',
      '.cursor-plugin/plugin.json',
      'glama.json',
    ]) {
      assert.doesNotMatch(read(file), /@gmail\.com/u, file);
    }
  });
});

describe('endpoint manifests', () => {
  it('points every client at the single public Streamable HTTP endpoint', () => {
    assert.deepEqual(claudeMcp, { mcpServers: { [SERVER_NAME]: { type: 'http', url: ENDPOINT } } });
    assert.deepEqual(agentMcp, {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [SERVER_NAME]: { type: 'streamable-http', url: ENDPOINT } },
    });
    assert.equal(geminiExtension.mcpServers[SERVER_NAME].httpUrl, ENDPOINT);
    assert.equal(qwenExtension.mcpServers[SERVER_NAME].httpUrl, ENDPOINT);
    assert.deepEqual(registry.remotes, [{ type: 'streamable-http', url: ENDPOINT }]);
    for (const file of [
      '.mcp.json',
      'mcp.json',
      'gemini-extension.json',
      'qwen-extension.json',
      'server.json',
    ]) {
      assert.doesNotMatch(read(file), /localhost|127\.0\.0\.1|staging|http:\/\//u, file);
    }
  });

  it('ships an MCP-only, read-only Codex plugin with public legal pages', () => {
    assert.equal(codexPlugin.mcpServers, './.mcp.json');
    assert.deepEqual(codexPlugin.interface.capabilities, ['Read']);
    for (const key of ['apps', 'skills', 'hooks']) assert.equal(key in codexPlugin, false, key);
    assert.equal(codexPlugin.interface.privacyPolicyURL, 'https://www.bestprice.gr/policies/privacy');
    assert.equal(codexPlugin.interface.termsOfServiceURL, 'https://www.bestprice.gr/policies/terms');
    const prompts = codexPlugin.interface.defaultPrompt;
    assert.ok(prompts.length >= 1 && prompts.length <= 3);
    for (const prompt of prompts) assert.ok(prompt.length <= 128, prompt);
  });

  it('ships a Cursor plugin whose relative paths resolve', () => {
    const base = new URL('.cursor-plugin/', root);
    assert.ok(existsSync(new URL(cursorPlugin.logo, base)), `logo missing: ${cursorPlugin.logo}`);
    assert.ok(
      existsSync(new URL(cursorPlugin.mcpServers, base)),
      `mcpServers missing: ${cursorPlugin.mcpServers}`,
    );
    assert.equal(cursorPlugin.license, 'Apache-2.0');
    assert.equal(cursorPlugin.repository, REPOSITORY);
    assert.ok(existsSync(new URL('.cursor-plugin/skills/SKILL.md', root)));
  });

  it('ships a provider-neutral Agent Plugin', () => {
    assert.equal(agentPlugin.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    assert.equal(agentPlugin.repository, REPOSITORY);
    assert.equal(agentPlugin.homepage, HOMEPAGE);
  });

  it('restricts Gemini and Qwen extensions to the four published tools', () => {
    const expectedServer = clientName => ({
      httpUrl: ENDPOINT,
      headers: { 'X-MCP-Client-Name': clientName },
      includeTools: EXPECTED_TOOLS,
      timeout: 30000,
    });
    assert.deepEqual(geminiExtension.mcpServers[SERVER_NAME], expectedServer('Gemini CLI'));
    assert.deepEqual(qwenExtension.mcpServers[SERVER_NAME], expectedServer('Qwen Code'));
    assert.equal(geminiExtension.contextFileName, 'GEMINI.md');
    assert.equal(qwenExtension.contextFileName, 'QWEN.md');
    assert.equal(read('GEMINI.md'), read('QWEN.md'), 'GEMINI.md and QWEN.md must stay identical');
  });

  it('describes the hosted server for the official MCP Registry', () => {
    assert.equal(
      registry.$schema,
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
    assert.equal(registry.name, 'gr.bestprice/mcp');
    assert.equal(registry.title, 'BestPrice Shopping');
    assert.match(registry.version, SEMVER);
    assert.deepEqual(registry.repository, { url: REPOSITORY, source: 'github' });
    assert.equal(registry.websiteUrl, HOMEPAGE);
    assert.equal(registry.icons[0].src, 'https://www.bestprice.gr/images/logo.svg');
    assert.ok(registry.description.length <= 100);
    assert.match(readme, new RegExp(`Server version: \`${registry.version.replaceAll('.', '\\.')}\``, 'u'));
  });
});

describe('public documents', () => {
  it('lists every published tool and links the install guides from the README', () => {
    for (const tool of EXPECTED_TOOLS) {
      assert.match(readme, new RegExp(`\`${tool}\``, 'u'));
      assert.match(providerSetup, new RegExp(tool, 'u'));
    }
    assert.match(readme, /docs\/provider-setup\.md/u);
    assert.match(readme, /## License/u);
    assert.match(readme, /Apache-2\.0|Apache License 2\.0/u);
    assert.match(readme, /## Contributing/u);
    assert.match(readme, /https:\/\/www\.bestprice\.gr\/contact/u);
    assert.doesNotMatch(readme, /Once published/u, 'do not advertise channels that are not live');
  });

  it('embeds reviewable one-click install links that decode to the public endpoint', () => {
    const vscode = readme.match(/vscode:mcp\/install\?([^)]+)/u)?.[1];
    assert.ok(vscode, 'VS Code install link');
    assert.deepEqual(JSON.parse(decodeURIComponent(vscode)), {
      name: SERVER_NAME,
      type: 'http',
      url: ENDPOINT,
    });

    const cursor = new URL(readme.match(/https:\/\/cursor\.com\/install-mcp\?[^)]+/u)?.[0]);
    assert.equal(cursor.searchParams.get('name'), SERVER_NAME);
    assert.deepEqual(JSON.parse(Buffer.from(cursor.searchParams.get('config'), 'base64').toString('utf8')), {
      url: ENDPOINT,
    });

    assert.match(readme, /https:\/\/claude\.ai\/customize\/connectors\?/u);
    assert.match(readme, /connectorUrl=https%3A%2F%2Fmcp\.bestprice\.gr%2Fmcp/u);
  });

  it('documents the same bounded connection for every supported provider', () => {
    for (const provider of [
      'OpenAI',
      'Gemini',
      'Claude',
      'Perplexity',
      'Grok',
      'Qwen',
      'DeepSeek',
      'Z.ai and GLM',
      'GitHub Copilot and VS Code',
      'Cursor',
      'Microsoft Copilot Studio',
    ]) {
      assert.match(providerSetup, new RegExp(`## ${provider.replaceAll('.', '\\.')}`, 'u'), provider);
    }
    assert.match(providerSetup, new RegExp(ENDPOINT.replaceAll('.', '\\.'), 'u'));
    assert.doesNotMatch(providerSetup, /API[_ -]?KEY.*BestPrice/iu, 'BestPrice needs no API key');
  });

  it('publishes a security policy with a private contact, scope, and response window', () => {
    assert.match(security, /feedback@bestprice\.gr/u);
    assert.match(security, /https:\/\/www\.bestprice\.gr\/\.well-known\/security\.txt/u);
    assert.match(security, /## Scope/u);
    assert.match(security, /business days/u);
  });

  it('explains the two version axes and keeps a changelog', () => {
    assert.match(contributing, /server\.json/u);
    assert.match(contributing, /package\.json/u);
    assert.match(changelog, /## \[Unreleased\]/u);
    assert.match(
      changelog,
      new RegExp(`## \\[${pkg.version.replaceAll('.', '\\.')}\\]|## \\[Unreleased\\]`, 'u'),
    );
  });
});

describe('assets', () => {
  it('ships a square marketplace logo under the common 128 KB limit', () => {
    const logo = readFileSync(new URL('assets/bestprice-mcp-logo-1024.png', root));
    assert.equal(logo.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(logo.readUInt32BE(16), logo.readUInt32BE(20), 'logo must be square');
    assert.ok(logo.length < 128 * 1024);
  });

  it('ships readable product screenshots for the README', () => {
    for (const name of ['search-products', 'compare-offers', 'price-history']) {
      const screenshot = readFileSync(new URL(`docs/images/claude-${name}.png`, root));
      assert.equal(screenshot.subarray(1, 4).toString('ascii'), 'PNG');
      assert.ok(screenshot.readUInt32BE(16) >= 1000, `${name} must be at least 1000px wide`);
      assert.match(readme, new RegExp(`docs/images/claude-${name}\\.png`, 'u'));
    }
  });
});

describe('review cases', () => {
  it('provides at least seven positive and four negative cases with unique ids', () => {
    assert.ok(cases.positive.length >= 7);
    assert.ok(cases.negative.length >= 4);
    const ids = [...cases.positive, ...cases.negative].map(testCase => testCase.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('uses only valid public grouped-product IDs in prompts', () => {
    // Grouped-product IDs live in the upper half of the unsigned 32-bit range.
    const productIds = JSON.stringify(cases.positive).match(/bp_[0-9]+/gu) ?? [];
    assert.ok(productIds.length > 0);
    for (const productId of productIds) {
      assert.match(productId, /^bp_[0-9]{10}$/u);
      const numeric = Number(productId.slice(3));
      assert.ok(numeric > 2_147_483_648 && numeric <= 4_294_967_295, productId);
    }
  });

  it('covers every published tool and the critical commercial refusals', () => {
    const tools = new Set(cases.positive.flatMap(testCase => testCase.expected_tools));
    assert.deepEqual([...tools].sort(), [...EXPECTED_TOOLS].sort());
    const negativeText = JSON.stringify(cases.negative).toLowerCase();
    assert.match(negativeText, /checkout/u);
    assert.match(negativeText, /merchant url/u);
    assert.match(negativeText, /prompt-injection|embedded instructions/u);
  });
});
