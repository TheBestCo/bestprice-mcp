/** No navigation; sanitized observations never include rejected URLs or remote text. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectBrowsingProductLinks, selectBrowsingProductUrl } from '../scripts/native-read-policy.js';

const safe = 'https://www.bestprice.gr/item/2147483650/control.html';
const secret = 'sensitive-never-in-diagnostic';
for (const [value, reason] of [
  [null, 'non_string'],
  ['x'.repeat(2049), 'too_long'],
  [secret, 'invalid_url'],
  [`https://other.invalid/${secret}`, 'different_origin'],
  [`https://${secret}@www.bestprice.gr/item/2147483650/control.html`, 'credentials'],
  [`https://www.bestprice.gr/to/${secret}`, 'non_product_path'],
  [`${safe}?${secret}`, 'query_or_fragment'],
  [`${safe}#${secret}`, 'query_or_fragment'],
  [`https://www.bestprice.gr/item/1234/${secret}`, 'non_grouped_product_path'],
]) {
  test(`selection rejects ${reason} without retaining the candidate`, () => {
    const { selected, diagnostics } = inspectBrowsingProductLinks([value]);
    assert.equal(selected, null);
    assert.deepEqual(diagnostics, {
      examined: 1,
      inputLimited: false,
      approved: 0,
      rejected: { [reason]: 1 },
    });
    assert.ok(!JSON.stringify(diagnostics).includes(secret));
  });
}

test('first approved product remains the selection; diagnostics account for every bounded input', () => {
  const values = [`${safe}?action=1`, safe, 'https://www.bestprice.gr/item/4294967295/other.html', 'bad'];
  const { selected, diagnostics } = inspectBrowsingProductLinks(values);
  assert.equal(selected, safe);
  assert.equal(selectBrowsingProductUrl(values), safe);
  assert.equal(diagnostics.examined, 4);
  assert.equal(diagnostics.approved, 2);
  assert.deepEqual(diagnostics.rejected, { query_or_fragment: 1, invalid_url: 1 });
  assert.equal(diagnostics.approved + Object.values(diagnostics.rejected).reduce((a, b) => a + b, 0), 4);
  assert.ok(!JSON.stringify(diagnostics).includes('https'));
});

test('bounds examination without pretending an unexamined safe product was eligible', () => {
  const values = [...Array(64).fill('bad'), safe];
  const { selected, diagnostics } = inspectBrowsingProductLinks(values);
  assert.equal(selected, null);
  assert.equal(diagnostics.examined, 64);
  assert.equal(diagnostics.inputLimited, true);
  assert.deepEqual(diagnostics.rejected, { invalid_url: 64 });
});

test('empty or invalid candidates are explicit and contain no fabricated observation', () => {
  for (const values of [[], null, undefined, {}]) {
    assert.deepEqual(inspectBrowsingProductLinks(values), {
      selected: null,
      diagnostics: { examined: 0, inputLimited: false, rejected: {}, approved: 0 },
    });
  }
});
