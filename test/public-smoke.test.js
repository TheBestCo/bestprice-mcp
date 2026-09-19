/** Real SDK against synthetic HTTP envelopes; no external requests or qualification evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_TOOLS } from '../scripts/public-contracts.js';
import { runPublicSmoke } from '../scripts/public-smoke.mjs';

const REVISION = 'a'.repeat(40);
const SECRET = 'synthetic-sensitive-value-never-in-report';
const productId = 'bp_2147483650';
const common = { currency: 'EUR', locale: 'el-GR' };
const tools = () =>
  PUBLIC_TOOLS.map(name => ({
    name,
    description: 'Synthetic test only',
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      required: ['currency', 'locale'],
      properties: { currency: { const: 'EUR' }, locale: { const: 'el-GR' } },
    },
  }));
function result(name, args) {
  if (name === 'search_products')
    return { ...common, products: [{ product_id: productId, title: SECRET, price_from: 200 }] };
  if (name === 'compare_offers')
    return {
      ...common,
      product: { product_id: productId },
      postal_code: args.postal_code,
      offers: [
        {
          offer_id: 'bp_offer_1',
          item_price: 20,
          shipping_status: 'known',
          shipping_price: 2,
          total_price: 22,
        },
      ],
    };
  if (name === 'get_price_history')
    return {
      ...common,
      product_id: productId,
      period_days: 180,
      methodology_id: 'bestprice_daily_min_v1',
      series: [],
    };
  return {
    ...common,
    outcome: 'recommendation',
    products: [{ product_id: productId, price_from: 500 }],
    recommended_product_id: productId,
    evidence: { claims: [{ text: SECRET }] },
    price_verdict: { predicts_future_price: false },
  };
}
function fixture(alter = () => {}) {
  const requests = [];
  return {
    requests,
    async fetchImpl(input, init) {
      const request = new Request(input, init);
      assert.equal(init.redirect, 'manual');
      assert.equal(new URL(request.url).hostname, 'mcp.bestprice.gr');
      const body = request.method === 'POST' ? await request.json() : null;
      const lane = request.headers.get('accept') === 'application/json' ? 'json' : 'dual';
      requests.push({ url: request.url, method: request.method, body, lane });
      const headers = { 'x-bestprice-revision': REVISION, 'content-type': 'application/json' };
      let status = 200;
      let output;
      if (request.url.endsWith('/healthz')) output = { ok: true, disabled: false, revision: REVISION };
      else if (request.method === 'GET') {
        status = 405;
        output = {};
      } else if (body.method === 'notifications/initialized') {
        status = 202;
        output = null;
      } else {
        let payload;
        if (body.method === 'initialize')
          payload = {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'bestprice-agent-commerce', version: '1.8.0' },
          };
        else if (body.method === 'tools/list') payload = { tools: tools() };
        else if (body.method === 'tools/call') {
          const value = result(body.params.name, body.params.arguments);
          payload = { structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] };
        } else throw new Error('unexpected test method');
        output = { jsonrpc: '2.0', id: body.id, result: payload };
      }
      const state = { request, body, lane, headers, output, status };
      const replacement = await alter(state);
      if (replacement instanceof Response) return replacement;
      let text = state.output == null ? '' : JSON.stringify(state.output);
      if (state.status === 200 && body && lane === 'dual') {
        state.headers['content-type'] = 'text/event-stream';
        text = `data: ${text}\n\n`;
      }
      return new Response(text, { status: state.status, headers: state.headers });
    },
  };
}

test('both transport lanes perform all four tools and emit no catalog or request data', async () => {
  const mock = fixture();
  const report = await runPublicSmoke({ ...mock, expectedRevision: REVISION });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.deepEqual(
    report.lanes.map(lane => [lane.lane, lane.steps.length, lane.passed]),
    [
      ['dual', 5, true],
      ['json', 5, true],
    ],
  );
  assert.equal(report.revision, REVISION);
  assert.equal(report.qualification, false);
  assert.equal(report.requests.length, 18);
  assert.ok(mock.requests.every(request => !request.url.includes('/agent/')));
  const text = JSON.stringify(report);
  assert.ok(!text.includes(SECRET) && !text.includes('Sony') && !text.includes(productId));
  for (const request of mock.requests.filter(request => request.body?.method === 'tools/call')) {
    assert.equal(request.body.params._meta?.progressToken, undefined);
  }
});

test('the other transport is still examined after a genuine JSON-only negotiation failure', async () => {
  const mock = fixture(state => {
    if (state.lane === 'json' && state.body?.method === 'initialize')
      state.output.result.protocolVersion = '2026-07-28';
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.equal(report.lanes[0].passed, true);
  assert.equal(report.lanes[1].passed, false);
});

for (const cause of ['missing', 'mixed', 'unexpected', 'health-body']) {
  test(`serving identity cannot be accepted when ${cause}`, async () => {
    const mock = fixture(state => {
      if (cause === 'missing') delete state.headers['x-bestprice-revision'];
      if (cause === 'mixed' && state.body?.method === 'tools/list')
        state.headers['x-bestprice-revision'] = 'b'.repeat(40);
      if (cause === 'health-body' && state.request.url.endsWith('/healthz'))
        state.output.revision = 'b'.repeat(40);
    });
    const report = await runPublicSmoke({
      ...mock,
      expectedRevision: cause === 'unexpected' ? 'b'.repeat(40) : undefined,
    });
    assert.equal(report.passed, false);
  });
}

test('HTTP rate limiting fails without retries or following destinations', async () => {
  const mock = fixture(state => {
    state.status = 429;
    state.output = {};
    state.headers['retry-after'] = '60';
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.equal(mock.requests.length, 1);
  assert.equal(report.requests[0].status, 429);
  assert.equal(report.requests[0].revision, REVISION);
});

test('rejects oversized response acquisition, cancelling the stream without draining it', async () => {
  let cancelled = false;
  let pulled = 0;
  const mock = fixture(
    () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulled++;
            controller.enqueue(new Uint8Array(65536));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'x-bestprice-revision': REVISION } },
      ),
  );
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.equal(report.failure, 'BODY_SIZE_LIMIT');
  assert.equal(cancelled, true);
  assert.ok(pulled <= 34);
});

test('a non-cooperative fetch is bounded and its late body is disposed', async () => {
  let resolve;
  let cancelled = false;
  const pending = new Promise(done => {
    resolve = done;
  });
  const report = await runPublicSmoke({ fetchImpl: () => pending, requestMs: 10, deadlineMs: 100 });
  assert.equal(report.passed, false);
  assert.equal(report.failure, 'REQUEST_DEADLINE');
  resolve(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise(done => setImmediate(done));
  assert.equal(cancelled, true);
});

test('a stalled body is bounded, cancelled and reports no response contents', async () => {
  let cancelled = false;
  const report = await runPublicSmoke({
    requestMs: 10,
    deadlineMs: 100,
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'x-bestprice-revision': REVISION } },
      ),
  });
  assert.equal(report.passed, false);
  assert.equal(report.failure, 'REQUEST_DEADLINE');
  assert.equal(cancelled, true);
});

test('tool output/schema corruption makes the smoke red instead of merely counting HTTP 200s', async () => {
  const mock = fixture(state => {
    if (state.body?.method === 'tools/call') state.output.result.content[0].text = '{"currency":"USD"}';
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.ok(report.lanes.every(lane => lane.failure === 'TEXT_MIRROR_MISMATCH'));
});

test('descriptors may not drift between transports', async () => {
  const mock = fixture(state => {
    if (state.lane === 'json' && state.body?.method === 'tools/list')
      state.output.result.tools[0].description = 'different';
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.equal(report.lanes[1].failure, 'TRANSPORT_DESCRIPTOR_DRIFT');
});

test('a known recommendation over the item budget cannot produce a passing lane', async () => {
  const mock = fixture(state => {
    if (state.body?.params?.name === 'get_shopping_decision') {
      const value = state.output.result.structuredContent;
      value.products[0].price_from = 600.01;
      state.output.result.content[0].text = JSON.stringify(value);
    }
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.ok(report.lanes.every(lane => lane.failure === 'DECISION_ITEM_BUDGET_BREACH'));
});

for (const problem of ['missing-revision', 'rate-limit', 'server-error']) {
  test(`an SDK background event-channel ${problem} cannot be swallowed into a green report`, async () => {
    const mock = fixture(state => {
      if (state.request.method !== 'GET' || state.request.url.endsWith('/healthz')) return;
      if (problem === 'missing-revision') {
        state.status = 200;
        delete state.headers['x-bestprice-revision'];
      } else state.status = problem === 'rate-limit' ? 429 : 503;
    });
    const report = await runPublicSmoke(mock);
    assert.equal(report.passed, false);
    assert.equal(report.failure, 'HTTP_OBSERVATION_FAILED');
  });
}

test('untrusted revision headers are never copied into sanitized observations', async () => {
  const mock = fixture(state => {
    state.headers['x-bestprice-revision'] = SECRET;
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.equal(report.requests[0].revision, null);
  assert.ok(!JSON.stringify(report).includes(SECRET));
});

test('per-request elapsed time is enforced even before the timer callback can run', async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const mock = fixture(() => {
    clock += 10;
  });
  const report = await runPublicSmoke({ ...mock, requestMs: 10, deadlineMs: 100 });
  assert.equal(report.passed, false);
  assert.equal(report.failure, 'REQUEST_DEADLINE');
});

test('a raw server version cannot leak arbitrary remote text into reports', async () => {
  const mock = fixture(state => {
    if (state.body?.method === 'initialize') state.output.result.serverInfo.version = SECRET;
  });
  const report = await runPublicSmoke(mock);
  assert.equal(report.passed, false);
  assert.ok(!JSON.stringify(report).includes(SECRET));
});
