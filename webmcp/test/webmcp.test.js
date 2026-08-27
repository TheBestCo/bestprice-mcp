import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTools, PAGE_TOOL_NAMES } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';
import { createRegistration } from '../src/runtime.js';

describe('public BestPrice WebMCP layer', () => {
  it('publishes 13 unique contextual tools with explicit safety annotations', () => {
    const allNames = new Set(Object.values(PAGE_TOOL_NAMES).flat());
    assert.equal(allNames.size, 13);
    assert.deepEqual(PAGE_TOOL_NAMES.home, ['search_bestprice']);
    assert.equal(PAGE_TOOL_NAMES.listing.length, 8);
    assert.equal(PAGE_TOOL_NAMES.product.length, 6);

    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      const tools = createTools({ page, execute: () => ({ ok: true }) });
      for (const tool of tools) {
        assert.ok(tool.name.length <= 30);
        assert.ok(tool.title);
        assert.ok(tool.description.length <= 500);
        assert.equal(tool.annotations.untrustedContentHint, true);
        assert.equal(tool.inputSchema.additionalProperties, false);
        for (const property of Object.values(tool.inputSchema.properties)) {
          assert.ok(!property.description || property.description.length <= 150);
        }
      }
    }
    assert.equal(createTools({ page: 'listing', execute: () => ({ ok: true }) }).find(tool => tool.name === 'open_visible_product').annotations.readOnlyHint, false);
  });

  it('fails a partial registration closed and aborts every registered tool', async () => {
    const signals = [];
    const modelContext = {
      registerTool(tool, { signal }) {
        signals.push(signal);
        if (tool.name === 'open_visible_product') throw new Error('unsupported');
      },
    };
    const states = [];
    const registration = createRegistration({ modelContext, onState: state => states.push(state) });
    const result = await registration.register(createTools({ page: 'listing', execute: () => ({ ok: true }) }));

    assert.deepEqual(result, { status: 'degraded', registered: 0 });
    assert.equal(signals.length, 8);
    assert.ok(signals.every(signal => signal.aborted));
    assert.deepEqual(states.at(-1), { status: 'degraded', registered: 0 });
  });

  it('supports the complete search, listing, product, offer, and history journey', async () => {
    const adapter = createDemoAdapter();
    let tools = createTools({ page: 'home', execute: adapter.execute });
    assert.deepEqual(await tools[0].execute({ query: 'phone' }), { ok: true, action: 'started_product_search', query: 'phone' });
    assert.equal(adapter.snapshot().page, 'listing');

    tools = createTools({ page: 'listing', execute: adapter.execute });
    const listing = await tools.find(tool => tool.name === 'get_visible_products').execute({ limit: 3 });
    assert.equal(listing.ok, true);
    assert.equal(listing.returned, 3);
    assert.ok(JSON.stringify(listing).length <= 1500);
    assert.ok(listing.products.every(product => product.bestprice_url.endsWith('?bpref=mcp')));
    const productId = listing.products[0].product_id;
    assert.equal((await tools.find(tool => tool.name === 'open_visible_product').execute({ product_id: productId })).ok, true);
    assert.equal(adapter.snapshot().page, 'product');

    tools = createTools({ page: 'product', execute: adapter.execute });
    const offers = await tools.find(tool => tool.name === 'compare_page_offers').execute({ limit: 4 });
    assert.equal(offers.ok, true);
    assert.ok(JSON.stringify(offers).length <= 1500);
    assert.ok(offers.offers.every(offer => !('merchant_url' in offer)));
    assert.ok(offers.offers.some(offer => offer.shipping_eur === null && offer.delivered_price_eur === null));
    const history = await tools.find(tool => tool.name === 'summarize_price_history').execute({});
    assert.equal(history.ok, true);
    assert.equal(history.product_id, productId);
  });

  it('refuses to open a hidden or invented listing product', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const result = await adapter.execute('open_visible_product', { product_id: '9999999999' });
    assert.deepEqual(result, { ok: false, error: 'Product 9999999999 is not currently visible on this page.' });
  });
});
