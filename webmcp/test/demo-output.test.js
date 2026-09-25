/**
 * Since contract 1.8 every tool publishes an output schema. The demo adapter is what this repository
 * shows a result to be, so every result it returns — successes and refusals, on every page — must be
 * one its tool's published schema admits, checked with the same strict subset the storefront uses.
 *
 * Since registration revision 2026-09-25.9 the published schemas are a lean projection of the
 * storefront's strict contract (closed and bounded): only constraints are removed. Every result is
 * checked against both, so a published schema made lean never makes these tests lenient.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createTools, PAGE_TOOL_NAMES, TOOL_DEFINITIONS, TOOL_NAMES } from '../src/contracts.js';
import {
  createDemoAdapter,
  DECISION_NOTE,
  DETAIL_SECTIONS,
  HOME_SECTION,
  offerRef,
  readFixtureSection,
} from '../src/demo-adapter.js';
import { ANNOTATIONS, KEYWORDS, validate } from './helpers/output-schema-check.js';

const STRICT = JSON.parse(
  readFileSync(new URL('./fixtures/storefront-strict-output-schemas.json', import.meta.url), 'utf8'),
).schemas;
/* What the storefront's lean projection keeps of a schema (output-schemas.js `publishable`). */
const PUBLISHED_KEYWORDS = new Set([
  'type',
  'const',
  'enum',
  'pattern',
  'required',
  'description',
  'properties',
  'items',
  'oneOf',
  'anyOf',
]);

/** Tools for the adapter's current page, each result checked against its published and strict schemas. */
const recorder = adapter => {
  const calls = [];
  const call = async (name, args = {}, options) => {
    const tool = createTools({ page: adapter.snapshot().page, execute: adapter.execute }).find(
      candidate => candidate.name === name,
    );
    assert.ok(tool, `${name} is not registered on the ${adapter.snapshot().page} page`);
    const result = await tool.execute(args, options);
    const payload = JSON.parse(JSON.stringify(result));
    const errors = [...validate(STRICT[name], payload), ...validate(tool.outputSchema, payload)];
    calls.push({ name, ok: result.ok, errors });
    assert.deepEqual(errors, [], `${name} ${JSON.stringify(args)} -> ${JSON.stringify(result)}`);
    return result;
  };
  return { call, calls };
};

const walkSchema = (schema, path, visit) => {
  visit(schema, path);
  for (const [key, child] of Object.entries(schema.properties ?? {}))
    walkSchema(child, `${path}.${key}`, visit);
  if (schema.items) walkSchema(schema.items, `${path}[]`, visit);
  for (const [index, branch] of [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])].entries()) {
    walkSchema(branch, `${path}|${index}`, visit);
  }
};

describe('demo results against the published output schemas', () => {
  it('validates against a strict contract, closed on both outcomes, and publishes its lean projection', () => {
    for (const name of TOOL_NAMES) {
      const strict = STRICT[name];
      walkSchema(strict, name, (node, path) => {
        for (const key of Object.keys(node)) {
          assert.ok(KEYWORDS.has(key) || ANNOTATIONS.has(key), `${path}: ${key}`);
        }
      });
      assert.deepEqual(
        strict.oneOf.map(branch => [branch.title, branch.properties.ok.const, branch.additionalProperties]),
        [
          ['Success', true, false],
          ['Refusal', false, false],
        ],
        name,
      );
      /* The published schema keeps the success/refusal split, and only the keywords a lean copy keeps. */
      const published = TOOL_DEFINITIONS[name].outputSchema;
      assert.deepEqual(
        published.oneOf.map(branch => branch.properties.ok.const),
        [true, false],
        name,
      );
      walkSchema(published, name, (node, path) => {
        for (const key of Object.keys(node)) assert.ok(PUBLISHED_KEYWORDS.has(key), `${path}: ${key}`);
      });
    }
    /* Lean: the whole published set stays well under the strict one. Revision 2026-09-25.12 types
     * every nested object and states each navigation's destination, so it is about two thirds now. */
    const size = schemas => JSON.stringify(schemas).length;
    const published = Object.fromEntries(TOOL_NAMES.map(name => [name, TOOL_DEFINITIONS[name].outputSchema]));
    assert.ok(size(published) < size(STRICT) * 0.7, `${size(published)} of ${size(STRICT)}`);
    /* The strict contract is what catches a field a result gains without its schema; the published
     * one, open, admits it. */
    assert.notDeepEqual(validate(STRICT.show_price_history, { ok: false, error: 'x', extra: 1 }), []);
    assert.deepEqual(
      validate(TOOL_DEFINITIONS.show_price_history.outputSchema, { ok: false, error: 'x', extra: 1 }),
      [],
    );
    assert.deepEqual(validate(STRICT.show_price_history, { ok: false, error: 'x' }), []);
  });

  it('returns only admitted results for every tool on every page, successes and refusals', async () => {
    const adapter = createDemoAdapter();
    const { call, calls } = recorder(adapter);

    /* Home: the section's products, a search that only reads, and the Shopping Brain. */
    const home = await call('get_visible_products', { limit: 2 });
    assert.equal(home.source, 'BestPrice home page');
    assert.ok(home.products.every(product => product.section === HOME_SECTION));
    assert.deepEqual([home.returned, home.omitted_products, home.completeness], [2, 1, 'partial']);
    const read = await call('search_bestprice', { query: 'galaxy', navigate: false, limit: 2 });
    assert.deepEqual([read.navigated, read.results_kind, read.returned], [false, 'listing', 1]);
    assert.equal(adapter.snapshot().page, 'home', 'navigate: false only reads');
    await call('search_bestprice', { query: 'καφετιέρα', navigate: false });
    await call('open_visible_product', { product_id: '9999999999' });
    await call('search_bestprice', { query: 'x' });
    await call('get_shopping_decision', { message: 'κινητό έως 750€' });
    await call('get_shopping_decision', { message: 'κινητό έως 750€', postal_code: '10431' });
    await call('get_shopping_decision', { message: 'iPhone 16 ή Galaxy S24;' });
    await call('get_shopping_decision', { message: 'κινητό κάτω από 300€' });
    await call('get_shopping_decision', { message: 'μια καφετιέρα' });
    await call('get_shopping_decision', { message: 'κινητό', postal_code: '99999' });
    await call('get_shopping_decision', { message: '   ' });

    /* Listing: search, read, filter, sort, open. */
    const search = await call('search_bestprice', { query: 'phone' });
    assert.equal(adapter.snapshot().page, 'listing');
    assert.equal(search.navigated, true);
    await call('get_visible_products', {});
    await call('get_visible_products', { offset: 9 });
    await call('get_listing_filters', {});
    await call('get_listing_filters', { group: 'brand', offset: 1 });
    await call('get_listing_filters', { group: 'Χρώμα' });
    await call('apply_listing_filter', { filter: 'brand', value: 'Samsung' });
    await call('apply_listing_filter', { filter: 'brand', value: 'Samsung' });
    await call('apply_listing_filter', { filter: 'price', value: '100' });
    /* Revision 2026-09-25.12: one filter or one selected value of it, and sort keys. */
    await call('clear_listing_filters', { filter: 'brand', value: 'Apple' });
    await call('clear_listing_filters', { value: 'Apple' });
    await call('clear_listing_filters', { filter: 'Χρώμα' });
    await call('clear_listing_filters', { filter: 'brand' });
    await call('apply_listing_filter', { filter: 'brand', value: 'Samsung' });
    await call('clear_listing_filters', {});
    await call('clear_listing_filters', {});
    await call('get_listing_sort_options', {});
    await call('apply_listing_sort', { sort: 'Φθηνότερα' });
    await call('apply_listing_sort', { sort: 'price_asc' });
    await call('apply_listing_sort', { sort: 'Newest' });
    await call('get_shopping_decision', { message: 'Pixel 9' });
    const [cheapest] = (await call('get_visible_products', { limit: 1 })).products;
    await call('open_visible_product', { product_id: cheapest.product_id });
    assert.equal(adapter.snapshot().page, 'product');

    /* Product: facts, offers, specifications, history, the two action verbs. */
    await call('get_page_product', {});
    const offers = await call('compare_page_offers', { limit: 4, include_all_stores: true });
    await call('compare_page_offers', { limit: 5 });
    await call('get_product_specifications', {});
    await call('get_product_specifications', { section: 'Οθόνη', limit: 1 });
    await call('get_product_specifications', { fact: 'Μέγεθος' });
    await call('get_product_specifications', { section: 'Battery' });
    await call('summarize_price_history', {});
    /* Revision 2026-09-25.12: every ranked offer through offset, the chart with the numbers, and
     * another product's details from this page. */
    const next = await call('compare_page_offers', { limit: 1, offset: 1 });
    assert.deepEqual(
      [next.offset, next.compared, next.offers[0].offer_ref, next.next_offset],
      [1, 1, offers.offers[1].offer_ref, offers.offers.length > 2 ? 2 : null],
    );
    assert.equal(offers.next_offset, null, 'four offers read the whole two-store ranking');
    await call('compare_page_offers', { offset: 99 });
    const charted = await call('summarize_price_history', { show_chart: true });
    assert.equal(charted.chart, 'opened_price_history');
    await call('summarize_price_history', { show_chart: 'yes' });
    await call('get_product_details', { product_id: '2160384659', include: ['offers'] });
    await call('show_offer', {
      offer_ref: offers.offers[0].offer_ref,
      merchant_name: offers.offers[1].merchant,
    });
    await call('show_offer', { offer_ref: offers.offers[0].offer_ref });
    await call('show_offer', { merchant_name: offers.offers[0].merchant });
    await call('show_offer', { merchant_id: '42' });
    await call('show_offer', { offer_ref: 'offer-unknown' });
    await call('show_price_history', {});
    await call('show_price_history', {});

    /* Any other public page (contract 1.9): search, one product's details, the Shopping Brain. */
    adapter.setPage('site');
    const decided = await call('get_shopping_decision', { message: 'κινητό έως 750€' });
    await call('get_product_details', { product_id: decided.recommended.product_id });
    await call('get_product_details', { product_id: '2159919913', include: ['offers'] });
    await call('get_product_details', { product_id: 'bp_2159919913' });
    await call('get_product_details', { product_id: '9999999999' });
    await call('get_product_details', { product_id: '2159919913', include: ['reviews'] });
    await call('search_bestprice', { query: 'pixel', navigate: false });
    assert.equal(adapter.snapshot().page, 'site');
    await call('search_bestprice', { query: 'iPhone 16 128GB', limit: 8 });
    await call('get_product_details', {
      product_id: '2160384659',
      include: ['price_history', 'specifications'],
    });

    /* Every tool was exercised, and both outcomes of the tools that can refuse. */
    assert.deepEqual([...new Set(calls.map(entry => entry.name))].sort(), [...TOOL_NAMES].sort());
    for (const name of [
      'search_bestprice',
      'get_shopping_decision',
      'show_offer',
      'open_visible_product',
      'get_product_details',
    ]) {
      assert.deepEqual(
        [...new Set(calls.filter(entry => entry.name === name).map(entry => entry.ok))].sort(),
        [false, true],
        name,
      );
    }
  });

  it('reads one product from any page, without moving the tab unless asked (contract 1.9)', async () => {
    const adapter = createDemoAdapter();
    const { call } = recorder(adapter);
    const details = await call('get_product_details', { product_id: '2159919913' });
    assert.equal(details.source, 'BestPrice product page');
    assert.equal(details.bestprice_url, 'https://www.bestprice.gr/item/2159919913/product.html?bpref=mcp');
    /* Ranked as compare_page_offers ranks them, with no offer_ref: show_offer acts on the item page. */
    assert.deepEqual(
      details.offers.items.map(offer => [offer.merchant, offer.delivered_price_eur]),
      [
        ['Gadgetway', 802],
        ['TechMobile', 808.48],
        ['Houseshop', null],
      ],
    );
    assert.ok(details.offers.items.every(offer => !('offer_ref' in offer)));
    assert.deepEqual([details.specifications.returned, details.specifications.completeness], [3, 'complete']);
    assert.equal(details.price_history.historical_low_eur, 780);
    assert.equal(adapter.snapshot().page, 'home', 'the tab does not move');

    const offersOnly = await call('get_product_details', {
      product_id: '2159919913',
      include: ['offers'],
    });
    assert.deepEqual(
      Object.keys(offersOnly).filter(key => DETAIL_SECTIONS.includes(key)),
      ['offers'],
    );
    assert.equal(offersOnly.navigated, false);
    /* Contract 1.9: one id form everywhere; the MCP server's bp_<id> is refused with the digits to send. */
    assert.deepEqual(await call('get_product_details', { product_id: 'bp_2159919913' }), {
      ok: false,
      error: 'product_id is the numeric BestPrice product id: pass 2159919913, without bp_.',
    });
    assert.deepEqual(await call('get_product_details', { product_id: '1234567890' }), {
      ok: false,
      error: 'BestPrice has no product page for product_id 1234567890.',
      reason: 'not_found',
    });
    assert.equal(
      (await call('get_product_details', { product_id: '2159919913', include: [] })).error,
      'include must list one or more of: offers, specifications, price_history.',
    );
    /* Since the 2026-09-25.8 revision the item page registers it too, with its own wording. */
    const onItemPage = createTools({ page: 'product', execute: adapter.execute }).find(
      tool => tool.name === 'get_product_details',
    );
    assert.equal(onItemPage.description, TOOL_DEFINITIONS.get_product_details.pageDescriptions.product);

    /* With navigate, the tab moves to the product once it is read. */
    const opened = await call('get_product_details', { product_id: '2160384659', navigate: true });
    assert.equal(opened.navigated, true);
    assert.match(opened.next_step, /^The tab is moving to this product’s page/u);
    assert.deepEqual(
      [adapter.snapshot().page, adapter.snapshot().product.product_id],
      ['product', '2160384659'],
    );
  });

  it('answers before the tab moves, with what the destination shows (revisions 2026-09-25.8 and .12)', async () => {
    const changes = [];
    const adapter = createDemoAdapter(snapshot => changes.push(snapshot.page));
    const { call } = recorder(adapter);
    await call('search_bestprice', { query: 'phone' });
    /* The answer is complete before the page it describes changes: the state moves after it. */
    const pending = adapter.execute('open_visible_product', { product_id: '2159922965' });
    assert.equal(adapter.snapshot().page, 'listing', 'nothing has moved while the tool is answering');
    const opened = await pending;
    /* Revision .12: the product page is read first, so the answer is `confirmed` and carries it. */
    assert.deepEqual(
      [opened.action, opened.outcome, opened.applied, opened.dispatched],
      ['opened_visible_product', 'confirmed', true, true],
    );
    assert.deepEqual(
      [opened.product.product_id, opened.product.url],
      ['2159922965', 'https://www.bestprice.gr/item/2159922965/product.html?bpref=mcp'],
    );
    assert.deepEqual(opened.next_tools, PAGE_TOOL_NAMES.product.slice(1, -1));
    assert.equal(adapter.snapshot().page, 'product');
    assert.deepEqual(changes, ['listing', 'product']);

    /* A search for one model by its full name lands on the product's own page. */
    const unique = await call('search_bestprice', { query: 'Google Pixel 9 128GB', navigate: false });
    assert.deepEqual(
      [unique.results_kind, unique.returned, unique.results_url],
      ['product', 1, 'https://www.bestprice.gr/item/2160384659/product.html?bpref=mcp'],
    );
    assert.match(unique.next_step, /^The search matched one product: get_product_details reads it here/u);
    const narrowed = await call('search_bestprice', { query: 'Google Pixel 9 128GB', max_price_eur: 500 });
    assert.deepEqual(narrowed.not_applied, [{ constraint: 'max_price_eur', reason: 'no_product_list' }]);
    assert.deepEqual(narrowed.next_tools, PAGE_TOOL_NAMES.product.slice(1, -1));
    assert.deepEqual(
      [adapter.snapshot().page, adapter.snapshot().product.product_id],
      ['product', '2160384659'],
    );
    /* Narrowed to nothing, a listing says so and names no destination tools. */
    const nothing = await call('search_bestprice', { query: 'phone', max_price_eur: 100 });
    assert.deepEqual([nothing.results_kind, nothing.next_tools], ['none', undefined]);
    assert.match(nothing.next_step, /^No products match these constraints/u);
  });

  it('says dispatched, with why, wherever a destination cannot be read first (revision 2026-09-25.12)', async () => {
    const adapter = createDemoAdapter(() => {}, {
      readDestination: url => {
        throw Object.assign(new Error(`unreadable ${url}`), { reason: 'upstream_unavailable' });
      },
    });
    const { call } = recorder(adapter);
    await call('search_bestprice', { query: 'phone' });
    const dispatched = [
      await call('apply_listing_filter', { filter: 'brand', value: 'Samsung' }),
      await call('clear_listing_filters', { filter: 'brand', value: 'Samsung' }),
      await call('apply_listing_filter', { filter: 'brand', value: 'Apple' }),
      await call('clear_listing_filters', {}),
      await call('apply_listing_sort', { sort: 'price_asc' }),
    ];
    assert.deepEqual(
      dispatched.map(result => [result.action, result.outcome, result.applied, result.unconfirmed_reason]),
      [
        ['filter_dispatched', 'dispatched', false, 'upstream_unavailable'],
        ['filter_removal_dispatched', 'dispatched', false, 'upstream_unavailable'],
        ['filter_dispatched', 'dispatched', false, 'upstream_unavailable'],
        ['clearing_filters_dispatched', 'dispatched', false, 'upstream_unavailable'],
        ['sorting_dispatched', 'dispatched', false, 'upstream_unavailable'],
      ],
    );
    assert.ok(dispatched.every(result => !('destination' in result)));
    const [first] = adapter.snapshot().products;
    const opened = await call('open_visible_product', { product_id: first.product_id });
    assert.deepEqual([opened.action, opened.outcome], ['product_open_dispatched', 'dispatched']);
    assert.equal(adapter.snapshot().page, 'product', 'the tab still moves');
  });

  it('answers a details read in time, with what it could read, and opens the product even when it could not', async () => {
    const hanging = () => new Promise(() => {});
    const adapter = createDemoAdapter(undefined, {
      readSection: (product, section) => {
        if (section === 'price_history') return hanging();
        if (section === 'specifications') throw new Error('unreadable');
        return readFixtureSection(product, section);
      },
      sectionTimeoutMs: 50,
    });
    const { call } = recorder(adapter);
    const partial = await call('get_product_details', { product_id: '2159919913' });
    assert.equal(partial.ok, true);
    assert.equal(partial.offers.compared, 3);
    assert.deepEqual([partial.specifications, partial.price_history], [null, null]);
    assert.deepEqual(partial.unavailable, {
      specifications: 'Specifications could not be read.',
      price_history: 'Price history did not load within 0.1 seconds.',
    });

    const failing = createDemoAdapter(undefined, {
      readPage: () => {
        throw new Error('the product page did not answer');
      },
    });
    const failed = recorder(failing);
    assert.deepEqual(await failed.call('get_product_details', { product_id: '2159919913' }), {
      ok: false,
      error: 'The product page could not be read.',
      reason: 'upstream_unavailable',
    });
    const opened = await failed.call('get_product_details', { product_id: '2159919913', navigate: true });
    assert.deepEqual(
      [opened.ok, opened.navigated, opened.bestprice_url],
      [false, true, 'https://www.bestprice.gr/item/2159919913/product.html?bpref=mcp'],
    );
    assert.equal(failing.snapshot().page, 'product', 'asked to open it, the tab still goes');
    /* A product BestPrice does not have is never opened. */
    const missing = createDemoAdapter(undefined, { readPage: () => null });
    const unknown = await recorder(missing).call('get_product_details', {
      product_id: '123',
      navigate: true,
    });
    assert.deepEqual(
      [unknown.reason, unknown.navigated, missing.snapshot().page],
      ['not_found', undefined, 'home'],
    );
  });

  it('narrows a search by price, stock, deals and order, and says what the page applied', async () => {
    const adapter = createDemoAdapter();
    const { call } = recorder(adapter);
    const cheap = await call('search_bestprice', {
      query: 'phone',
      max_price_eur: 750,
      sort: 'price_asc',
      in_stock_only: true,
      navigate: false,
    });
    assert.deepEqual(
      cheap.products.map(product => product.current_min_price_eur),
      [689, 729],
    );
    assert.deepEqual(cheap.applied, { max_price_eur: 750, sort: 'price_asc', in_stock_only: true });
    assert.deepEqual(cheap.not_applied, []);

    /* An order the results page does not offer is reported, with the ones it does. */
    const newest = await call('search_bestprice', { query: 'phone', sort: 'newest', deals_only: true });
    assert.deepEqual(newest.applied, { deals_only: true });
    assert.deepEqual(newest.not_applied, [
      { constraint: 'sort', reason: 'not_offered', offered_sorts: ['relevance', 'price_asc'] },
    ]);
    /* The listing the tab moved to shows what the search returned, under the same ids. */
    assert.deepEqual(
      (await call('get_visible_products', {})).products.map(product => product.product_id),
      newest.products.map(product => product.product_id),
    );
    const cleared = await call('clear_listing_filters', {});
    assert.deepEqual([cleared.action, cleared.outcome], ['cleared_listing_filters', 'confirmed']);

    const none = await call('search_bestprice', { query: 'καφετιέρα', min_price_eur: 10, navigate: false });
    assert.deepEqual(none.not_applied, [{ constraint: 'min_price_eur', reason: 'no_products' }]);
    const plain = await call('search_bestprice', { query: 'phone', in_stock_only: false, navigate: false });
    assert.equal(plain.applied, undefined, 'false asks for nothing, so nothing is reported');
    for (const [args, error] of [
      [
        { min_price_eur: -1 },
        'min_price_eur must be a number of euros from 0 to 10000000, the item price before shipping.',
      ],
      [{ min_price_eur: 500, max_price_eur: 100 }, 'min_price_eur must not be more than max_price_eur.'],
      [
        { sort: 'cheapest' },
        'sort must be one of: relevance, price_asc, price_desc, biggest_price_drop, most_stores, newest.',
      ],
      [{ deals_only: 'yes' }, 'deals_only must be true or false.'],
    ]) {
      assert.deepEqual(await call('search_bestprice', { query: 'phone', ...args }), { ok: false, error });
    }
  });

  it('reads what contract 1.8 added: more result pages, the named product, the unknown-shipping offer', async () => {
    const adapter = createDemoAdapter();
    const { call } = recorder(adapter);
    assert.deepEqual(await call('get_visible_products', { load_more: true }), {
      ok: false,
      reason: 'not_available',
      error:
        'This page does not load more results in place; every product it shows is readable from offset: 0.',
    });
    const search = await call('search_bestprice', { query: 'phone' });
    assert.deepEqual(
      search.next_tools,
      PAGE_TOOL_NAMES.listing.slice(1, -1),
      'the tools the results page registers',
    );
    const listing = await call('get_visible_products', {});
    assert.deepEqual(
      [listing.result_pages_loaded, listing.result_pages_total, listing.more_pages],
      [1, 1, undefined],
    );
    assert.equal((await call('get_visible_products', { load_more: true })).reason, 'not_available');
    assert.equal(
      (await call('get_visible_products', { load_more: 'yes' })).error,
      'load_more must be true or false.',
    );
    const read = await call('search_bestprice', { query: 'phone', navigate: false });
    assert.equal(read.next_tools, undefined, 'a search that did not move the tab names no next tools');

    await call('open_visible_product', { product_id: '2159919913' });
    for (const productId of ['2159919913', 2159919913]) {
      assert.equal(
        (await call('compare_page_offers', { product_id: productId })).ok,
        true,
        String(productId),
      );
    }
    assert.equal(
      (await call('compare_page_offers', { product_id: 'bp_2159919913' })).error,
      "product_id is the numeric BestPrice product id: pass 2159919913, without bp_. This page's product is 2159919913; or leave it out.",
    );
    const elsewhere = await call('compare_page_offers', { product_id: '2160384659' });
    assert.match(
      elsewhere.error,
      /^product_id 2160384659 is not the product on this page \(2159919913\)\. Open https:\/\/www\.bestprice\.gr\/item\/2160384659/u,
    );
    assert.equal((await call('compare_page_offers', { product_id: 'x1' })).ok, false);

    /* Two offers asked for: the unknown-shipping store is left out, and named rather than dropped. */
    const two = await call('compare_page_offers', { limit: 2 });
    assert.equal(two.ranking_basis, 'known_delivered_first_then_item_price');
    assert.deepEqual(
      two.offers.map(offer => offer.delivered_price_eur),
      [802, 808.48],
    );
    assert.deepEqual(two.excluded_unknown_shipping, {
      count: 1,
      lowest_item_price_eur: 811.02,
      cheapest: (await call('compare_page_offers', {})).offers[2],
    });
  });

  it('answers a search with the products the listing then shows, under the same ids', async () => {
    const adapter = createDemoAdapter();
    const search = await adapter.execute('search_bestprice', { query: 'phone', limit: 8 });
    assert.equal(search.results_url, 'https://www.bestprice.gr/search?q=phone');
    assert.equal(search.next_step.startsWith('The tab now shows these results'), true);
    const listing = await adapter.execute('get_visible_products', { limit: 8 });
    assert.deepEqual(
      search.products.map(product => product.product_id),
      listing.products.map(product => product.product_id),
    );
    assert.deepEqual(await adapter.execute('search_bestprice', { query: 'phone', navigate: 'yes' }), {
      ok: false,
      error: 'navigate must be true or false.',
    });
    assert.deepEqual(await adapter.execute('search_bestprice', { query: 'phone', limit: 9 }), {
      ok: false,
      error: 'limit must be a whole number from 1 to 8.',
    });
  });

  it('decides from the fixture without a network, and refuses bad arguments before deciding', async () => {
    const fetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('the demo adapter must not reach the network');
    };
    try {
      const adapter = createDemoAdapter();
      const pick = await adapter.execute('get_shopping_decision', { message: 'κινητό έως 750€' });
      assert.equal(pick.outcome, 'recommendation');
      /* Contract 1.9: the page tools' numeric id, which get_product_details and the listing take. */
      assert.equal(pick.recommended.product_id, '2159922965', 'the best rated phone within the budget');
      assert.deepEqual(
        pick.alternatives.map(product => product.product_id),
        ['2160384659'],
      );
      assert.equal(pick.recommended.offer, undefined, 'no delivered total without a postcode');
      /* A tradeoff names a cheaper phone only when there is one: the pick here is the cheapest fit. */
      assert.deepEqual(pick.tradeoffs, []);
      const open = await adapter.execute('get_shopping_decision', { message: 'ένα κινητό' });
      assert.equal(open.recommended.product_id, '2159919913');
      assert.deepEqual(open.tradeoffs, ['Samsung Galaxy S24 256GB costs 113 € less.']);
      assert.equal(pick.note, DECISION_NOTE);

      const delivered = await adapter.execute('get_shopping_decision', {
        message: 'κινητό έως 750€',
        postal_code: '10431',
      });
      assert.deepEqual(delivered.recommended.offer, {
        merchant: 'OneThing',
        item_price_eur: 685,
        shipping_eur: 4,
        delivered_total_eur: 689,
      });
      assert.deepEqual(delivered.unknowns, []);

      const none = await adapter.execute('get_shopping_decision', { message: 'κινητό έως 300€' });
      assert.deepEqual([none.outcome, none.status, none.recommended], ['no_match', 'no_match', null]);
      assert.equal(none.catalog_candidates.products.length, 3);
      const unclear = await adapter.execute('get_shopping_decision', { message: 'μια καφετιέρα' });
      assert.deepEqual([unclear.outcome, unclear.status], ['clarification', 'needs_input']);
      assert.ok(unclear.clarifying_question);
      const compared = await adapter.execute('get_shopping_decision', { message: 'iPhone 16 ή Galaxy S24;' });
      assert.equal(compared.outcome, 'comparison');

      assert.equal(adapter.snapshot().page, 'home', 'a decision never moves the tab');
    } finally {
      globalThis.fetch = fetch;
    }
  });

  it('lets a host answer get_shopping_decision instead of the fixture, with the validated request', async () => {
    const requests = [];
    const answer = {
      ok: false,
      error: 'The BestPrice Shopping Brain could not be reached.',
      retryable: true,
    };
    const adapter = createDemoAdapter(undefined, {
      decide: async (request, options) => {
        requests.push([request, options?.signal instanceof AbortSignal]);
        return answer;
      },
    });
    const controller = new AbortController();
    const [tool] = createTools({ page: 'home', execute: adapter.execute }).filter(
      candidate => candidate.name === 'get_shopping_decision',
    );
    assert.equal(
      await tool.execute({ message: ' κινητό\u0007 ', postal_code: '85100' }, { signal: controller.signal }),
      answer,
    );
    assert.deepEqual(await adapter.execute('get_shopping_decision', { message: 'x', zip: '10431' }), {
      ok: false,
      error: 'Unexpected argument: zip.',
    });
    assert.deepEqual(await adapter.execute('get_shopping_decision', { message: 42 }), {
      ok: false,
      error: 'message must be the shopper’s question as a string.',
    });
    assert.deepEqual(requests, [[{ message: 'κινητό', postalCode: '85100' }, true]]);
  });

  it('accepts exactly the arguments each published input schema declares', async () => {
    const adapter = createDemoAdapter();
    adapter.setPage('product');
    /* show_offer's offer_ref was published but refused by the fixture until contract 1.8. */
    const offers = await adapter.execute('compare_page_offers', {});
    assert.equal(offers.offers[0].offer_ref, offerRef(offers.product_id, 0));
    assert.equal((await adapter.execute('show_offer', { offer_ref: offers.offers[1].offer_ref })).ok, true);
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: adapter.execute })) {
        const refused = await tool.execute({ not_an_argument: true });
        assert.deepEqual(refused, { ok: false, error: 'Unexpected argument: not_an_argument.' }, tool.name);
      }
    }
  });
});
