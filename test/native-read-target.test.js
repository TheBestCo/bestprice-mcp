/** Source-confirmed native-read target controls, not a browser/model qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAllowedBrowsingPage,
  isReadOnlyHistoryCall,
  selectVisibleProductReadTarget,
} from '../scripts/native-read-policy.js';

const id = '2147483650';
const path = `https://www.bestprice.gr/item/${id}/control.html`;
const product = (url = `${path}?bpref=mcp`, productId = id) => ({
  product_id: productId,
  bestprice_url: url,
});

test('history read opts out of the chart action explicitly and accepts no other arguments', () => {
  assert.equal(isReadOnlyHistoryCall('summarize_price_history', { show_chart: false }), true);
  for (const args of [
    null,
    {},
    [],
    false,
    { show_chart: true },
    { show_chart: 'false' },
    { show_chart: false, href: path },
  ]) {
    assert.equal(isReadOnlyHistoryCall('summarize_price_history', args), false);
  }
  assert.equal(isReadOnlyHistoryCall('open_product', { show_chart: false }), false);
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

test('a 1.7 list read without links resolves through the page link for the same id only', () => {
  const listed = [{ product_id: id }];
  assert.deepEqual(selectVisibleProductReadTarget(listed, [path]), { productId: id, url: path });
  assert.equal(selectVisibleProductReadTarget(listed, []), null);
  assert.equal(selectVisibleProductReadTarget(listed), null);
  /* Another product's link, a query or a fragment never stands in for the listed id. */
  assert.equal(selectVisibleProductReadTarget(listed, [path.replace(id, '2147483651')]), null);
  assert.equal(selectVisibleProductReadTarget(listed, [`${path}?from=cat`, `${path}#offers`]), null);
  assert.equal(selectVisibleProductReadTarget(listed, [path.replace('https:', 'http:')]), null);
  /* A published link is still the one used, and still judged on its own. */
  assert.equal(selectVisibleProductReadTarget([product(`${path}?action=1`)], [path]), null);
  assert.equal(selectVisibleProductReadTarget([product(null)], [path]), null);
});

test('a live search title link supplies the same product without sending search attribution', () => {
  const listed = [{ product_id: id }];
  const links = Object.freeze([
    `${path}?qid=opaque&seq=1&qo=Sony+WH-1000XM5&from=search`,
    `${path}?qo=Sony+WH-1000XM5&from=search`,
  ]);
  assert.deepEqual(selectVisibleProductReadTarget(listed, links), { productId: id, url: path });
  assert.equal(new URL(links[1]).searchParams.get('from'), 'search', 'retain the original evidence');
  assert.equal(isAllowedBrowsingPage(new URL(links[1])), false, 'never broaden the navigation guard');
});

test('search-link resolution still refuses redirects, click data, ambiguous queries and identity mismatches', () => {
  const listed = [{ product_id: id }];
  for (const query of [
    '?qo=Sony&from=search&action=1',
    '?qo=Sony&from=search&qid=opaque&seq=1',
    '?qo=Sony&from=search&ct=opaque',
    '?qo=Sony&from=search&from=search',
    '?qo=Sony&qo=Sony&from=search',
    '?qo=&from=search',
    '?qo=Sony&from=merchant',
    '?qo=Sony&from=search#offer',
  ]) {
    assert.equal(selectVisibleProductReadTarget(listed, [path + query]), null, query);
  }
  for (const link of [
    path.replace(id, '2147483651'),
    path.replace('www.bestprice.gr', 'merchant.invalid'),
    path.replace('https:', 'http:'),
    path.replace('www.bestprice.gr', 'user:secret@www.bestprice.gr'),
    path.replace('/item/', '/to/'),
  ]) {
    assert.equal(selectVisibleProductReadTarget(listed, [`${link}?qo=Sony&from=search`]), null);
  }
  assert.equal(selectVisibleProductReadTarget([product(`${path}?qo=Sony&from=search`)], []), null);
});
