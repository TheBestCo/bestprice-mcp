import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTools, PAGE_TOOL_NAMES, TOOL_NAMES } from '../src/contracts.js';
import { BRAND_FILTER, createDemoAdapter, PAGES, SORT_OPTIONS } from '../src/demo-adapter.js';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const noop = () => ({ ok: true });

describe('contracts', () => {
  it('publishes 13 unique contextual tools across three page types', () => {
    assert.equal(TOOL_NAMES.length, 13);
    assert.deepEqual(new Set(Object.values(PAGE_TOOL_NAMES).flat()), new Set(TOOL_NAMES));
    assert.deepEqual(PAGE_TOOL_NAMES.home, ['search_bestprice']);
    assert.equal(PAGE_TOOL_NAMES.listing.length, 8);
    assert.equal(PAGE_TOOL_NAMES.product.length, 6);
    assert.ok(Object.isFrozen(PAGE_TOOL_NAMES.listing));
  });

  it('keeps every contract within the WebMCP size limits and annotates it explicitly', () => {
    const hintKeys = [
      'readOnlyHint',
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
      'untrustedContentHint',
    ];
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: noop })) {
        assert.ok(tool.name.length <= 30);
        assert.ok(tool.title);
        assert.ok(tool.description.length <= 500);
        assert.deepEqual(Object.keys(tool.annotations).sort(), [...hintKeys].sort(), tool.name);
        assert.equal(tool.annotations.untrustedContentHint, true);
        assert.equal(tool.annotations.destructiveHint, false);
        assert.equal(tool.inputSchema.additionalProperties, false);
        for (const property of Object.values(tool.inputSchema.properties)) {
          assert.ok(!property.description || property.description.length <= 150);
        }
      }
    }
  });

  it('marks page-changing tools as not read-only and reading tools as read-only', () => {
    const tools = new Map(createTools({ page: 'listing', execute: noop }).map(tool => [tool.name, tool]));
    assert.equal(tools.get('open_visible_product').annotations.readOnlyHint, false);
    assert.equal(tools.get('get_visible_products').annotations.readOnlyHint, true);
  });

  it('binds execute to the tool name', async () => {
    const calls = [];
    const [tool] = createTools({ page: 'home', execute: (name, args) => calls.push([name, args]) });
    await tool.execute({ query: 'tv' });
    assert.deepEqual(calls, [['search_bestprice', { query: 'tv' }]]);
  });

  it('rejects unknown page types', () => {
    assert.throws(
      () => createTools({ page: 'checkout', execute: noop }),
      /Unknown WebMCP page type: checkout/u,
    );
  });
});

describe('registration runtime', () => {
  const listingTools = () => createTools({ page: 'listing', execute: noop });

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
    const result = await registration.register(listingTools());

    assert.deepEqual(result, { status: 'degraded', registered: 0 });
    assert.equal(signals.length, 8);
    assert.ok(signals.every(signal => signal.aborted));
    assert.deepEqual(states.at(-1), { status: 'degraded', registered: 0 });
  });

  it('reports ready when every tool registers', async () => {
    const modelContext = createLocalModelContext();
    const states = [];
    const registration = createRegistration({ modelContext, onState: state => states.push(state) });
    assert.deepEqual(await registration.register(listingTools()), { status: 'ready', registered: 8 });
    assert.equal(modelContext.tools.size, 8);
    assert.deepEqual(
      states.map(state => state.status),
      ['unavailable', 'registering', 'ready'],
    );
  });

  it('degrades when registration does not settle within the timeout', async () => {
    const signals = [];
    const modelContext = {
      registerTool(_tool, { signal }) {
        signals.push(signal);
        return new Promise(() => {});
      },
    };
    const registration = createRegistration({ modelContext, timeoutMs: 20 });
    assert.deepEqual(await registration.register(listingTools()), { status: 'degraded', registered: 0 });
    assert.ok(signals.every(signal => signal.aborted));
  });

  it('cancels a superseded registration and keeps only the latest', async () => {
    const modelContext = {
      registerTool: () => new Promise(resolve => setTimeout(resolve, 5)),
    };
    const registration = createRegistration({ modelContext });
    const first = registration.register(listingTools());
    const second = registration.register(createTools({ page: 'product', execute: noop }));
    assert.deepEqual(await first, { status: 'cancelled', registered: 0 });
    assert.deepEqual(await second, { status: 'ready', registered: 6 });
  });

  it('tears down by aborting registered tools and reporting unavailable', async () => {
    const modelContext = createLocalModelContext();
    const states = [];
    const registration = createRegistration({ modelContext, onState: state => states.push(state) });
    await registration.register(listingTools());
    registration.teardown();
    assert.equal(modelContext.tools.size, 0);
    assert.deepEqual(states.at(-1), { status: 'unavailable', registered: 0 });
  });

  it('is unavailable without a model context', async () => {
    const registration = createRegistration({ modelContext: undefined });
    assert.deepEqual(await registration.register(listingTools()), { status: 'unavailable', registered: 0 });
  });

  it('local model context rejects malformed tools', () => {
    const modelContext = createLocalModelContext();
    assert.throws(() => modelContext.registerTool({ name: 'x' }), TypeError);
    assert.throws(() => modelContext.registerTool({ execute: noop }), TypeError);
  });
});

describe('demo adapter', () => {
  it('supports the complete search, listing, product, offer, and history journey', async () => {
    const adapter = createDemoAdapter();
    let tools = createTools({ page: 'home', execute: adapter.execute });
    assert.deepEqual(await tools[0].execute({ query: 'phone' }), {
      ok: true,
      action: 'started_product_search',
      query: 'phone',
    });
    assert.equal(adapter.snapshot().page, 'listing');

    tools = createTools({ page: 'listing', execute: adapter.execute });
    const listing = await tools.find(tool => tool.name === 'get_visible_products').execute({ limit: 3 });
    assert.equal(listing.ok, true);
    assert.equal(listing.returned, 3);
    assert.ok(JSON.stringify(listing).length <= 1500, 'listing payload stays compact');
    assert.ok(listing.products.every(product => product.bestprice_url.endsWith('?bpref=mcp')));
    const productId = listing.products[0].product_id;
    assert.equal(
      (await tools.find(tool => tool.name === 'open_visible_product').execute({ product_id: productId })).ok,
      true,
    );
    assert.equal(adapter.snapshot().page, 'product');

    tools = createTools({ page: 'product', execute: adapter.execute });
    const offers = await tools.find(tool => tool.name === 'compare_page_offers').execute({ limit: 4 });
    assert.equal(offers.ok, true);
    assert.ok(JSON.stringify(offers).length <= 1500, 'offers payload stays compact');
    assert.ok(offers.offers.every(offer => !('merchant_url' in offer)));
    assert.ok(offers.offers.some(offer => offer.shipping_eur === null && offer.delivered_price_eur === null));
    const history = await tools.find(tool => tool.name === 'summarize_price_history').execute({});
    assert.equal(history.ok, true);
    assert.equal(history.product_id, productId);
  });

  it('filters and sorts with the labels the listing renders', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const filters = await adapter.execute('get_listing_filters', {});
    assert.equal(filters.filters[0].name, BRAND_FILTER);

    assert.deepEqual(await adapter.execute('apply_listing_filter', { filter: 'brand', value: 'samsung' }), {
      ok: true,
      action: 'applied_filter',
      filter: BRAND_FILTER,
      value: 'Samsung',
    });
    assert.deepEqual(
      adapter.snapshot().products.map(product => product.brand),
      ['Samsung'],
    );

    await adapter.execute('clear_listing_filters', {});
    await adapter.execute('apply_listing_sort', { sort: SORT_OPTIONS[1] });
    const prices = adapter.snapshot().products.map(product => product.current_min_price_eur);
    assert.deepEqual(
      prices,
      [...prices].sort((a, b) => a - b),
    );
  });

  it('refuses to open a hidden or invented listing product', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const result = await adapter.execute('open_visible_product', { product_id: '9999999999' });
    assert.deepEqual(result, {
      ok: false,
      error: 'Product 9999999999 is not currently visible on this page.',
    });
  });

  it('rejects malformed arguments before running a handler', async () => {
    const adapter = createDemoAdapter();
    const cases = [
      [['search_bestprice', null], 'Arguments must be a JSON object.'],
      [['search_bestprice', []], 'Arguments must be a JSON object.'],
      [['search_bestprice', { query: 'tv', extra: 1 }], 'Unexpected argument: extra.'],
      [['search_bestprice', { query: 'x' }], 'query must contain 2 to 120 characters.'],
      [['get_visible_products', { limit: 0 }], 'limit must be a whole number from 1 to 8.'],
      [['get_visible_products', { limit: 9 }], 'limit must be a whole number from 1 to 8.'],
      [['compare_page_offers', { limit: 1.5 }], 'limit must be a whole number from 1 to 4.'],
      [['get_product_specifications', { limit: 17 }], 'limit must be a whole number from 1 to 16.'],
      [
        ['apply_listing_filter', { filter: 'price', value: '100' }],
        `Only the visible '${BRAND_FILTER}' filter is available on this page.`,
      ],
      [
        ['apply_listing_filter', { filter: 'brand', value: 'Nokia' }],
        "The visible value 'Nokia' was not found.",
      ],
      [['apply_listing_sort', { sort: 'Newest' }], "The sorting option 'Newest' was not found."],
      [['get_product_specifications', { section: 'Battery' }], "No specifications matched 'Battery'."],
      [['place_order', {}], 'Unknown tool: place_order.'],
    ];
    for (const [[name, args], error] of cases) {
      assert.deepEqual(
        await adapter.execute(name, args),
        { ok: false, error },
        `${name} ${JSON.stringify(args)}`,
      );
    }
    assert.equal(adapter.snapshot().page, 'home', 'rejected calls leave the page untouched');
  });

  it('strips control characters from free text and matches sections accent-insensitively', async () => {
    const adapter = createDemoAdapter();
    const result = await adapter.execute('search_bestprice', { query: 'pho\u0007ne' });
    assert.equal(result.query, 'pho ne');
    const specs = await adapter.execute('get_product_specifications', { section: 'οθονη', limit: 1 });
    assert.equal(specs.returned, 1);
    assert.equal(specs.specifications[0].section, 'Οθόνη');
  });

  it('only switches to known pages', () => {
    const adapter = createDemoAdapter();
    for (const page of PAGES) adapter.setPage(page);
    assert.throws(() => adapter.setPage('checkout'), /Unknown page: checkout/u);
  });
});
