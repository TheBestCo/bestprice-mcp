/** Synthetic shopping checks, not a model benchmark or evidence of commercial adoption. */
import { createHash } from 'node:crypto';

export const PROBE_CLIENT = 'bestprice-release-canary';
export const PROBE_VERSION = 'shopper-outcomes-v1';
export const CASES = Object.freeze(
  [
    { id: 'headphone-model', query: 'Sony WH-1000XM5', price_max: 300, required: true },
    { id: 'phone-variant', query: 'Apple iPhone 16 128GB', required: true },
    { id: 'mouse-model', query: 'Logitech MX Master 3S', required: true },
    { id: 'greek-budget', query: 'Θέλω ακουστικά έως 99,99 ευρώ', price_max: 99.99, required: true },
    { id: 'external-ssd', query: 'δίσκος ssd εξωτερικός', price_max: 200, required: false },
    { id: 'exact-part-number', query: 'Logitech MX Master 3S 910-006559', required: false },
  ].map(Object.freeze),
);
const MIRROR = '\nStructured result (JSON):\n';
const ORIGIN = 'https://www.bestprice.gr';
const normalized = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
const compact = text => normalized(text).replace(/[^a-z0-9]/gu, '');
const digest = text => createHash('sha256').update(text).digest('hex');
const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};

/** Decode only our synthetic response's route. Decoding does NOT authenticate a signature. */
export function inspectSyntheticLink(product, nowSeconds = Math.floor(Date.now() / 1000)) {
  requireValue(typeof product?.bestprice_url === 'string', 'MISSING_PRODUCT_LINK');
  const link = product.bestprice_url;
  requireValue(link.length <= 1200, 'LINK_TOO_LONG');
  const url = new URL(link);
  requireValue(
    url.origin === ORIGIN && !url.username && !url.password && !url.search && !url.hash,
    'LINK_ORIGIN',
  );
  const match = /^\/agent\/r\/v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/u.exec(url.pathname);
  requireValue(match, 'LINK_PATH');
  const claims = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(match[1], 'base64url')),
  );
  requireValue(claims.v === 1 && claims.purpose === 'landing' && claims.source === 'mcp', 'LINK_PURPOSE');
  requireValue(
    claims.client === 'bestprice_canary' && claims.tool === 'search_products',
    'SYNTHETIC_COHORT_REQUIRED',
  );
  const id = /^bp_(\d{10})$/u.exec(product.product_id)?.[1];
  requireValue(id && Number(id) >= 2147483648 && Number(id) <= 4294967295, 'GROUPED_ID_REQUIRED');
  requireValue(
    Number.isInteger(claims.cluster_id) && claims.cluster_id + 2147483648 === Number(id),
    'LINK_ID',
  );
  requireValue(typeof claims.product_path === 'string', 'LINK_PRODUCT_PATH');
  requireValue(new RegExp(`^${id}/[a-z0-9-]{1,220}$`, 'u').test(claims.product_path), 'LINK_PRODUCT_PATH');
  requireValue(Number.isInteger(claims.iat) && Number.isInteger(claims.exp), 'LINK_TIME');
  requireValue(claims.iat <= nowSeconds + 60 && claims.exp > nowSeconds, 'LINK_NOT_CURRENT');
  requireValue(claims.exp > claims.iat && claims.exp - claims.iat <= 900, 'LINK_LIFETIME');
  return { url: link, productId: id, path: `/item/${claims.product_path}.html`, digest: digest(link) };
}

/** An exact grouped-product document only. Never follow commercial routes or query actions. */
export function isProductDocument(value, productId) {
  try {
    const url = new URL(value);
    return (
      url.origin === ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      new RegExp(`^/item/${productId}/[a-z0-9-]{1,220}\\.html$`, 'u').test(url.pathname) &&
      /^\d{10}$/u.test(productId) &&
      Number(productId) >= 2147483648 &&
      Number(productId) <= 4294967295
    );
  } catch {
    return false;
  }
}

export function inspectSearchOutcome(testCase, result, nowSeconds) {
  const output = result?.structuredContent;
  requireValue(output && Array.isArray(output.products), 'MISSING_SEARCH_OUTPUT');
  const text = result.content?.find(item => item.type === 'text')?.text;
  requireValue(typeof text === 'string' && text.includes(MIRROR), 'MISSING_RELAYED_SUMMARY');
  const summary = text.slice(0, text.indexOf(MIRROR));
  const failures = [];
  const reviews = [];
  const links = [];
  if (output.total_matches !== output.products.length) failures.push('RESULT_COUNT_MISMATCH');
  if (output.products.length > 3) failures.push('RESULT_LIMIT');
  if (new Set(output.products.map(product => product.product_id)).size !== output.products.length) {
    failures.push('DUPLICATE_PRODUCT_ID');
  }
  if (output.products.length === 0) {
    (testCase.required ? failures : reviews).push('EMPTY_REQUIRES_PAIRED_REPLAY');
  }
  for (const product of output.products) {
    const title = compact(`${product.title} ${product.variant ?? ''}`);
    const words = normalized(`${product.title} ${product.variant ?? ''}`);
    if (testCase.required && /(?:θηκ|καλωδι|ανταλλακ|earpad|replacement|case for|cable for)/u.test(words)) {
      failures.push('ACCESSORY_NOT_REQUESTED_PRODUCT');
    }
    if (testCase.id === 'headphone-model' && !/sony.*wh1000xm5/u.test(title))
      failures.push('WRONG_HEADPHONE_MODEL');
    if (testCase.id === 'mouse-model' && !/logitech.*mxmaster3s/u.test(title))
      failures.push('WRONG_MOUSE_MODEL');
    if (
      testCase.id === 'phone-variant' &&
      (!/appleiphone16128gb/u.test(title) || /iphone16(?:pro|plus|e)/u.test(title))
    ) {
      failures.push('WRONG_PHONE_VARIANT');
    }
    if (testCase.id === 'external-ssd') {
      if (/εσωτερ|internal/u.test(words)) failures.push('EXTERNAL_INTERNAL_CONTRADICTION');
      else if (!/εξωτερ|external|portable/u.test(words)) reviews.push('EXTERNAL_FORM_FACTOR_UNVERIFIED');
    }
    if (testCase.id === 'exact-part-number' && !title.includes('910006559'))
      reviews.push('PART_NUMBER_UNVERIFIED');
    if (
      testCase.price_max != null &&
      (typeof product.price_from !== 'number' ||
        product.price_from < 0 ||
        !Number.isFinite(product.price_from) ||
        product.price_from > testCase.price_max)
    )
      failures.push('BUDGET_NOT_PROVEN');
    requireValue(typeof product.title === 'string' && product.title.length > 0, 'MISSING_PRODUCT_TITLE');
    const link = inspectSyntheticLink(product, nowSeconds);
    links.push(link);
    if (summary.split(link.url).length - 1 !== 1) failures.push('SUMMARY_LINK_MISSING_OR_DUPLICATE');
    const titleAt = summary.indexOf(product.title);
    const linkAt = summary.indexOf(link.url);
    if (titleAt < 0 || linkAt < titleAt) failures.push('SUMMARY_PRODUCT_LINK_PAIRING');
    if (product.variant && !summary.includes(product.variant)) failures.push('SUMMARY_VARIANT_MISSING');
  }
  if (output.products.length && !summary.includes('χωρίς μεταφορικά'))
    failures.push('SHIPPING_DISCLOSURE_MISSING');
  if (output.search_mode === 'broadened_category' && !summary.includes('διευρυμένες')) {
    failures.push('BROADENING_NOT_DISCLOSED');
  }
  // Whitelist the retained fields: signed URLs, decision IDs and session/token IDs never leave memory.
  return {
    id: testCase.id,
    status: failures.length ? 'failed' : reviews.length ? 'needs_review' : 'passed',
    failures: [...new Set(failures)],
    reviews: [...new Set(reviews)],
    returned: output.products.length,
    searchMode: output.search_mode,
    products: output.products.map(product => ({
      id: product.product_id,
      title: product.title,
      variant: product.variant,
      priceFrom: product.price_from,
    })),
    suggestionCount: Array.isArray(output.suggested_queries) ? output.suggested_queries.length : 0,
    summaryDigest: digest(summary),
    links,
  };
}
