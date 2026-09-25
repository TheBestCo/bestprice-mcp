import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';

import {
  createTools,
  PAGE_TOOL_NAMES,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  WEBMCP_CONTRACT_VERSION,
} from '../src/contracts.js';
import { BRAND_FILTER, createDemoAdapter, PAGES, SORT_OPTIONS } from '../src/demo-adapter.js';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const noop = () => ({ ok: true });
/* The storefront's own bound on a tool description (bestprice.gr js/modules/webmcp/tool-catalog.js
 * MIN_/MAX_DESCRIPTION_LENGTH, pinned by output-schemas.test.js): one scannable shape — what it does,
 * what it returns, when to use it and when not, what it changes — with the details in the schemas. */
const DESCRIPTION_LENGTH = Object.freeze({ min: 60, max: 250 });

describe('contracts', () => {
  it('publishes 16 unique contextual tools across four page types (contract 1.9)', () => {
    assert.equal(WEBMCP_CONTRACT_VERSION, '1.9');
    assert.equal(TOOL_NAMES.length, 16);
    assert.deepEqual(new Set(Object.values(PAGE_TOOL_NAMES).flat()), new Set(TOOL_NAMES));
    /* Search first, the Shopping Brain last, on every page; the home page browses its sections. */
    assert.deepEqual(PAGE_TOOL_NAMES.home, [
      'search_bestprice',
      'get_visible_products',
      'open_visible_product',
      'get_product_details',
      'get_shopping_decision',
    ]);
    assert.equal(PAGE_TOOL_NAMES.listing.length, 10);
    assert.equal(PAGE_TOOL_NAMES.product.length, 8);
    /* Every other public page: search, one product's details, and the Shopping Brain. */
    assert.deepEqual(PAGE_TOOL_NAMES.site, [
      'search_bestprice',
      'get_product_details',
      'get_shopping_decision',
    ]);
    /* The item page's own tools cover the product in view; the details tool is everywhere else. */
    assert.deepEqual(
      Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes('get_product_details')),
      ['home', 'listing', 'site'],
    );
    for (const names of Object.values(PAGE_TOOL_NAMES)) {
      assert.equal(names[0], 'search_bestprice');
      assert.equal(names.at(-1), 'get_shopping_decision');
    }
    assert.ok(Object.isFrozen(PAGE_TOOL_NAMES.listing));
    assert.ok(Object.isFrozen(TOOL_DEFINITIONS.get_shopping_decision.outputSchema));
  });

  it('keeps every contract within the storefront limits and annotates it explicitly', () => {
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: noop })) {
        assert.ok(tool.name.length <= 30);
        assert.ok(tool.title);
        assert.ok(tool.description.length >= DESCRIPTION_LENGTH.min, tool.name);
        assert.ok(tool.description.length <= DESCRIPTION_LENGTH.max, tool.name);
        /* Every tool says it is not consequential and that its results are untrusted content; a tool
         * that changes the page also says it is not destructive and stays on BestPrice. */
        assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', tool.name);
        assert.equal(tool.annotations.consequentialHint, false, tool.name);
        assert.equal(tool.annotations.untrustedContentHint, true, tool.name);
        if (!tool.annotations.readOnlyHint) {
          assert.equal(tool.annotations.destructiveHint, false, tool.name);
          assert.equal(tool.annotations.idempotentHint, true, tool.name);
          assert.equal(tool.annotations.openWorldHint, false, tool.name);
        }
        assert.equal(tool.inputSchema.additionalProperties, false);
        for (const property of Object.values(tool.inputSchema.properties)) {
          assert.ok(property.description?.length > 0, tool.name);
        }
        assert.equal(tool.outputSchema.type, 'object', tool.name);
        assert.equal(tool.outputSchema.oneOf.length, 2, tool.name);
      }
    }
  });

  it('names, in any page’s wording, only tools that page registers', () => {
    /* Contract 1.9 (the storefront's tool-mentions test): the item page has no get_product_details, so
     * the two tools it shares with every page register its own wording there. */
    const mentioned = text =>
      TOOL_NAMES.filter(name => new RegExp(`(?<![a-z_])${name}(?![a-z_])`, 'u').test(text));
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: noop })) {
        for (const name of mentioned(tool.description)) {
          assert.ok(PAGE_TOOL_NAMES[page].includes(name), `${page}: ${tool.name} names ${name}`);
        }
      }
    }
    const product = new Map(createTools({ page: 'product', execute: noop }).map(tool => [tool.name, tool]));
    assert.equal(
      product.get('search_bestprice').description,
      TOOL_DEFINITIONS.search_bestprice.pageDescriptions.product,
    );
    assert.notEqual(
      product.get('search_bestprice').description,
      TOOL_DEFINITIONS.search_bestprice.description,
    );
  });

  it('marks page-changing tools as not read-only and reading tools as read-only', () => {
    const tools = new Map(createTools({ page: 'listing', execute: noop }).map(tool => [tool.name, tool]));
    assert.equal(tools.get('open_visible_product').annotations.readOnlyHint, false);
    assert.equal(tools.get('get_visible_products').annotations.readOnlyHint, true);

    /* The item page's one action verb: it moves the shopper's own tab to an offer
     * the page already shows and never returns a merchant link. */
    const productTools = new Map(
      createTools({ page: 'product', execute: noop }).map(tool => [tool.name, tool]),
    );
    const showOffer = productTools.get('show_offer');
    assert.equal(showOffer.annotations.readOnlyHint, false);
    assert.equal(showOffer.annotations.openWorldHint, false);
    /* The item page has returned an `offer_ref` since the action verb landed and tells the agent to
     * prefer it; the published contract has to advertise the same selector set, or a reference the
     * page calls exact is invalid here. Parity with the storefront is asserted field by field in
     * `contract-parity.test.js`. */
    assert.deepEqual(Object.keys(showOffer.inputSchema.properties).sort(), [
      'merchant_id',
      'merchant_name',
      'offer_ref',
    ]);
    assert.equal(showOffer.inputSchema.additionalProperties, false);
    assert.equal(productTools.get('show_price_history').annotations.readOnlyHint, false);

    /* Contract 1.8: searching moves the tab unless told not to; the Shopping Brain only reads. */
    assert.equal(productTools.get('search_bestprice').annotations.readOnlyHint, false);
    assert.equal(productTools.get('get_shopping_decision').annotations.readOnlyHint, true);
    assert.equal(productTools.get('get_shopping_decision').annotations.openWorldHint, false);

    /* Contract 1.9: get_product_details can move the tab to the product (navigate), so it is not a read. */
    const listing = new Map(createTools({ page: 'listing', execute: noop }).map(tool => [tool.name, tool]));
    assert.equal(listing.get('get_product_details').annotations.readOnlyHint, false);
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
    assert.equal(signals.length, 10);
    assert.ok(signals.every(signal => signal.aborted));
    assert.deepEqual(states.at(-1), { status: 'degraded', registered: 0 });
  });

  it('reports ready when every tool registers', async () => {
    const modelContext = createLocalModelContext();
    const states = [];
    const registration = createRegistration({ modelContext, onState: state => states.push(state) });
    assert.deepEqual(await registration.register(listingTools()), { status: 'ready', registered: 10 });
    assert.equal(modelContext.tools.size, 10);
    /* What the page registers is the whole published contract, output schema included. */
    const registered = modelContext.tools.get('get_shopping_decision');
    for (const field of ['title', 'description', 'annotations', 'inputSchema', 'outputSchema']) {
      assert.equal(registered[field], TOOL_DEFINITIONS.get_shopping_decision[field], field);
    }
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
    assert.deepEqual(await second, { status: 'ready', registered: 8 });
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
    /* Contract 1.8: the search answers with its results, then shows them. */
    const search = await tools[0].execute({ query: 'phone' });
    assert.equal(search.ok, true);
    assert.equal(search.source, 'BestPrice search results');
    assert.equal(search.query, 'phone');
    assert.deepEqual([search.results_kind, search.returned, search.navigated], ['listing', 3, true]);
    assert.equal(adapter.snapshot().page, 'listing');

    tools = createTools({ page: 'listing', execute: adapter.execute });
    const listing = await tools.find(tool => tool.name === 'get_visible_products').execute({ limit: 3 });
    assert.equal(listing.ok, true);
    assert.equal(listing.returned, 3);
    assert.ok(JSON.stringify(listing).length <= 1500, 'listing payload stays compact');
    /* Contract 1.7: a list read does not repeat product links; opening by id returns the landing. */
    assert.ok(listing.products.every(product => !('bestprice_url' in product)));
    const productId = listing.products[0].product_id;
    const opened = await tools
      .find(tool => tool.name === 'open_visible_product')
      .execute({ product_id: productId });
    assert.equal(opened.ok, true);
    assert.ok(opened.bestprice_url.endsWith('?bpref=mcp'));
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

    /* The action verb focuses only an offer compare_page_offers already returned. */
    const focused = await tools
      .find(tool => tool.name === 'show_offer')
      .execute({ merchant_name: offers.offers[0].merchant });
    assert.equal(focused.ok, true);
    assert.equal(focused.action, 'focused_offer');
    assert.equal(focused.offer.merchant, offers.offers[0].merchant);
    assert.ok(!('merchant_url' in focused.offer));
    assert.equal(adapter.snapshot().focusedOffer, offers.offers[0].merchant);
  });

  it('refuses to focus an offer the page does not show', async () => {
    const adapter = createDemoAdapter();
    adapter.setPage('product');

    assert.deepEqual(await adapter.execute('show_offer', {}), {
      ok: false,
      error: 'Provide offer_ref from compare_page_offers, or merchant_name.',
    });
    assert.deepEqual(await adapter.execute('show_offer', { merchant_name: 'Invented Merchant' }), {
      ok: false,
      error: 'That merchant is not currently shown on this page.',
    });
    assert.deepEqual(await adapter.execute('show_offer', { merchant_id: 'not-a-number' }), {
      ok: false,
      error: 'merchant_id must be the numeric id shown on this page.',
    });
    /* The fixture exposes no merchant ids, exactly like compare_page_offers output,
     * so an id-only call cannot resolve and must refuse rather than guess. */
    assert.deepEqual(await adapter.execute('show_offer', { merchant_id: '42' }), {
      ok: false,
      error: 'That merchant is not currently shown on this page.',
    });
    assert.equal(adapter.snapshot().focusedOffer, null, 'a refused call focuses nothing');
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
      applied: true,
      dispatched: true,
      outcome: 'observed_complete',
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

/* Contract 1.7: every bounded read the storefront pages continues through next_offset. */
test('the demo adapter continues listing, filter and specification reads with offset', async () => {
  const adapter = createDemoAdapter();
  await adapter.execute('search_bestprice', { query: 'phone' });
  const first = await adapter.execute('get_visible_products', { limit: 2 });
  assert.deepEqual([first.returned, first.offset, first.next_offset], [2, 0, 2]);
  const rest = await adapter.execute('get_visible_products', { limit: 2, offset: first.next_offset });
  assert.deepEqual([rest.returned, rest.next_offset, rest.completeness], [1, null, 'complete']);
  assert.equal((await adapter.execute('get_visible_products', { offset: 3 })).ok, false);

  const brand = await adapter.execute('get_listing_filters', { group: 'brand' });
  assert.equal(brand.filters[0].available_values.length, brand.total_values);
  assert.equal((await adapter.execute('get_listing_filters', { group: 'Missing' })).ok, false);

  adapter.setPage('product');
  const specs = await adapter.execute('get_product_specifications', { limit: 2 });
  assert.equal(specs.next_offset, 2);
  const more = await adapter.execute('get_product_specifications', { limit: 2, offset: 2 });
  assert.equal(more.returned, 1);
  assert.equal(
    (await adapter.execute('get_product_specifications', { fact: 'Μέγεθος', offset: 1 })).ok,
    false,
  );
  const offers = await adapter.execute('compare_page_offers', { include_all_stores: true });
  assert.equal(offers.stores_considered, offers.stores_total);
});

/* Contract 1.6 (audit pass 8, F06): one fact in full, by the name a previous call returned. */
test('the demo adapter reads one named fact and refuses a name it does not show', async () => {
  const adapter = createDemoAdapter();
  adapter.setPage('product');
  const size = await adapter.execute('get_product_specifications', { fact: 'Μέγεθος' });
  assert.equal(size.ok, true);
  assert.deepEqual(
    size.specifications.map(row => row.name),
    ['Μέγεθος'],
  );
  assert.equal((await adapter.execute('get_product_specifications', { fact: 'Missing' })).ok, false);
});
