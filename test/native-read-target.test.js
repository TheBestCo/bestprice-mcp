/** Source-confirmed native-read target controls, not a browser/model qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedBrowsingPage, selectVisibleProductReadTarget } from '../scripts/native-read-policy.js';

const id = '2147483650';
const path = `https://www.bestprice.gr/item/${id}/control.html`;
const product = (url = `${path}?bpref=mcp`, productId = id) => ({
  product_id: productId,
  bestprice_url: url,
});

test('native read identity authorizes only the same grouped-product browsing path', () => {
  const input = Object.freeze(product());
  const target = selectVisibleProductReadTarget([input]);
  assert.deepEqual(target, { productId: id, url: path });
  assert.equal(input.bestprice_url, `${path}?bpref=mcp`, 'do not change the evidence');
  assert.equal(isAllowedBrowsingPage(new URL(target.url)), true);
  assert.equal(
    isAllowedBrowsingPage(new URL(input.bestprice_url)),
    false,
    'the general navigation guard is unchanged',
  );
  assert.deepEqual(selectVisibleProductReadTarget([product(path)]), target);
});

for (const query of [
  '?bpref=search',
  '?bpref=mcp&action=1',
  '?bpref=mcp&bpref=mcp',
  '?bpref=MCP',
  '?bpref=%6dcp',
  '?action=1',
  '?bpref=mcp#offer',
]) {
  test(`never strips unapproved navigation data: ${query}`, () => {
    assert.equal(selectVisibleProductReadTarget([product(path + query)]), null);
  });
}
for (const [name, value] of [
  ['wrong product', product(path, '2147483651')],
  [
    'physical product',
    product('https://www.bestprice.gr/item/0000001234/control.html?bpref=mcp', '0000001234'),
  ],
  [
    'out-of-range ID',
    product('https://www.bestprice.gr/item/4294967296/control.html?bpref=mcp', '4294967296'),
  ],
  ['numeric identity', product(path, 2147483650)],
  ['wrong host', product(path.replace('www.bestprice.gr', 'merchant.invalid'))],
  ['HTTP', product(path.replace('https:', 'http:'))],
  ['credentials', product(path.replace('www.bestprice.gr', 'user:secret@www.bestprice.gr'))],
  ['port', product(path.replace('www.bestprice.gr', 'www.bestprice.gr:8443'))],
  ['merchant path', product('https://www.bestprice.gr/to/2147483650/?bpref=mcp')],
  ['unparseable URL', product('https://')],
  ['oversized URL', product(path + 'x'.repeat(2048))],
]) {
  test(`rejects ${name}`, () => assert.equal(selectVisibleProductReadTarget([value]), null));
}

test('selection is bounded, rejects duplicate identities, and cannot claim an absent candidate', () => {
  assert.equal(selectVisibleProductReadTarget(Array(9).fill(product())), null);
  assert.equal(selectVisibleProductReadTarget([product(), product()]), null);
  assert.equal(selectVisibleProductReadTarget([]), null);
  assert.equal(selectVisibleProductReadTarget(null), null);
  assert.equal(selectVisibleProductReadTarget([null]), null);
  const wrong = product(path.replace(id, '2147483651'), '2147483652');
  assert.deepEqual(selectVisibleProductReadTarget([wrong, product()]), { productId: id, url: path });
});
