import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CASES,
  inspectSearchOutcome,
  inspectSyntheticLink,
  isProductDocument,
  PROBE_CLIENT,
} from '../scripts/shopper-outcomes.js';

const NOW = 1789977600;
const ID = '2162499899';
const claims = (extra = {}) => ({
  v: 1,
  purpose: 'landing',
  source: 'mcp',
  tool: 'search_products',
  client: 'bestprice_canary',
  cluster_id: 15016251,
  product_path: `${ID}/sony-wh-1000xm5`,
  iat: NOW - 10,
  exp: NOW + 590,
  ...extra,
});
const product = (extra = {}, claimOverrides = {}) => ({
  product_id: `bp_${ID}`,
  title: 'Sony WH-1000XM5',
  variant: 'Black',
  price_from: 250,
  bestprice_url: `https://www.bestprice.gr/agent/r/v1.${Buffer.from(JSON.stringify(claims(claimOverrides))).toString('base64url')}.${'x'.repeat(43)}`,
  ...extra,
});
const result = (products = [product()], extra = {}, summary) => {
  const structuredContent = {
    products,
    total_matches: products.length,
    search_mode: 'catalog_ranked',
    ...extra,
  };
  const prose =
    summary ??
    products
      .map(item => `${item.title} (${item.variant}) χωρίς μεταφορικά\n${item.bestprice_url}`)
      .join('\n');
  return {
    structuredContent,
    content: [
      { type: 'text', text: `${prose}\nStructured result (JSON):\n${JSON.stringify(structuredContent)}` },
    ],
  };
};
const inspect = (value, testCase = CASES[0]) => inspectSearchOutcome(testCase, value, NOW);

test('the synthetic identity uses the backend-recognized release canary name', () => {
  assert.equal(PROBE_CLIENT, 'bestprice-release-canary');
  assert.equal(CASES.length, 6);
  assert.equal(new Set(CASES.map(item => item.id)).size, 6);
  assert.ok(Object.isFrozen(CASES) && CASES.every(Object.isFrozen));
});

test('a correct model, budget, variant and exact text link pass', () => {
  const actual = inspect(result());
  assert.equal(actual.status, 'passed');
  assert.equal(actual.links.length, 1);
  assert.equal(actual.products[0].id, `bp_${ID}`);
});

test('a different model cannot pass just because transport and schemas succeeded', () => {
  assert.ok(
    inspect(result([product({ title: 'Sony WH-1000XM4' })])).failures.includes('WRONG_HEADPHONE_MODEL'),
  );
});

test('a wrong phone variant fails even though the requested model family appears', () => {
  for (const title of [
    'Apple iPhone 16 256GB',
    'Apple iPhone 16 Pro 128GB',
    'Apple iPhone 16 Plus 128GB',
    'Apple iPhone 16e 128GB',
  ]) {
    assert.ok(
      inspect(result([product({ title, variant: 'Black' })]), CASES[1]).failures.includes(
        'WRONG_PHONE_VARIANT',
      ),
    );
  }
});

test('matching mouse and phone identities are admitted without pretending to know reviews', () => {
  assert.equal(inspect(result([product({ title: 'Logitech MX Master 3S' })]), CASES[2]).status, 'passed');
  assert.equal(inspect(result([product({ title: 'Apple iPhone 16 128GB' })]), CASES[1]).status, 'passed');
});

for (const price of [null, false, '250', NaN, Infinity, -1, 300.01]) {
  test(`budget evidence refuses ${String(price)}`, () => {
    assert.ok(inspect(result([product({ price_from: price })])).failures.includes('BUDGET_NOT_PROVEN'));
  });
}

test('a URL present only in the structured JSON is not a clickable summary link', () => {
  const actual = inspect(result(undefined, {}, 'Sony WH-1000XM5 Black χωρίς μεταφορικά'));
  assert.ok(actual.failures.includes('SUMMARY_LINK_MISSING_OR_DUPLICATE'));
});

test('repeated and misplaced summary URLs are rejected', () => {
  const item = product();
  const duplicate = `${item.title} Black χωρίς μεταφορικά ${item.bestprice_url} ${item.bestprice_url}`;
  assert.ok(inspect(result([item], {}, duplicate)).failures.includes('SUMMARY_LINK_MISSING_OR_DUPLICATE'));
  const misplaced = `${item.bestprice_url} ${item.title} Black χωρίς μεταφορικά`;
  assert.ok(inspect(result([item], {}, misplaced)).failures.includes('SUMMARY_PRODUCT_LINK_PAIRING'));
});

test('missing variant, shipping disclosure and broadening notice cannot silently pass', () => {
  const item = product();
  const actual = inspect(
    result([item], { search_mode: 'broadened_category' }, `${item.title}\n${item.bestprice_url}`),
  );
  assert.ok(actual.failures.includes('SUMMARY_VARIANT_MISSING'));
  assert.ok(actual.failures.includes('SHIPPING_DISCLOSURE_MISSING'));
  assert.ok(actual.failures.includes('BROADENING_NOT_DISCLOSED'));
});

test('empty required cases fail; exploratory empties require paired replay rather than becoming success', () => {
  assert.equal(inspect(result([])).status, 'failed');
  assert.equal(inspect(result([]), CASES[5]).status, 'needs_review');
});

test('external/internal contradictions fail and missing form-factor evidence stays unverified', () => {
  assert.ok(
    inspect(
      result([product({ title: 'Δίσκος SSD εσωτερικός', price_from: 100 })]),
      CASES[4],
    ).failures.includes('EXTERNAL_INTERNAL_CONTRADICTION'),
  );
  assert.equal(
    inspect(result([product({ title: 'SSD 1TB', price_from: 100 })]), CASES[4]).status,
    'needs_review',
  );
  assert.equal(
    inspect(result([product({ title: 'External SSD 1TB', price_from: 100 })]), CASES[4]).status,
    'passed',
  );
});

test('an unproven manufacturer part number is not silently treated as exact matching', () => {
  assert.equal(
    inspect(result([product({ title: 'Logitech MX Master 3S' })]), CASES[5]).status,
    'needs_review',
  );
});

for (const overrides of [
  { client: 'chatgpt' },
  { client: 'other' },
  { purpose: 'click' },
  { source: 'webmcp' },
  { tool: 'compare_offers' },
  { cluster_id: 15016252 },
  { product_path: '2162499900/other' },
  { product_path: `${ID}/../redirect` },
  { exp: NOW },
  { iat: NOW + 120 },
  { exp: NOW + 1000 },
]) {
  test(`a link with incompatible claims is never eligible for network use: ${Object.keys(overrides)[0]}=${Object.values(overrides)[0]}`, () => {
    assert.throws(() => inspectSyntheticLink(product({}, overrides), NOW));
  });
}

test('untrusted URLs cannot reach foreign, merchant, short-id or query-action destinations', () => {
  for (const url of [
    'https://merchant.example/item/2162499899/product.html',
    'https://www.bestprice.gr/r/123',
    'https://www.bestprice.gr/item/15016251/product.html',
    `https://www.bestprice.gr/item/${ID}/product.html?action=click`,
    `https://www.bestprice.gr/item/${ID}/%2e%2e`,
    `https://user@www.bestprice.gr/item/${ID}/product.html`,
  ]) {
    assert.equal(isProductDocument(url, ID), false);
  }
  assert.equal(isProductDocument(`https://www.bestprice.gr/item/${ID}/product.html`, ID), true);
});

test('only the internal link handles carry tokens; retained case fields omit them', () => {
  const item = product();
  const { links, ...retained } = inspect(result([item]));
  assert.equal(links[0].url, item.bestprice_url);
  assert.equal(JSON.stringify(retained).includes(item.bestprice_url), false);
  assert.equal(JSON.stringify(retained).includes('cluster_id'), false);
});
