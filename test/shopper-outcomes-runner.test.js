/** Installed SDK + synthetic HTTP envelopes; no external network or commercial events. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, PROBE_CLIENT, PROBE_VERSION } from '../scripts/shopper-outcomes.js';
import { runShopperOutcomes } from '../scripts/shopper-outcomes.mjs';

const REVISION = 'a'.repeat(40);
const names = ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'];
const titles = [
  'Sony WH-1000XM5',
  'Apple iPhone 16 128GB',
  'Logitech MX Master 3S',
  'Ακουστικά',
  'External SSD 1TB',
  'Logitech MX Master 3S 910-006559',
];
const tools = names.map(name => ({
  name,
  description: 'Synthetic fixture',
  annotations: { readOnlyHint: true, destructiveHint: false },
  inputSchema: { type: 'object' },
  outputSchema: {
    type: 'object',
    required: ['currency', 'locale'],
    properties: { currency: { const: 'EUR' }, locale: { const: 'el-GR' } },
  },
}));

function fixture({
  client = 'bestprice_canary',
  merchantRedirect = false,
  empty = false,
  summaryLinks = true,
  malformed = false,
} = {}) {
  const requests = [];
  const tokens = [];
  const fetchImpl = async (input, options) => {
    assert.equal(options.redirect, 'manual');
    const request = new Request(input, options);
    assert.equal(request.headers.get('x-mcp-client-name'), PROBE_CLIENT);
    assert.equal(request.headers.get('x-mcp-client-version'), PROBE_VERSION);
    requests.push({ url: request.url, method: request.method });
    const headers = { 'content-type': 'application/json', 'x-bestprice-revision': REVISION };
    if (request.url.endsWith('/healthz')) {
      return Response.json({ ok: true, disabled: false, revision: REVISION }, { headers });
    }
    if (request.url.startsWith('https://www.bestprice.gr/agent/r/')) {
      const token = request.url.split('/').at(-1);
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return new Response(null, {
        status: 302,
        headers: {
          location: merchantRedirect
            ? 'https://merchant.invalid/charge'
            : `https://www.bestprice.gr/item/${claims.product_path}.html?bpref=mcp`,
        },
      });
    }
    if (request.url.startsWith('https://www.bestprice.gr/item/')) {
      assert.equal(new URL(request.url).search, '');
      return new Response(
        `<html><head><link rel="canonical" href="${request.url}"></head><body>Product</body></html>`,
      );
    }
    assert.equal(request.url, 'https://mcp.bestprice.gr/mcp');
    if (request.method === 'GET') return new Response(null, { status: 405, headers });
    const body = await request.json();
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202, headers });
    let payload;
    if (body.method === 'initialize') {
      assert.equal(body.params.clientInfo.name, PROBE_CLIENT);
      payload = {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'bestprice-agent-commerce', version: '1.8.0' },
      };
    } else if (body.method === 'tools/list') payload = { tools };
    else {
      assert.equal(body.method, 'tools/call');
      assert.equal(body.params.name, 'search_products');
      const index = CASES.findIndex(item => item.query === body.params.arguments.query);
      assert.ok(index >= 0);
      const now = Math.floor(Date.now() / 1000);
      const id = 2147483648 + index + 10;
      const claims = {
        v: 1,
        purpose: 'landing',
        source: 'mcp',
        client,
        tool: 'search_products',
        cluster_id: index + 10,
        product_path: `${id}/product-${index}`,
        iat: now,
        exp: now + 600,
      };
      const token = `v1.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${'x'.repeat(43)}`;
      tokens.push(token);
      const product = {
        product_id: `bp_${id}`,
        title: titles[index],
        variant: 'Black',
        price_from: 50,
        bestprice_url: `https://www.bestprice.gr/agent/r/${token}`,
      };
      const value = {
        currency: 'EUR',
        locale: 'el-GR',
        total_matches: empty ? 0 : 1,
        products: empty ? [] : [product],
        search_mode: 'catalog_ranked',
      };
      const summary = `${product.title} Black χωρίς μεταφορικά${summaryLinks ? `\n${product.bestprice_url}` : ''}`;
      payload = {
        structuredContent: value,
        content: [{ type: 'text', text: `${summary}\nStructured result (JSON):\n${JSON.stringify(value)}` }],
      };
    }
    return malformed && body.method === 'tools/call'
      ? new Response('not JSON', { headers })
      : Response.json({ jsonrpc: '2.0', id: body.id, result: payload }, { headers });
  };
  return { fetchImpl, requests, tokens };
}

test('six real-SDK searches and three guarded machine routes complete with no merchant request', async () => {
  const harness = fixture();
  const report = await runShopperOutcomes(harness);
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.qualification, false);
  assert.equal(report.cases.length, 6);
  assert.equal(report.routes.length, 3);
  assert.ok(report.routes.every(route => route.passed));
  assert.ok(harness.requests.length <= 28);
  assert.equal(harness.requests.filter(request => request.url.includes('/agent/r/')).length, 3);
  for (const token of harness.tokens) assert.equal(JSON.stringify(report).includes(token), false);
});

for (const client of ['other', 'chatgpt', 'claude']) {
  test(`refuses to navigate a link attributed to ${client} instead of the synthetic cohort`, async () => {
    const harness = fixture({ client });
    const report = await runShopperOutcomes(harness);
    assert.equal(report.passed, false);
    assert.equal(report.routes.length, 0);
    assert.equal(
      harness.requests.some(request => request.url.includes('/agent/r/')),
      false,
    );
    assert.ok(report.cases.every(item => item.failures.includes('SYNTHETIC_COHORT_REQUIRED')));
  });
}

test('a signed route pointing to a merchant is recorded as failure and never followed', async () => {
  const harness = fixture({ merchantRedirect: true });
  const report = await runShopperOutcomes(harness);
  assert.equal(report.passed, false);
  assert.ok(report.routes.every(route => route.failure === 'SIGNED_ROUTE_ORIGIN'));
  assert.equal(
    harness.requests.some(request => request.url.includes('merchant.invalid')),
    false,
  );
});

test('empty required searches cannot produce a green run or generated navigation', async () => {
  const harness = fixture({ empty: true });
  const report = await runShopperOutcomes(harness);
  assert.equal(report.passed, false);
  assert.equal(report.routes.length, 0);
  assert.equal(report.cases.filter(item => item.status === 'failed').length, 4);
  assert.equal(report.reviewRequired, 2);
});

test('JSON-only links fail the human-readable summary check', async () => {
  const harness = fixture({ summaryLinks: false });
  const report = await runShopperOutcomes(harness);
  assert.equal(report.passed, false);
  assert.equal(report.routes.length, 0);
  assert.ok(report.cases.every(item => item.failures.includes('SUMMARY_LINK_MISSING_OR_DUPLICATE')));
});

test('malformed transport output is retained as failure without payload leakage', async () => {
  const harness = fixture({ malformed: true });
  const report = await runShopperOutcomes(harness);
  assert.equal(report.passed, false);
  assert.equal(report.routes.length, 0);
  assert.equal(JSON.stringify(report).includes('not JSON'), false);
});
