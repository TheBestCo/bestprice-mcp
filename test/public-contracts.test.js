/** Synthetic corruption fixtures. Never release or native-shopper evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cents,
  createToolVerifier,
  IntegrityError,
  PUBLIC_TOOLS,
  verifyMirror,
  verifyOfferMoney,
  verifyPublicLinks,
} from '../scripts/public-contracts.js';

const fails = (fn, code) =>
  assert.throws(fn, error => error instanceof IntegrityError && error.code === code);
const envelope = output => ({
  structuredContent: output,
  content: [{ type: 'text', text: `Σύνοψη\n\nStructured result (JSON):\n${JSON.stringify(output)}` }],
});
const base = () => ({ currency: 'EUR', locale: 'el-GR' });
const inventory = () =>
  PUBLIC_TOOLS.map(name => ({
    name,
    annotations: { readOnlyHint: true, destructiveHint: false },
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      required: ['currency', 'locale'],
      properties: { currency: { const: 'EUR' }, locale: { const: 'el-GR' } },
    },
  }));
const signed = `https://www.bestprice.gr/agent/r/v1.c3ludGhldGlj.${'a'.repeat(43)}`;

test('real SDK schema validator enforces supplied input and output schemas', () => {
  const tools = inventory();
  const selected = tools.find(tool => tool.name === 'get_price_history');
  selected.inputSchema = {
    type: 'object',
    required: ['product_id'],
    properties: { product_id: { type: 'string', pattern: '^bp_[0-9]{10}$' } },
    additionalProperties: false,
  };
  selected.outputSchema.required.push('as_of');
  selected.outputSchema.properties.as_of = { type: 'string', format: 'date-time' };
  const verifier = createToolVerifier(tools);
  fails(() => verifier.input('get_price_history', { product_id: '123' }), 'INPUT_SCHEMA_INVALID');
  fails(
    () => verifier.input('get_price_history', { product_id: 'bp_2147483650', extra: 1 }),
    'INPUT_SCHEMA_INVALID',
  );
  const args = { product_id: 'bp_2147483650' };
  const output = {
    ...base(),
    product_id: args.product_id,
    period_days: 180,
    methodology_id: 'bestprice_daily_min_v1',
  };
  fails(() => verifier.output('get_price_history', args, envelope(output)), 'OUTPUT_SCHEMA_INVALID');
  output.as_of = 'not a date';
  fails(() => verifier.output('get_price_history', args, envelope(output)), 'OUTPUT_SCHEMA_INVALID');
  output.as_of = '2026-09-19T00:00:00Z';
  assert.equal(verifier.output('get_price_history', args, envelope(output)), output);
});

test('tool inventory rejects duplicates, missing schemas and unsafe annotations', () => {
  const tools = inventory();
  fails(() => createToolVerifier(tools.slice(1)), 'TOOL_INVENTORY_DRIFT');
  fails(() => createToolVerifier([...tools, tools[0]]), 'TOOL_INVENTORY_DRIFT');
  delete tools[0].outputSchema;
  fails(() => createToolVerifier(tools), 'MISSING_TOOL_SCHEMA');
  const unsafe = inventory();
  unsafe[0].annotations.readOnlyHint = false;
  fails(() => createToolVerifier(unsafe), 'UNSAFE_TOOL_ANNOTATIONS');
});

test('mirror comparison is structural, supports Greek, and rejects contradictory text', () => {
  const output = { a: 'Ελληνικά', b: 2 };
  const result = envelope(output);
  result.content[0].text = '{"b":2,"a":"Ελληνικά"}';
  verifyMirror(result);
  result.content[0].text = '{"b":3,"a":"Ελληνικά"}';
  fails(() => verifyMirror(result), 'TEXT_MIRROR_MISMATCH');
  result.content.push({ type: 'text', text: '{}' });
  fails(() => verifyMirror(result), 'AMBIGUOUS_TEXT_MIRROR');
  fails(() => verifyMirror(envelope(null)), 'MISSING_STRUCTURED_OUTPUT');
});

for (const value of [null, '', '1.20', NaN, Infinity, -1, undefined]) {
  test(`money does not coerce ${String(value)} to a price`, () => fails(() => cents(value), 'INVALID_MONEY'));
}
for (const value of [0.001, 1.005, Number.MAX_SAFE_INTEGER]) {
  test(`money rejects subcent or unsafe magnitude ${value}`, () =>
    fails(() => cents(value), 'INVALID_CENT_PRECISION'));
}
test('money accepts ordinary floating-point representation noise but preserves cents', () => {
  assert.equal(cents(0.1 + 0.2), 30);
  assert.equal(cents(19.99), 1999);
  assert.equal(cents(0), 0);
});

for (const status of ['known', 'estimated']) {
  test(`delivered totals reconcile for ${status} shipping`, () => {
    const offer = { item_price: 19.99, shipping_price: 3.5, total_price: 23.49, shipping_status: status };
    verifyOfferMoney(offer);
    offer.total_price = 23.5;
    fails(() => verifyOfferMoney(offer), 'DELIVERED_TOTAL_MISMATCH');
  });
}
test('unknown shipping is never confused with free shipping', () => {
  const offer = { item_price: 20, shipping_price: null, total_price: null, shipping_status: 'unknown' };
  verifyOfferMoney(offer);
  offer.shipping_price = 0;
  fails(() => verifyOfferMoney(offer), 'UNKNOWN_SHIPPING_BECAME_MONEY');
  offer.shipping_status = 'known';
  offer.total_price = 20;
  verifyOfferMoney(offer);
});

for (const change of [
  value => value.replace('https:', 'http:'),
  value => value.replace('www.bestprice.gr', 'shop.example'),
  value => value.replace('www.bestprice.gr', 'www.bestprice.gr.attacker.example'),
  value => value.replace('www.bestprice.gr', 'user:pass@www.bestprice.gr'),
  value => value.replace('www.bestprice.gr', 'www.bestprice.gr:8443'),
  value => `${value}?redirect=evil`,
  value => `${value}#fragment`,
  value => value.replace('/agent/r/', '/redirect/'),
]) {
  test(`rejects a corrupted navigation URL (${change(signed).split('/')[2]})`, () => {
    assert.throws(() => verifyPublicLinks({ products: [{ bestprice_url: change(signed) }] }), IntegrityError);
  });
}
test('approved landing/CDN links pass without ever requesting them', () => {
  verifyPublicLinks({
    products: [
      {
        bestprice_url: signed,
        image_url: 'https://abpcdn.pstatic.gr/P/1.jpg',
        merchant_logo_url: 'https://orig-bpcdn.pstatic.gr/bpmerchants/123.svg',
      },
    ],
  });
  fails(() => verifyPublicLinks({ merchant_url: 'https://shop.example/item' }), 'UNAPPROVED_PUBLIC_URL');
  const cycle = {};
  cycle.self = cycle;
  fails(() => verifyPublicLinks(cycle), 'CYCLIC_OUTPUT');
});

test('semantic offer checks bind product, postcode and unique offers', () => {
  const verifier = createToolVerifier(inventory());
  const args = { product_id: 'bp_2147483650', postal_code: '11527', limit: 2 };
  const output = {
    ...base(),
    product: { product_id: args.product_id },
    postal_code: args.postal_code,
    offers: [
      {
        offer_id: 'bp_offer_1',
        item_price: 10,
        shipping_status: 'unknown',
        shipping_price: null,
        total_price: null,
      },
    ],
  };
  verifier.output('compare_offers', args, envelope(output));
  output.product.product_id = 'bp_2147483651';
  fails(() => verifier.output('compare_offers', args, envelope(output)), 'OFFER_PRODUCT_MISMATCH');
  output.product.product_id = args.product_id;
  output.postal_code = '11111';
  fails(() => verifier.output('compare_offers', args, envelope(output)), 'OFFER_POSTCODE_MISMATCH');
  output.postal_code = args.postal_code;
  output.offers.push({ ...output.offers[0] });
  fails(() => verifier.output('compare_offers', args, envelope(output)), 'DUPLICATE_OFFER_ID');
});

test('search output preserves hard bounds and unique product identities', () => {
  const verifier = createToolVerifier(inventory());
  const args = { query: 'test', price_max: 100, price_min: 10, limit: 2 };
  const output = { ...base(), products: [{ product_id: 'bp_2147483650', price_from: 100 }] };
  verifier.output('search_products', args, envelope(output));
  output.products[0].price_from = 100.01;
  fails(() => verifier.output('search_products', args, envelope(output)), 'HARD_MAX_PRICE_BREACH');
  output.products[0].price_from = 9.99;
  fails(() => verifier.output('search_products', args, envelope(output)), 'HARD_MIN_PRICE_BREACH');
  output.products[0].price_from = null;
  output.products.push({ ...output.products[0] });
  fails(() => verifier.output('search_products', args, envelope(output)), 'DUPLICATE_PRODUCT_ID');
});

test('history identity and requested window cannot silently change', () => {
  const verifier = createToolVerifier(inventory());
  const args = { product_id: 'bp_2147483650', period_days: 90 };
  const output = {
    ...base(),
    product_id: args.product_id,
    period_days: 90,
    methodology_id: 'bestprice_daily_min_v1',
  };
  verifier.output('get_price_history', args, envelope(output));
  output.period_days = 180;
  fails(() => verifier.output('get_price_history', args, envelope(output)), 'HISTORY_WINDOW_MISMATCH');
});

test('decision must actually reference a returned product and evidence', () => {
  const verifier = createToolVerifier(inventory());
  const output = {
    ...base(),
    outcome: 'recommendation',
    products: [{ product_id: 'bp_2147483650' }],
    recommended_product_id: 'bp_2147483650',
    evidence: { claims: [{}] },
    price_verdict: { predicts_future_price: false },
  };
  verifier.output('get_shopping_decision', {}, envelope(output));
  output.recommended_product_id = 'bp_2147483651';
  fails(() => verifier.output('get_shopping_decision', {}, envelope(output)), 'RECOMMENDED_PRODUCT_MISSING');
  output.recommended_product_id = 'bp_2147483650';
  output.evidence.claims = [];
  fails(() => verifier.output('get_shopping_decision', {}, envelope(output)), 'DECISION_EVIDENCE_MISSING');
});

test('error envelopes and internal request IDs cannot be reported as a successful tool', () => {
  const verifier = createToolVerifier(inventory());
  fails(
    () => verifier.output('search_products', {}, { ...envelope(base()), isError: true }),
    'TOOL_RETURNED_ERROR',
  );
  fails(
    () => verifier.output('search_products', {}, envelope({ ...base(), error: {} })),
    'ERROR_ENVELOPE_AS_SUCCESS',
  );
  fails(
    () => verifier.output('search_products', {}, envelope({ ...base(), request_id: 'internal' })),
    'INTERNAL_IDENTIFIER_EXPOSED',
  );
});
