/** Synthetic faults for native diagnostic verdicts. No live browser/task results are manufactured. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  makeNativeReadReceipt,
  verifyNativeReadPayload,
  verifyReadDocument,
} from '../scripts/native-read-contracts.js';

const productId = '2147483650';
const offer = (extra = {}) => ({
  offer_ref: 'ref-000001',
  item_price_eur: 19.99,
  shipping_eur: 3.5,
  delivered_price_eur: 23.49,
  ...extra,
});
const offers = (rows = [offer()]) => ({
  ok: true,
  product_id: productId,
  compared: rows.length,
  price_basis: 'item_plus_shipping',
  payment_cost_status: 'not_included',
  offers: rows,
});
const verifyOffers = payload =>
  verifyNativeReadPayload('compare_page_offers', { limit: 4 }, payload, productId);
const failure = (fn, code) => assert.throws(fn, error => error.code === code);

for (const name of [
  'get_page_product',
  'compare_page_offers',
  'get_product_specifications',
  'summarize_price_history',
]) {
  test(`${name}: binds the actual read to the selected product`, () => {
    failure(
      () => verifyNativeReadPayload(name, {}, { ok: true, product_id: '2147483651' }, productId),
      'READ_PRODUCT_MISMATCH',
    );
    failure(() => verifyNativeReadPayload(name, {}, { ok: true }, undefined), 'EXPECTED_PRODUCT_MISSING');
  });
}
for (const payload of [null, [], { ok: false }, { ok: 'true' }, { ok: true, error: 'failed' }]) {
  test(`refuses an ambiguous success envelope: ${JSON.stringify(payload)}`, () =>
    failure(() => verifyNativeReadPayload('get_listing_filters', {}, payload), 'READ_ENVELOPE_INVALID'));
}
for (const [name, change, code] of [
  [
    'inflated count',
    value => {
      value.compared++;
    },
    'OFFER_COUNT_MISMATCH',
  ],
  [
    'wrong basis',
    value => {
      value.price_basis = 'including_payment';
    },
    'OFFER_PRICE_BASIS_MISMATCH',
  ],
  [
    'zero item price',
    value => {
      value.offers[0].item_price_eur = 0;
    },
    'OFFER_ITEM_PRICE_INVALID',
  ],
  [
    'string money',
    value => {
      value.offers[0].shipping_eur = '3.50';
    },
    'INVALID_MONEY',
  ],
  [
    'subcent money',
    value => {
      value.offers[0].item_price_eur = 19.991;
    },
    'INVALID_CENT_PRECISION',
  ],
  [
    'null item',
    value => {
      value.offers[0].item_price_eur = null;
    },
    'INVALID_MONEY',
  ],
  [
    'wrong total',
    value => {
      value.offers[0].delivered_price_eur = 23.5;
    },
    'OFFER_TOTAL_MISMATCH',
  ],
  [
    'unknown shipping as free',
    value => {
      value.offers[0].shipping_eur = null;
    },
    'UNKNOWN_SHIPPING_BECAME_TOTAL',
  ],
  [
    'missing shipping',
    value => {
      delete value.offers[0].shipping_eur;
    },
    'INVALID_MONEY',
  ],
  [
    'invalid reference',
    value => {
      value.offers[0].offer_ref = '';
    },
    'OFFER_REFERENCE_INVALID',
  ],
  [
    'duplicate references',
    value => {
      value.offers.push({ ...value.offers[0] });
      value.compared++;
    },
    'OFFER_REFERENCE_DUPLICATE',
  ],
]) {
  test(`HTTP/tool success cannot hide ${name}`, () => {
    const payload = offers();
    change(payload);
    failure(() => verifyOffers(payload), code);
  });
}
test('retains exact cent arithmetic, explicit free shipping and nullable unknown shipping', () => {
  const rows = [
    offer({ shipping_eur: 0, delivered_price_eur: 19.99 }),
    offer({ offer_ref: 'ref-000002' }),
    offer({ offer_ref: 'ref-000003', shipping_eur: null, delivered_price_eur: null }),
  ];
  assert.ok(verifyOffers(offers(rows)).includes('cent_totals'));
});
test('published known-total order precedes unknown totals, with increasing unknown item price', () => {
  const known = offer();
  const unknown = offer({ offer_ref: 'ref-000002', shipping_eur: null, delivered_price_eur: null });
  failure(() => verifyOffers(offers([unknown, known])), 'DELIVERED_OFFER_ORDER_INVALID');
  failure(
    () =>
      verifyOffers(
        offers([
          offer({ item_price_eur: 30, delivered_price_eur: 33.5 }),
          offer({ offer_ref: 'ref-000002' }),
        ]),
      ),
    'DELIVERED_OFFER_ORDER_INVALID',
  );
  failure(
    () =>
      verifyOffers(
        offers([
          { ...unknown, item_price_eur: 30 },
          { ...unknown, offer_ref: 'ref-000003' },
        ]),
      ),
    'UNKNOWN_OFFER_ORDER_INVALID',
  );
});
test('legitimate empty reads do not pass a positive smoke control, without declaring a production defect', () => {
  failure(() => verifyOffers(offers([])), 'OFFER_RESULT_BOUND');
  failure(
    () => verifyNativeReadPayload('get_visible_products', { limit: 2 }, { ok: true, products: [] }),
    'VISIBLE_RESULT_BOUND',
  );
});
test('visible products stay bounded and unique without exposing catalog values in the verdict', () => {
  const payload = { ok: true, products: [{ product_id: productId }] };
  const result = verifyNativeReadPayload('get_visible_products', { limit: 2 }, payload);
  assert.ok(!JSON.stringify(result).includes(productId));
  payload.products.push({ product_id: productId });
  failure(
    () => verifyNativeReadPayload('get_visible_products', { limit: 2 }, payload),
    'VISIBLE_DUPLICATE_PRODUCT',
  );
  payload.products.push({ product_id: '2147483652' });
  failure(
    () => verifyNativeReadPayload('get_visible_products', { limit: 2 }, payload),
    'VISIBLE_RESULT_BOUND',
  );
});
test('specifications cannot silently swap product or exceed requested facts', () => {
  const payload = { ok: true, product_id: productId, specifications: [{ name: 'synthetic' }] };
  verifyNativeReadPayload('get_product_specifications', { limit: 1 }, payload, productId);
  payload.specifications.push({});
  failure(
    () => verifyNativeReadPayload('get_product_specifications', { limit: 1 }, payload, productId),
    'SPECIFICATION_RESULT_BOUND',
  );
});
const snapshot = () => ({
  documentId: 'document-a',
  url: 'https://www.bestprice.gr/item/2147483650/product',
});
test('an unchanged URL is not enough: same-URL document replacement is rejected', () => {
  failure(
    () => verifyReadDocument(snapshot(), { ...snapshot(), documentId: 'document-b' }),
    'READ_CHANGED_DOCUMENT',
  );
});
test('same document with navigation is rejected too', () => {
  failure(
    () => verifyReadDocument(snapshot(), { ...snapshot(), url: `${snapshot().url}#changed` }),
    'READ_CHANGED_DOCUMENT',
  );
});
test('missing identity never counts as an unchanged document', () => {
  failure(() => verifyReadDocument(snapshot(), { url: snapshot().url }), 'DOCUMENT_IDENTITY_MISSING');
  failure(() => verifyReadDocument(snapshot()), 'DOCUMENT_SNAPSHOTS_MISSING');
});
test('checks every boundary, including the observation inside the native execution', () => {
  verifyReadDocument(snapshot(), snapshot(), snapshot(), snapshot());
  failure(
    () => verifyReadDocument(snapshot(), { ...snapshot(), documentId: 'replaced' }, snapshot()),
    'READ_CHANGED_DOCUMENT',
  );
});

const history = () => ({
  ok: true,
  product_id: productId,
  observations: 30,
  period: { from: '2026-08-20', to: '2026-09-18' },
  historical_low_eur: 10,
  historical_high_eur: 20,
  current_min_price_eur: 12,
  current_price_source: 'latest_history',
  current_price_observed_at: '2026-09-18',
});
const verifyHistory = payload => verifyNativeReadPayload('summarize_price_history', {}, payload, productId);
for (const [name, mutate, code] of [
  [
    'single day',
    p => {
      p.observations = 1;
    },
    'HISTORY_COVERAGE_INVALID',
  ],
  [
    'impossible calendar date',
    p => {
      p.period.from = '2026-02-30';
    },
    'HISTORY_PERIOD_INVALID',
  ],
  [
    'reversed period',
    p => {
      p.period.from = '2026-09-19';
    },
    'HISTORY_PERIOD_INVALID',
  ],
  [
    'equal dates',
    p => {
      p.period.from = p.period.to;
    },
    'HISTORY_PERIOD_INVALID',
  ],
  [
    'reversed prices',
    p => {
      p.historical_low_eur = 21;
    },
    'HISTORY_EXTREMA_INVALID',
  ],
  [
    'unknown price as zero',
    p => {
      p.current_min_price_eur = 0;
    },
    'HISTORY_EXTREMA_INVALID',
  ],
  [
    'invented source',
    p => {
      p.current_price_source = 'forecast';
    },
    'HISTORY_SOURCE_INVALID',
  ],
  [
    'wrong historical day',
    p => {
      p.current_price_observed_at = '2026-09-17';
    },
    'HISTORY_SOURCE_DATE_MISMATCH',
  ],
  [
    'historical current beyond high',
    p => {
      p.current_min_price_eur = 21;
    },
    'HISTORY_SOURCE_DATE_MISMATCH',
  ],
]) {
  test(`history success cannot hide ${name}`, () => {
    const payload = history();
    mutate(payload);
    failure(() => verifyHistory(payload), code);
  });
}
test('a current page quote may legitimately be outside the historical extrema', () => {
  const payload = history();
  assert.ok(verifyHistory(payload).includes('current_price_provenance'));
  payload.current_price_source = 'page_quote';
  payload.current_price_observed_at = null;
  payload.current_min_price_eur = 25;
  verifyHistory(payload);
});
test('diagnostic receipts never retain catalog, URL, query, identity or unknown fields', () => {
  const secret = 'synthetic-private-content';
  const receipt = makeNativeReadReceipt({
    name: 'compare_page_offers',
    page: 'product',
    durationMs: 10,
    observation: {
      ok: true,
      bytes: 100,
      productIdentityMatches: true,
      payload: { merchant: secret },
      productCandidates: [{ bestprice_url: secret }],
      documentBefore: { url: secret },
      error: secret,
      arbitrary: secret,
      arrays: { offers: 2, [secret]: 20, products: secret },
    },
  });
  assert.deepEqual(receipt, {
    name: 'compare_page_offers',
    page: 'product',
    ok: true,
    bytes: 100,
    arrays: { offers: 2 },
    contractValidated: false,
    durationMs: 10,
    productIdentityMatches: true,
  });
  assert.ok(!JSON.stringify(receipt).includes(secret));
});
test('receipt numeric fields cannot coerce unavailable or oversized values', () => {
  const receipt = makeNativeReadReceipt({
    name: 'get_listing_filters',
    page: 'listing',
    durationMs: '10',
    observation: {
      ok: 'true',
      bytes: 262145,
      productIdentityMatches: 'true',
      arrays: { filters: null, offers: -1 },
    },
  });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.bytes, null);
  assert.equal(receipt.durationMs, null);
  assert.deepEqual(receipt.arrays, {});
  assert.ok(!Object.hasOwn(receipt, 'productIdentityMatches'));
});
test('unknown tools and raw scope labels cannot enter diagnostic receipts', () => {
  failure(() => verifyNativeReadPayload('show_offer', {}, { ok: true }), 'UNKNOWN_READ_TOOL');
  failure(() => makeNativeReadReceipt({ name: 'show_offer', page: 'product' }), 'READ_RECEIPT_SCOPE_INVALID');
  failure(
    () => makeNativeReadReceipt({ name: 'get_page_product', page: 'untrusted page text' }),
    'READ_RECEIPT_SCOPE_INVALID',
  );
});
