/** Semantic checks for the native read diagnostic, never model-driven qualification. */
import { cents, IntegrityError } from './public-contracts.js';

const ensure = (condition, code) => {
  if (!condition) throw new IntegrityError(code);
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const READ_TOOLS = new Set([
  'get_visible_products',
  'get_listing_filters',
  'get_listing_sort_options',
  'get_page_product',
  'compare_page_offers',
  'get_product_specifications',
  'summarize_price_history',
]);
const PRODUCT_READS = new Set([
  'get_page_product',
  'compare_page_offers',
  'get_product_specifications',
  'summarize_price_history',
]);

/** A same-URL reload is a different document. All snapshots must refer to the same execution. */
export function verifyReadDocument(...snapshots) {
  ensure(snapshots.length >= 2, 'DOCUMENT_SNAPSHOTS_MISSING');
  for (const value of snapshots) {
    ensure(
      record(value) &&
        typeof value.documentId === 'string' &&
        value.documentId.length > 0 &&
        typeof value.url === 'string' &&
        value.url.length > 0,
      'DOCUMENT_IDENTITY_MISSING',
    );
    ensure(
      value.documentId === snapshots[0].documentId && value.url === snapshots[0].url,
      'READ_CHANGED_DOCUMENT',
    );
  }
}

/** Return only allowlisted check names. Never include catalog text, IDs, or URLs in reports. */
export function verifyNativeReadPayload(name, args, payload, expectedProductId) {
  ensure(READ_TOOLS.has(name), 'UNKNOWN_READ_TOOL');
  ensure(record(payload) && payload.ok === true && !Object.hasOwn(payload, 'error'), 'READ_ENVELOPE_INVALID');
  const checks = ['success_envelope'];
  if (PRODUCT_READS.has(name)) {
    ensure(
      typeof expectedProductId === 'string' && /^\d{1,20}$/u.test(expectedProductId),
      'EXPECTED_PRODUCT_MISSING',
    );
    ensure(payload.product_id === expectedProductId, 'READ_PRODUCT_MISMATCH');
    checks.push('product_identity');
  }
  if (name === 'get_visible_products') {
    ensure(
      Array.isArray(payload.products) &&
        payload.products.length > 0 &&
        payload.products.length <= (args.limit ?? 8),
      'VISIBLE_RESULT_BOUND',
    );
    const ids = payload.products.map(product => product?.product_id);
    ensure(
      ids.every(id => typeof id === 'string' && /^\d{1,20}$/u.test(id)),
      'VISIBLE_PRODUCT_ID_INVALID',
    );
    ensure(new Set(ids).size === ids.length, 'VISIBLE_DUPLICATE_PRODUCT');
    checks.push('nonempty_bounded_products', 'unique_product_ids');
  } else if (name === 'compare_page_offers') {
    ensure(
      Array.isArray(payload.offers) &&
        payload.offers.length > 0 &&
        payload.offers.length <= (args.limit ?? 4),
      'OFFER_RESULT_BOUND',
    );
    ensure(payload.compared === payload.offers.length, 'OFFER_COUNT_MISMATCH');
    ensure(
      payload.price_basis === 'item_plus_shipping' && payload.payment_cost_status === 'not_included',
      'OFFER_PRICE_BASIS_MISMATCH',
    );
    const refs = new Set();
    let previousKnown = -1;
    let unknownSeen = false;
    let previousUnknownItem = -1;
    for (const offer of payload.offers) {
      ensure(
        record(offer) &&
          typeof offer.offer_ref === 'string' &&
          offer.offer_ref.length >= 8 &&
          offer.offer_ref.length <= 40,
        'OFFER_REFERENCE_INVALID',
      );
      ensure(!refs.has(offer.offer_ref), 'OFFER_REFERENCE_DUPLICATE');
      refs.add(offer.offer_ref);
      const item = cents(offer.item_price_eur);
      ensure(item > 0, 'OFFER_ITEM_PRICE_INVALID');
      if (offer.shipping_eur === null) {
        ensure(offer.delivered_price_eur === null, 'UNKNOWN_SHIPPING_BECAME_TOTAL');
        unknownSeen = true;
        ensure(item >= previousUnknownItem, 'UNKNOWN_OFFER_ORDER_INVALID');
        previousUnknownItem = item;
      } else {
        const shipping = cents(offer.shipping_eur);
        const total = cents(offer.delivered_price_eur);
        ensure(Number.isSafeInteger(item + shipping) && item + shipping === total, 'OFFER_TOTAL_MISMATCH');
        ensure(!unknownSeen && total >= previousKnown, 'DELIVERED_OFFER_ORDER_INVALID');
        previousKnown = total;
      }
    }
    checks.push(
      'nonempty_bounded_offers',
      'unique_quote_references',
      'price_basis',
      'cent_totals',
      'published_order',
    );
  } else if (name === 'get_product_specifications') {
    ensure(
      Array.isArray(payload.specifications) &&
        payload.specifications.length > 0 &&
        payload.specifications.length <= (args.limit ?? 8),
      'SPECIFICATION_RESULT_BOUND',
    );
    checks.push('nonempty_bounded_specifications');
  } else if (name === 'summarize_price_history') {
    ensure(
      Number.isSafeInteger(payload.observations) && payload.observations >= 2,
      'HISTORY_COVERAGE_INVALID',
    );
    const realDay = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    ensure(
      record(payload.period) &&
        realDay(payload.period.from) &&
        realDay(payload.period.to) &&
        payload.period.from < payload.period.to,
      'HISTORY_PERIOD_INVALID',
    );
    const low = cents(payload.historical_low_eur);
    const high = cents(payload.historical_high_eur);
    const current = cents(payload.current_min_price_eur);
    ensure(low > 0 && current > 0 && high >= low, 'HISTORY_EXTREMA_INVALID');
    ensure(['page_quote', 'latest_history'].includes(payload.current_price_source), 'HISTORY_SOURCE_INVALID');
    ensure(
      payload.current_price_source === 'page_quote'
        ? payload.current_price_observed_at === null
        : payload.current_price_observed_at === payload.period.to && current >= low && current <= high,
      'HISTORY_SOURCE_DATE_MISMATCH',
    );
    checks.push('historical_coverage', 'calendar_period', 'cent_extrema', 'current_price_provenance');
  }
  return checks;
}

/** Persist only bounded, allowlisted summaries. The transient payload is never copied to reports. */
export function makeNativeReadReceipt({ name, page, observation, durationMs }) {
  ensure(READ_TOOLS.has(name) && ['listing', 'product'].includes(page), 'READ_RECEIPT_SCOPE_INVALID');
  const arrays = {};
  for (const key of [
    'products',
    'offers',
    'groups',
    'specifications',
    'series',
    'filters',
    'options',
    'warnings',
    'sort_options',
    'sections',
  ]) {
    const count = observation?.arrays?.[key];
    if (Number.isSafeInteger(count) && count >= 0 && count <= 262144) arrays[key] = count;
  }
  const receipt = {
    name,
    page,
    ok: observation?.ok === true,
    bytes:
      Number.isSafeInteger(observation?.bytes) && observation.bytes >= 0 && observation.bytes <= 262144
        ? observation.bytes
        : null,
    arrays,
    contractValidated: false,
    durationMs:
      Number.isSafeInteger(durationMs) && durationMs >= 0 && durationMs <= 180000 ? durationMs : null,
  };
  if (typeof observation?.productIdentityMatches === 'boolean')
    receipt.productIdentityMatches = observation.productIdentityMatches;
  return receipt;
}
