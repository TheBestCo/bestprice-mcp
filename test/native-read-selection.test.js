/** Synthetic product selection only: unsafe destinations are never visited. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectBrowsingProductUrl } from '../scripts/native-read-policy.js';

const safeLink = 'https://www.bestprice.gr/item/2147483650/synthetic.html';
test('selection skips unsafe first item links without relaxing the browsing policy', () => {
  assert.equal(
    selectBrowsingProductUrl([
      'https://www.bestprice.gr/item/12/physical.html',
      `${safeLink}?go=1`,
      'https://merchant.example.invalid/item/2147483650/x',
      safeLink,
    ]),
    safeLink,
  );
});
test('selection fails closed when only unsafe product destinations are visible', () => {
  assert.equal(
    selectBrowsingProductUrl([`${safeLink}?from=search`, `${safeLink}#go`, 'https://www.bestprice.gr/to/12']),
    null,
  );
});
test('selection does not treat a non-product browsing page as a product', () => {
  assert.equal(selectBrowsingProductUrl(['https://www.bestprice.gr/search?q=test', safeLink]), safeLink);
});
test('selection ignores malformed or unbounded strings and accepts no non-array source', () => {
  assert.equal(selectBrowsingProductUrl([null, 'not-a-url', 'x'.repeat(2049), safeLink]), safeLink);
  assert.equal(selectBrowsingProductUrl({ url: safeLink }), null);
});
test('selection remains bounded to 64 visible candidates', () => {
  assert.equal(selectBrowsingProductUrl([...Array(64).fill('not-a-url'), safeLink]), null);
});
