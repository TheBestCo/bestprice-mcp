/** Fixed read RPC permit. No real network, identities or browser qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowPriceHistoryRead } from '../scripts/native-read-policy.js';

const id = '2147483650';
const permit = () => ({
  tool: 'summarize_price_history',
  productId: id,
  expiresAt: 100,
  used: false,
  preflightUsed: false,
});
const body = () => ({
  m: 'bestprice.clusters.prices.get',
  a: [[id]],
  ctx: 'bestprice',
  cacheTTL: 60000,
  client: '{}',
});
const post = (payload = body()) => ({
  url: 'https://rpc.bestprice.gr/backend/clusters.prices.get',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  postData: JSON.stringify(payload),
});
const preflight = () => ({
  url: post().url,
  method: 'OPTIONS',
  headers: {
    Origin: 'https://www.bestprice.gr',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});

test('one valid selected-product read and its preflight consume distinct single-use permits', () => {
  const p = permit();
  assert.equal(allowPriceHistoryRead(preflight(), 'Other', p, 0), true);
  assert.equal(p.used, false);
  assert.equal(allowPriceHistoryRead(preflight(), 'Other', p, 1), false);
  assert.equal(allowPriceHistoryRead(post(), 'Fetch', p, 2), true);
  assert.equal(allowPriceHistoryRead(post(), 'Fetch', p, 3), false);
});
test('cached CORS preflight is not required for a verified POST', () => {
  assert.equal(allowPriceHistoryRead(post(), 'XHR', permit(), 99), true);
});
for (const [name, change] of [
  [
    'mutation method',
    b => {
      b.m = 'bestprice.admin.update';
    },
  ],
  [
    'wrong product',
    b => {
      b.a = [['2147483651']];
    },
  ],
  [
    'numeric product',
    b => {
      b.a = [[2147483650]];
    },
  ],
  [
    'extra product',
    b => {
      b.a = [[id, '2147483651']];
    },
  ],
  [
    'extra argument',
    b => {
      b.a = [[id], 'action'];
    },
  ],
  [
    'host override',
    b => {
      b.host = 'internal';
    },
  ],
  [
    'action field',
    b => {
      b.action = 'delete';
    },
  ],
  [
    'wrong context',
    b => {
      b.ctx = 'admin';
    },
  ],
  [
    'coerced cache',
    b => {
      b.cacheTTL = '60000';
    },
  ],
  [
    'unbounded cache',
    b => {
      b.cacheTTL = Infinity;
    },
  ],
  [
    'missing client',
    b => {
      delete b.client;
    },
  ],
  [
    'unparseable client',
    b => {
      b.client = 'not JSON';
    },
  ],
  [
    'array client',
    b => {
      b.client = '[]';
    },
  ],
  [
    'huge client',
    b => {
      b.client = 'x'.repeat(3000);
    },
  ],
]) {
  test(`denies ${name} without consuming the permit`, () => {
    const p = permit();
    const b = body();
    change(b);
    assert.equal(allowPriceHistoryRead(post(b), 'Fetch', p, 0), false);
    assert.equal(p.used, false);
  });
}
for (const [name, change] of [
  [
    'wrong endpoint',
    r => {
      r.url += '/other';
    },
  ],
  [
    'query routing',
    r => {
      r.url += '?method=delete';
    },
  ],
  [
    'credentials',
    r => {
      r.url = r.url.replace('rpc.bestprice.gr', 'user:secret@rpc.bestprice.gr');
    },
  ],
  [
    'GET',
    r => {
      r.method = 'GET';
    },
  ],
  [
    'alternate encoding',
    r => {
      r.headers['Content-Type'] = 'text/plain';
    },
  ],
  [
    'duplicate header',
    r => {
      r.headers['content-type'] = 'application/json';
    },
  ],
  [
    'oversized body',
    r => {
      r.postData = ' '.repeat(4097);
    },
  ],
  [
    'unparseable body',
    r => {
      r.postData = '{';
    },
  ],
]) {
  test(`denies ${name}`, () => {
    const r = post();
    change(r);
    assert.equal(allowPriceHistoryRead(r, 'Fetch', permit(), 0), false);
  });
}
for (const [name, change] of [
  [
    'expired',
    p => {
      p.expiresAt = 0;
    },
  ],
  [
    'wrong tool',
    p => {
      p.tool = 'search';
    },
  ],
  [
    'physical product',
    p => {
      p.productId = '0000001234';
    },
  ],
  [
    'nonfinite clock',
    p => {
      p.expiresAt = Infinity;
    },
  ],
  [
    'consumed',
    p => {
      p.used = true;
    },
  ],
]) {
  test(`denies ${name} permit`, () => {
    const p = permit();
    change(p);
    assert.equal(allowPriceHistoryRead(post(), 'Fetch', p, 0), false);
  });
}
test('documents and unrelated preflights are never authorized', () => {
  assert.equal(allowPriceHistoryRead(post(), 'Document', permit(), 0), false);
  assert.equal(allowPriceHistoryRead(preflight(), 'Document', permit(), 0), false);
  assert.equal(allowPriceHistoryRead(post(), 'Fetch', null, 0), false);
  assert.equal(allowPriceHistoryRead(post(), 'Fetch', permit(), NaN), false);
  for (const mutate of [
    r => {
      r.headers.Origin = 'https://elsewhere.invalid';
    },
    r => {
      r.headers['Access-Control-Request-Method'] = 'DELETE';
    },
    r => {
      r.postData = 'data';
    },
  ]) {
    const r = preflight();
    mutate(r);
    assert.equal(allowPriceHistoryRead(r, 'Other', permit(), 0), false);
  }
});
