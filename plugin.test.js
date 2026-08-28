import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const readJson = relativePath =>
  // eslint-disable-next-line no-restricted-syntax -- immutable submission fixtures, not executable modules
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

const manifest = readJson('./.codex-plugin/plugin.json');
const mcp = readJson('./.mcp.json');
const portablePlugin = readJson('./plugin.json');
const portableMcp = readJson('./mcp.json');
const registry = readJson('./server.json');
const geminiExtension = readJson('./gemini-extension.json');
const qwenExtension = readJson('./qwen-extension.json');
const cases = readJson('./submission/test-cases.json');
// eslint-disable-next-line no-restricted-syntax -- immutable human-facing setup fixture
const providerSetup = readFileSync(new URL('./PROVIDER_SETUP.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const security = readFileSync(new URL('./SECURITY.md', import.meta.url), 'utf8');
const claudeSubmission = readFileSync(new URL('./submission/claude-directory.md', import.meta.url), 'utf8');
const perplexitySubmission = readFileSync(new URL('./submission/perplexity-connector.md', import.meta.url), 'utf8');

describe('BestPrice Shopping plugin bundle', () => {
  it('is an MCP-only, read-only Codex plugin with no app surface', () => {
    assert.equal(manifest.name, 'bestprice-shopping');
    assert.equal(manifest.mcpServers, './.mcp.json');
    assert.deepEqual(manifest.interface.capabilities, ['Read']);
    assert.equal('apps' in manifest, false);
    assert.equal('skills' in manifest, false);
    assert.equal('hooks' in manifest, false);
  });

  it('ships a provider-neutral Agent Plugin package', () => {
    assert.deepEqual(portablePlugin, {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'bestprice-shopping',
      version: '1.0.1',
      description: 'Read-only product search, offer comparison, and price history from BestPrice.gr.',
      author: {
        name: 'BestPrice',
        url: 'https://www.bestprice.gr/',
      },
      homepage: 'https://www.bestprice.gr/mcp',
      repository: 'https://github.com/TheBestCo/bestprice-mcp',
      keywords: ['shopping', 'price-comparison', 'greece', 'mcp'],
    });
    assert.deepEqual(portableMcp, {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: {
        'bestprice-shopping': {
          type: 'streamable-http',
          url: 'https://mcp.bestprice.gr/mcp',
        },
      },
    });
  });

  it('targets only the production HTTPS Streamable HTTP endpoint', () => {
    assert.deepEqual(mcp, {
      mcpServers: {
        'bestprice-shopping': {
          type: 'http',
          url: 'https://mcp.bestprice.gr/mcp',
        },
      },
    });
  });

  it('ships a provider-neutral official MCP Registry manifest', () => {
    assert.equal(registry.$schema, 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json');
    assert.equal(registry.name, 'gr.bestprice/mcp');
    assert.equal(registry.title, 'BestPrice Shopping');
    assert.equal(registry.version, '1.6.0');
    assert.deepEqual(registry.repository, {
      url: 'https://github.com/TheBestCo/bestprice-mcp',
      source: 'github',
    });
    assert.equal(registry.websiteUrl, 'https://www.bestprice.gr/mcp');
    assert.deepEqual(registry.remotes, [
      {
        type: 'streamable-http',
        url: 'https://mcp.bestprice.gr/mcp',
      },
    ]);
    assert.equal(registry.icons[0].src, 'https://www.bestprice.gr/images/logo.svg');
    assert.ok(registry.description.length <= 100);
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
      assert.match(providerSetup, new RegExp(`## ${provider.replace('.', '\\.')}`, 'u'));
    }
    assert.match(providerSetup, /https:\/\/mcp\.bestprice\.gr\/mcp/u);
    assert.match(providerSetup, /search_products.*compare_offers.*get_price_history/u);
    assert.doesNotMatch(providerSetup, /API[_ -]?KEY.*BestPrice/iu);
  });

  it('ships bounded Gemini and Qwen extension manifests', () => {
    const expectedServer = clientName => ({
      httpUrl: 'https://mcp.bestprice.gr/mcp',
      headers: { 'X-MCP-Client-Name': clientName },
      includeTools: ['search_products', 'compare_offers', 'get_price_history'],
      timeout: 30000,
    });
    assert.deepEqual(geminiExtension.mcpServers['bestprice-shopping'], expectedServer('Gemini CLI'));
    assert.deepEqual(qwenExtension.mcpServers['bestprice-shopping'], expectedServer('Qwen Code'));
    assert.equal(geminiExtension.contextFileName, 'GEMINI.md');
    assert.equal(qwenExtension.contextFileName, 'QWEN.md');
    assert.equal('trust' in expectedServer('Qwen Code'), false);
  });

  it('keeps starter prompts within platform presentation limits', () => {
    const prompts = manifest.interface.defaultPrompt;
    assert.ok(prompts.length >= 1 && prompts.length <= 3);
    for (const prompt of prompts) assert.ok(prompt.length <= 128, prompt);
  });

  it('declares the canonical public legal pages required for submission', () => {
    assert.equal(manifest.interface.privacyPolicyURL, 'https://www.bestprice.gr/policies/privacy');
    assert.equal(manifest.interface.termsOfServiceURL, 'https://www.bestprice.gr/policies/terms');
  });

  it('publishes support, security, and reviewable editor install links', () => {
    assert.match(readme, /https:\/\/www\.bestprice\.gr\/contact/u);
    assert.match(security, /feedback@bestprice\.gr/u);
    assert.match(security, /https:\/\/www\.bestprice\.gr\/\.well-known\/security\.txt/u);

    const encodedConfig = readme.match(/vscode:mcp\/install\?([^\)]+)/u)?.[1];
    assert.ok(encodedConfig);
    assert.deepEqual(JSON.parse(decodeURIComponent(encodedConfig)), {
      name: 'bestprice-shopping',
      type: 'http',
      url: 'https://mcp.bestprice.gr/mcp',
    });

    const cursorConfig = new URL(
      readme.match(/https:\/\/cursor\.com\/install-mcp\?[^)]+/u)?.[0],
    );
    assert.equal(cursorConfig.searchParams.get('name'), 'bestprice-shopping');
    assert.deepEqual(
      JSON.parse(Buffer.from(cursorConfig.searchParams.get('config'), 'base64').toString('utf8')),
      { url: 'https://mcp.bestprice.gr/mcp' },
    );
    assert.match(readme, /https:\/\/claude\.ai\/customize\/connectors\?/u);
    assert.match(readme, /connectorUrl=https%3A%2F%2Fmcp\.bestprice\.gr%2Fmcp/u);
  });

  it('keeps the Claude Directory handoff factual and human-gated', () => {
    assert.match(claudeSubmission, /https:\/\/mcp\.bestprice\.gr\/mcp/u);
    assert.match(claudeSubmission, /Allowed link origin \| `https:\/\/www\.bestprice\.gr`/u);
    assert.match(claudeSubmission, /readOnlyHint: true/u);
    assert.match(claudeSubmission, /does not replace the policy attestations/u);
    assert.match(claudeSubmission, /authorized BestPrice owner/u);
    for (const name of ['search-products', 'compare-offers', 'price-history']) {
      const screenshot = readFileSync(new URL(`./submission/claude-${name}.png`, import.meta.url));
      assert.equal(screenshot.subarray(1, 4).toString('ascii'), 'PNG');
      assert.ok(screenshot.readUInt32BE(16) >= 1000, `${name} screenshot must be at least 1000px wide`);
    }
  });

  it('keeps the Perplexity connector handoff bounded and honest', () => {
    assert.match(perplexitySubmission, /https:\/\/mcp\.bestprice\.gr\/mcp/u);
    assert.match(perplexitySubmission, /Authentication \| None/u);
    assert.match(perplexitySubmission, /Transport \| Streamable HTTP/u);
    assert.match(perplexitySubmission, /does not currently document a public\s+third-party directory/u);
    assert.ok(readFileSync(new URL('./submission/bestprice-mcp-logo-1024.png', import.meta.url)).length < 128 * 1024);
  });

  it('provides at least five positive and three negative review cases', () => {
    assert.ok(cases.positive.length >= 5);
    assert.ok(cases.negative.length >= 3);
    const ids = [...cases.positive, ...cases.negative].map(testCase => testCase.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('uses only valid public grouped-product IDs in submission prompts', () => {
    const productIds = JSON.stringify(cases.positive).match(/bp_[0-9]+/gu) ?? [];
    assert.ok(productIds.length > 0);
    for (const productId of productIds) {
      assert.match(productId, /^bp_[0-9]{10}$/u);
      const numeric = Number(productId.slice(3));
      assert.ok(numeric > 2_147_483_648 && numeric <= 4_294_967_295, productId);
    }
  });

  it('covers every published tool and critical commercial refusal', () => {
    const tools = new Set(cases.positive.flatMap(testCase => testCase.expected_tools));
    assert.deepEqual([...tools].sort(), ['compare_offers', 'get_price_history', 'search_products']);
    const negativeText = JSON.stringify(cases.negative).toLowerCase();
    assert.match(negativeText, /checkout/);
    assert.match(negativeText, /merchant url/);
    assert.match(negativeText, /prompt-injection|embedded instructions/);
  });
});
