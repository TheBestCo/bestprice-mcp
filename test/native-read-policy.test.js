/** Synthetic requests only; tests never visit a product, merchant or billing URL. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowSpecificationsRead, isAllowedBrowsingPage } from '../scripts/native-read-policy.js';

const fixture = () => {
  const url = 'https://www.bestprice.gr/item/2147483650/synthetic.html';
  const boundary = '----WebKitFormBoundarySynthetic';
  return {
    request: {
      url,
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      postData: `--${boundary}\r\nContent-Disposition: form-data; name="specs"\r\n\r\njson\r\n--${boundary}--\r\n`,
    },
    permit: { url, tool: 'get_product_specifications', used: false, expiresAt: 1000 },
  };
};
for (const type of ['XHR', 'Fetch']) {
  test(`one source-matched specifications ${type} read consumes exactly one permit`, () => {
    const { request, permit } = fixture();
    assert.equal(allowSpecificationsRead(request, type, permit, 999), true);
    assert.equal(permit.used, true);
    assert.equal(allowSpecificationsRead(request, type, permit, 999), false);
  });
}
for (const [name, change] of [
  [
    'extra field',
    f => {
      f.request.postData += 'action=go';
    },
  ],
  [
    'duplicate selector',
    f => {
      f.request.postData = f.request.postData.replace('json\r\n', 'json\r\nspecs=other\r\n');
    },
  ],
  [
    'different selector',
    f => {
      f.request.postData = f.request.postData.replace('name="specs"', 'name="go"');
    },
  ],
  [
    'different value',
    f => {
      f.request.postData = f.request.postData.replace('json\r\n', 'specs\r\n');
    },
  ],
  [
    'file part',
    f => {
      f.request.postData = f.request.postData.replace('name="specs"', 'name="specs"; filename="x"');
    },
  ],
  [
    'missing body',
    f => {
      delete f.request.postData;
    },
  ],
  [
    'oversized body',
    f => {
      f.request.postData = 'x'.repeat(513);
    },
  ],
  [
    'duplicate content type',
    f => {
      f.request.headers['content-type'] = f.request.headers['Content-Type'];
    },
  ],
  [
    'urlencoded body',
    f => {
      f.request.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      f.request.postData = 'specs=json';
    },
  ],
  [
    'different method',
    f => {
      f.request.method = 'DELETE';
    },
  ],
  [
    'wrong tool',
    f => {
      f.permit.tool = 'show_offer';
    },
  ],
  [
    'expired permit',
    f => {
      f.permit.expiresAt = 0;
    },
  ],
  [
    'invalid permit deadline',
    f => {
      f.permit.expiresAt = Infinity;
    },
  ],
  [
    'no permit',
    f => {
      f.permit = null;
    },
  ],
]) {
  test(`refuses ${name} without consuming an unused permit`, () => {
    const f = fixture();
    change(f);
    assert.equal(allowSpecificationsRead(f.request, 'Fetch', f.permit, 0), false);
    if (f.permit) assert.equal(f.permit.used, false);
  });
}
for (const url of [
  'http://www.bestprice.gr/item/2147483650/synthetic.html',
  'https://user:secret@www.bestprice.gr/item/2147483650/synthetic.html',
  'https://www.bestprice.gr:8443/item/2147483650/synthetic.html',
  'https://www.bestprice.gr/item/12/synthetic.html',
  'https://www.bestprice.gr/item/9999999999/synthetic.html',
  'https://www.bestprice.gr/item/2147483650/synthetic.html?go=1',
  'https://www.bestprice.gr/item/2147483650/synthetic.html#fragment',
  'https://www.bestprice.gr/to/2147483650',
  'https://www.bestprice.gr/agent/r/v1.synthetic',
  'https://rpc.bestprice.gr/item/2147483650/synthetic.html',
]) {
  test(`refuses unapproved destination even with a matching permit: ${url}`, () => {
    const f = fixture();
    f.request.url = f.permit.url = url;
    assert.equal(allowSpecificationsRead(f.request, 'Fetch', f.permit, 0), false);
    assert.equal(f.permit.used, false);
  });
}
test('a different product may not borrow the current document permit', () => {
  const f = fixture();
  f.request.url = f.request.url.replace('2147483650', '2147483651');
  assert.equal(allowSpecificationsRead(f.request, 'Fetch', f.permit, 0), false);
});
test('a document navigation cannot use the read permit', () => {
  const f = fixture();
  assert.equal(allowSpecificationsRead(f.request, 'Document', f.permit, 0), false);
});
test('exact expiry and nonfinite current time refuse the read', () => {
  for (const now of [1000, NaN, Infinity]) {
    const f = fixture();
    assert.equal(allowSpecificationsRead(f.request, 'XHR', f.permit, now), false);
  }
});
test('both native final-boundary encodings preserve the single-field contract', () => {
  const f = fixture();
  f.request.postData = f.request.postData.slice(0, -2);
  assert.equal(allowSpecificationsRead(f.request, 'Fetch', f.permit, 0), true);
});

for (const path of [
  '/',
  '/search?q=synthetic',
  '/cat/12/synthetic.html',
  '/hub/synthetic',
  '/item/2147483648/synthetic.html',
  '/item/4294967295/synthetic.html',
]) {
  test(`browsing guard preserves allowed page ${path}`, () => {
    assert.equal(isAllowedBrowsingPage(new URL(path, 'https://www.bestprice.gr')), true);
  });
}
for (const path of [
  '/item/12/synthetic.html',
  '/item/2147483647/synthetic.html',
  '/item/4294967296/synthetic.html',
  '/item/2147483650/synthetic.html?go=12',
  '/item/2147483650/synthetic.html#redirect',
  '/to/12',
  '/agent/r/v1.synthetic',
  '/redirect/12',
]) {
  test(`browsing guard refuses possible referral destination ${path}`, () => {
    assert.equal(isAllowedBrowsingPage(new URL(path, 'https://www.bestprice.gr')), false);
  });
}
