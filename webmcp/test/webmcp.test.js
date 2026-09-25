import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';

import {
  createTools,
  PAGE_TOOL_NAMES,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  WEBMCP_CONTRACT_VERSION,
} from '../src/contracts.js';
import {
  BRAND_FILTER,
  CONFIRMED_NOTE,
  createDemoAdapter,
  PAGES,
  productUrl,
  SORT_OPTIONS,
} from '../src/demo-adapter.js';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const noop = () => ({ ok: true });
/* The results_url the demo's search for «phone» returns (contract 2.2: open_search_results opens it). */
const PHONE_RESULTS = 'https://www.bestprice.gr/search?q=phone';
/* The storefront's own bounds on a tool description (bestprice.gr js/modules/webmcp/tool-catalog.js
 * MIN_/MAX_DESCRIPTION_LENGTH, and output-schemas.test.js' field bound, which a tool description meets
 * too). Contract 2.1: one short plain sentence — what the tool does and its scope — naming no tool. */
const DESCRIPTION_LENGTH = Object.freeze({ min: 40, max: 160, field: 110 });

describe('contracts', () => {
  it('publishes 15 unique contextual tools across four page types (contract 2.2)', () => {
    assert.equal(WEBMCP_CONTRACT_VERSION, '2.2');
    /* Contract 2.2: open_search_results opens one thing, the results_url a search returned. */
    assert.deepEqual(TOOL_DEFINITIONS.open_search_results.inputSchema.required, ['results_url']);
    assert.deepEqual(Object.keys(TOOL_DEFINITIONS.open_search_results.inputSchema.properties), [
      'results_url',
    ]);
    assert.equal(TOOL_NAMES.length, 15);
    assert.deepEqual(new Set(Object.values(PAGE_TOOL_NAMES).flat()), new Set(TOOL_NAMES));
    /* Search first, the Shopping Brain last, on every page; the home page browses its sections. */
    assert.deepEqual(PAGE_TOOL_NAMES.home, [
      'search_bestprice',
      'open_search_results',
      'get_visible_products',
      'open_product',
      'get_shopping_decision',
    ]);
    assert.equal(PAGE_TOOL_NAMES.listing.length, 10);
    assert.equal(PAGE_TOOL_NAMES.product.length, 9);
    /* Every other public page: search, its results in the tab, a product by id, and the Shopping Brain. */
    assert.deepEqual(PAGE_TOOL_NAMES.site, [
      'search_bestprice',
      'open_search_results',
      'open_product',
      'get_shopping_decision',
    ]);
    /* Contract 2.1: every tool reads or acts. The search that shows its results, and the product that
     * opens by id, are on every page; loading more results only on listings, right after reading them. */
    for (const tool of ['open_search_results', 'open_product']) {
      assert.deepEqual(
        Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes(tool)),
        ['home', 'listing', 'product', 'site'],
        tool,
      );
    }
    for (const names of Object.values(PAGE_TOOL_NAMES)) assert.equal(names[1], 'open_search_results');
    assert.deepEqual(
      Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes('load_more_products')),
      ['listing'],
    );
    assert.equal(
      PAGE_TOOL_NAMES.listing[PAGE_TOOL_NAMES.listing.indexOf('get_visible_products') + 1],
      'load_more_products',
    );
    /* Contract 2.0 removed four tools; none is published anywhere. */
    for (const removed of [
      'get_product_details',
      'open_visible_product',
      'show_price_history',
      'get_listing_sort_options',
    ]) {
      assert.equal(TOOL_NAMES.includes(removed), false, removed);
    }
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
        assert.ok(tool.description.length <= DESCRIPTION_LENGTH.field, tool.name);
        /* One plain sentence: what it does (a verb) and its scope, no Greek labels. A read says it
         * changes nothing; an action never does (contract 2.1). */
        assert.match(tool.description, /^[A-Z][a-z]+s [^.]+\.$/u, tool.name);
        assert.doesNotMatch(tool.description, /[«»]/u, tool.name);
        assert.equal(
          /; changes nothing\.$/u.test(tool.description),
          tool.annotations.readOnlyHint === true,
          `${tool.name} says whether it reads`,
        );
        /* Every tool says it is not consequential and that its results are untrusted content; a tool
         * that changes the page also says it is not destructive and stays on BestPrice. */
        assert.equal(typeof tool.annotations.readOnlyHint, 'boolean', tool.name);
        assert.equal(tool.annotations.consequentialHint, false, tool.name);
        assert.equal(tool.annotations.untrustedContentHint, true, tool.name);
        if (!tool.annotations.readOnlyHint) {
          assert.equal(tool.annotations.destructiveHint, false, tool.name);
          /* load_more_products appends the next result page on every call. */
          assert.equal(tool.annotations.idempotentHint, tool.name !== 'load_more_products', tool.name);
          assert.equal(tool.annotations.openWorldHint, false, tool.name);
        }
        assert.equal(tool.inputSchema.additionalProperties, false);
        for (const property of Object.values(tool.inputSchema.properties)) {
          assert.ok(property.description?.length > 0, tool.name);
          assert.ok(property.description.length <= DESCRIPTION_LENGTH.field, tool.name);
        }
        assert.equal(tool.outputSchema.type, 'object', tool.name);
        assert.equal(tool.outputSchema.oneOf.length, 2, tool.name);
      }
    }
  });

  it('names no other tool in a description, with one wording on every page', () => {
    /* Contract 2.1 (the storefront's output-schemas and tool-mentions tests): 2.0's one exception,
     * search_bestprice and get_shopping_decision naming each other, is gone too. */
    const mentioned = (text, self) =>
      TOOL_NAMES.filter(name => name !== self && new RegExp(`(?<![a-z_])${name}(?![a-z_])`, 'u').test(text));
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: noop })) {
        assert.deepEqual(mentioned(tool.description, tool.name), [], `${page}: ${tool.name}`);
        assert.equal(tool.description, TOOL_DEFINITIONS[tool.name].description, 'one wording on every page');
      }
    }
    assert.ok(Object.values(TOOL_DEFINITIONS).every(definition => !definition.pageDescriptions));
  });

  it('marks page-changing tools as not read-only and reading tools as read-only', () => {
    const tools = new Map(createTools({ page: 'listing', execute: noop }).map(tool => [tool.name, tool]));
    /* Contract 2.0: open_product reads the product page, then moves the tab there. */
    assert.equal(tools.get('open_product').annotations.readOnlyHint, false);
    assert.equal(tools.get('open_product').annotations.idempotentHint, true);
    /* Contract 2.1: every tool reads or acts. Reading the cards changes nothing; loading the next
     * result page is its own action, and each call loads another one. */
    assert.equal(tools.get('get_visible_products').annotations.readOnlyHint, true);
    assert.equal(tools.get('load_more_products').annotations.readOnlyHint, false);
    assert.equal(tools.get('load_more_products').annotations.idempotentHint, false);
    /* ... and searching reads, while showing the results moves the tab. */
    assert.equal(tools.get('search_bestprice').annotations.readOnlyHint, true);
    assert.equal(tools.get('open_search_results').annotations.readOnlyHint, false);
    assert.equal(tools.get('get_listing_filters').annotations.readOnlyHint, true);

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
     * page calls exact is invalid here. Revision 2026-09-25.12 publishes offer_ref and merchant_name
     * only. Parity with the storefront is asserted field by field in `contract-parity.test.js`. */
    assert.deepEqual(Object.keys(showOffer.inputSchema.properties).sort(), ['merchant_name', 'offer_ref']);
    assert.equal(showOffer.inputSchema.additionalProperties, false);
    /* show_chart opens the chart the shopper sees (since contract 2.0 the only way to); the other
     * item-page reads stay reads. */
    assert.equal(productTools.get('summarize_price_history').annotations.readOnlyHint, false);
    for (const name of ['get_page_product', 'compare_page_offers', 'get_product_specifications']) {
      assert.equal(productTools.get(name).annotations.readOnlyHint, true, name);
    }

    /* Contract 2.1: searching only reads; the Shopping Brain only reads. */
    assert.equal(productTools.get('search_bestprice').annotations.readOnlyHint, true);
    assert.equal(productTools.get('get_shopping_decision').annotations.readOnlyHint, true);
    assert.equal(productTools.get('get_shopping_decision').annotations.openWorldHint, false);
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
        if (tool.name === 'open_product') throw new Error('unsupported');
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
    assert.deepEqual(await second, { status: 'ready', registered: 9 });
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
    /* Contract 2.1: the search reads its results and the tab stays; open_search_results shows them. */
    const search = await tools[0].execute({ query: 'phone' });
    assert.equal(search.ok, true);
    assert.equal(search.source, 'BestPrice search results');
    assert.equal(search.query, 'phone');
    assert.deepEqual([search.results_kind, search.returned, 'navigated' in search], ['listing', 3, false]);
    assert.equal(adapter.snapshot().page, 'home');
    /* Contract 2.2: it opens the results_url the search returned. */
    assert.equal(search.results_url, PHONE_RESULTS);
    const shown = await tools[1].execute({ results_url: search.results_url });
    assert.deepEqual(
      [shown.outcome, shown.results_kind, 'products' in shown],
      ['confirmed', 'listing', false],
    );
    assert.equal(adapter.snapshot().page, 'listing');

    tools = createTools({ page: 'listing', execute: adapter.execute });
    const listing = await tools.find(tool => tool.name === 'get_visible_products').execute({ limit: 3 });
    assert.equal(listing.ok, true);
    assert.equal(listing.returned, 3);
    assert.ok(JSON.stringify(listing).length <= 1500, 'listing payload stays compact');
    /* Contract 1.7: a list read does not repeat product links; opening by id returns the landing. */
    assert.ok(listing.products.every(product => !('bestprice_url' in product)));
    const productId = listing.products[0].product_id;
    const opened = await tools.find(tool => tool.name === 'open_product').execute({ product_id: productId });
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

    /* Revision 2026-09-25.12: one of offer_ref or merchant_name, enforced by the tool (no anyOf). */
    assert.deepEqual(await adapter.execute('show_offer', {}), {
      ok: false,
      error: 'Pass offer_ref (from compare_page_offers) or, failing that, merchant_name.',
      reason: 'invalid_argument',
    });
    assert.deepEqual(await adapter.execute('show_offer', { merchant_name: 'Invented Merchant' }), {
      ok: false,
      error: 'That merchant is not currently shown on this page.',
    });
    /* merchant_id is no longer published, so the demo — which takes what the contract publishes —
     * refuses it rather than guess. */
    assert.deepEqual(await adapter.execute('show_offer', { merchant_id: '42' }), {
      ok: false,
      error: 'Unexpected argument: merchant_id.',
    });
    /* A name alongside a reference must describe the same offer. */
    const [first, second] = (await adapter.execute('compare_page_offers', { limit: 2 })).offers;
    assert.deepEqual(
      await adapter.execute('show_offer', { offer_ref: first.offer_ref, merchant_name: second.merchant }),
      { ok: false, error: 'offer_ref and merchant_name do not describe the same shown offer.' },
    );
    assert.equal(adapter.snapshot().focusedOffer, null, 'a refused call focuses nothing');
    const agreed = await adapter.execute('show_offer', {
      offer_ref: first.offer_ref,
      merchant_name: first.merchant,
    });
    assert.equal(agreed.action, 'focused_offer');
  });

  it('filters and sorts with the labels the listing renders', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('open_search_results', { results_url: PHONE_RESULTS });
    const filters = await adapter.execute('get_listing_filters', {});
    assert.equal(filters.filters[0].name, BRAND_FILTER);

    /* The listing reloads after the tool has answered. Revision 2026-09-25.12: the destination is read
     * first, so the answer states what that page shows (`confirmed`) and needs no follow-up read.
     * Contract 2.1: a receipt, whose one status field is `outcome`. */
    const url = 'https://www.bestprice.gr/search?q=phone&brand=Samsung';
    assert.deepEqual(await adapter.execute('apply_listing_filter', { filter: 'brand', value: 'samsung' }), {
      ok: true,
      outcome: 'confirmed',
      filter: BRAND_FILTER,
      value: 'Samsung',
      destination_url: url,
      next_tools: PAGE_TOOL_NAMES.listing.slice(2, -1),
      destination: {
        url,
        total_results: 1,
        applied_filters: ['Samsung'],
        sort: 'relevance',
        products: [
          {
            product_id: '2159922965',
            title: 'Samsung Galaxy S24 256GB',
            current_min_price_eur: 689,
            merchant_count: 14,
          },
        ],
      },
      note: CONFIRMED_NOTE,
    });
    assert.deepEqual(
      adapter.snapshot().products.map(product => product.brand),
      ['Samsung'],
    );

    /* The same value again changes nothing: `unchanged` (contract 2.1). */
    assert.deepEqual(await adapter.execute('apply_listing_filter', { filter: 'brand', value: 'Samsung' }), {
      ok: true,
      outcome: 'unchanged',
      filter: BRAND_FILTER,
      value: 'Samsung',
      note: 'That value is already applied; nothing changed.',
    });
    /* One filter, or one selected value of it; a value not selected is already clear. */
    assert.deepEqual(await adapter.execute('clear_listing_filters', { filter: 'brand', value: 'Apple' }), {
      ok: true,
      outcome: 'unchanged',
      filter: BRAND_FILTER,
      value: 'Apple',
      note: 'That value is not selected; nothing changed.',
    });
    assert.deepEqual(await adapter.execute('clear_listing_filters', { value: 'Samsung' }), {
      ok: false,
      error: 'value must come with its filter.',
      reason: 'invalid_argument',
    });
    const removed = await adapter.execute('clear_listing_filters', {
      filter: BRAND_FILTER,
      value: 'samsung',
    });
    assert.deepEqual(
      [removed.value, removed.outcome, removed.destination.applied_filters, 'action' in removed],
      ['Samsung', 'confirmed', [], false],
    );
    assert.equal(adapter.snapshot().brand, null);
    assert.deepEqual(await adapter.execute('clear_listing_filters', {}), {
      ok: true,
      outcome: 'unchanged',
      note: 'Nothing is filtered; nothing changed.',
    });

    /* Contract 2.0: the filters read carries the sort options, each with the key search_bestprice
     * sorts by, which apply_listing_sort takes, and the active sort. */
    const read = await adapter.execute('get_listing_filters', {});
    assert.equal(read.sort, 'relevance');
    assert.deepEqual(read.sort_options, [
      { name: SORT_OPTIONS[0], key: 'relevance', selected: true },
      { name: SORT_OPTIONS[1], key: 'price_asc', selected: false },
    ]);
    /* One filter group read in full is about that group alone. */
    assert.equal('sort_options' in (await adapter.execute('get_listing_filters', { group: 'brand' })), false);
    const sorted = await adapter.execute('apply_listing_sort', { sort: 'price_asc' });
    assert.deepEqual(
      [sorted.outcome, sorted.sort, sorted.destination.sort],
      ['confirmed', SORT_OPTIONS[1], 'price_asc'],
    );
    assert.deepEqual(await adapter.execute('apply_listing_sort', { sort: 'Φθηνότερα' }), {
      ok: true,
      outcome: 'unchanged',
      sort: SORT_OPTIONS[1],
      note: 'That sort is already applied; nothing changed.',
    });
    const prices = adapter.snapshot().products.map(product => product.current_min_price_eur);
    assert.deepEqual(
      prices,
      [...prices].sort((a, b) => a - b),
    );
    assert.deepEqual(
      sorted.destination.products.map(product => product.current_min_price_eur),
      prices.slice(0, 3),
      'the destination is what the tab then shows',
    );
    /* ... and a label, as before. */
    const relabelled = await adapter.execute('apply_listing_sort', { sort: SORT_OPTIONS[0] });
    assert.equal(relabelled.destination.sort, 'relevance');
  });

  it('falls back to dispatched, with why, when the destination cannot be read first', async () => {
    const unreadable = Object.assign(new Error('late'), { reason: 'timeout' });
    const adapter = createDemoAdapter(() => {}, {
      readDestination: () => {
        throw unreadable;
      },
    });
    await adapter.execute('open_search_results', { results_url: PHONE_RESULTS });
    /* A receipt (contract 2.1): outcome is the one status field. */
    assert.deepEqual(await adapter.execute('apply_listing_filter', { filter: 'brand', value: 'Apple' }), {
      ok: true,
      outcome: 'dispatched',
      filter: BRAND_FILTER,
      value: 'Apple',
      destination_url: 'https://www.bestprice.gr/search?q=phone&brand=Apple',
      next_tools: PAGE_TOOL_NAMES.listing.slice(2, -1),
      unconfirmed_reason: 'timeout',
      note: 'The listing started that change; read the page again to confirm the filtered result.',
    });
    const productId = adapter.snapshot().products[0].product_id;
    const opened = await adapter.execute('open_product', { product_id: productId });
    assert.deepEqual(opened, {
      ok: true,
      outcome: 'dispatched',
      product_id: productId,
      bestprice_url: productUrl(productId),
      unconfirmed_reason: 'timeout',
      next_tools: PAGE_TOOL_NAMES.product.slice(2, -1),
      note: 'The product page could not be read first; call get_page_product there to read it.',
    });
    /* The tab still moves once the answer is out. */
    await Promise.resolve();
    assert.equal(adapter.snapshot().page, 'product');
  });

  it('opens any product by id with a receipt, confirmed before the tab moves (contract 2.1)', async () => {
    const adapter = createDemoAdapter();
    /* From the home page, a product no listing shows: open_product takes any id. */
    const opened = await adapter.execute('open_product', { product_id: '2160384659' });
    assert.deepEqual(opened, {
      ok: true,
      outcome: 'confirmed',
      product_id: '2160384659',
      title: 'Google Pixel 9 128GB',
      bestprice_url: productUrl('2160384659'),
      next_tools: PAGE_TOOL_NAMES.product.slice(2, -1),
      note: 'Confirmed from the product page before the tab moved there; there, get_page_product reads its price, stores and rating.',
    });
    /* The receipt names what it confirmed; the product page's own read has the facts. */
    const facts = await adapter.execute('get_page_product', {});
    assert.deepEqual([facts.product_id, facts.title], [opened.product_id, opened.title]);
    assert.equal(typeof facts.current_min_price_eur, 'number');
    /* The tab moves once the answer is out (demo-output.test.js checks the order). */
    assert.deepEqual(
      [adapter.snapshot().page, adapter.snapshot().product.product_id],
      ['product', '2160384659'],
    );
  });

  it('refuses an unknown product or a single-store offer, and leaves the tab where it is', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('open_search_results', { results_url: PHONE_RESULTS });
    assert.deepEqual(await adapter.execute('open_product', { product_id: '9999999999' }), {
      ok: false,
      error: 'BestPrice has no product page for product_id 9999999999.',
      reason: 'not_found',
    });
    /* An id below 2^31 is one store's own product: never fetched, never opened. */
    const storeOffer = await adapter.execute('open_product', { product_id: '2147483647' });
    assert.deepEqual([storeOffer.ok, storeOffer.reason], [false, 'store_offer']);
    assert.deepEqual(await adapter.execute('open_product', { product_id: 'bp_2159919913' }), {
      ok: false,
      error: (await adapter.execute('open_product', { product_id: 'bp_2159919913' })).error,
      reason: 'invalid_argument',
    });
    assert.equal(adapter.snapshot().page, 'listing', 'a refused open moves nothing');
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
      [['compare_page_offers', { limit: 1.5 }], 'limit must be a whole number from 1 to 12.'],
      [['compare_page_offers', { offset: -1 }], 'offset must be a whole number from 0.'],
      [['get_product_specifications', { limit: 17 }], 'limit must be a whole number from 1 to 16.'],
      [
        ['apply_listing_filter', { filter: 'price', value: '100' }],
        `Only the visible '${BRAND_FILTER}' filter is available on this page.`,
      ],
      [
        ['apply_listing_filter', { filter: 'brand', value: 'Nokia' }],
        "The visible value 'Nokia' was not found.",
      ],
      [
        ['apply_listing_sort', { sort: 'Newest' }],
        `The sorting option 'Newest' was not found. Visible options: ${SORT_OPTIONS[0]} (relevance), ${SORT_OPTIONS[1]} (price_asc).`,
      ],
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
  await adapter.execute('open_search_results', { results_url: PHONE_RESULTS });
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
