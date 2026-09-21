import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistration } from '../webmcp/src/runtime.js';

async function fixture(t, execute) {
  let tool;
  const registry = createRegistration({
    modelContext: {
      registerTool(value) {
        tool = value;
      },
    },
  });
  t.after(() => registry.teardown());
  assert.equal((await registry.register([{ name: 'read_test', execute }])).status, 'ready');
  return { invoke: (...args) => tool.execute(...args), teardown: () => registry.teardown() };
}

for (const second of ['throw', 'different', 'not-callable']) {
  test(`thenable capability is read once, even when a second read would be ${second}`, async t => {
    let reads = 0;
    let receiver;
    const expected = { ok: true, value: 'observed' };
    const result = {
      get then() {
        reads++;
        if (reads === 1) {
          return function (resolve) {
            receiver = this;
            resolve(expected);
          };
        }
        if (second === 'throw') throw new Error('second read');
        if (second === 'different') return resolve => resolve({ ok: true, value: 'invented' });
        return undefined;
      },
    };
    const f = await fixture(t, () => result);
    assert.equal(await f.invoke({}), expected);
    assert.equal(reads, 1);
    assert.equal(receiver, result);
  });
}

test('thenable body stays asynchronous and duplicate settlements cannot replace the first', async t => {
  const order = [];
  const expected = { ok: true };
  const f = await fixture(t, () => ({
    then(resolve, reject) {
      order.push('then');
      resolve(expected);
      reject(new Error('late'));
      resolve({ ok: false });
    },
  }));
  const pending = f.invoke({});
  order.push('returned');
  assert.equal(await pending, expected);
  assert.deepEqual(order, ['returned', 'then']);
});

test('throwing first then accessor preserves the live synchronous exception', async t => {
  const expected = new Error('original then accessor');
  const f = await fixture(t, () => ({
    get then() {
      throw expected;
    },
  }));
  assert.throws(
    () => f.invoke({}),
    error => error === expected,
  );
});

test('non-callable then preserves synchronous return identity', async t => {
  let reads = 0;
  const expected = {
    ok: true,
    get then() {
      reads++;
      return 7;
    },
  };
  const f = await fixture(t, () => expected);
  assert.equal(f.invoke({}), expected);
  assert.equal(reads, 1);
});

test('caller cancellation still wins a deferred thenable and does not affect its sibling', async t => {
  const parent = new AbortController();
  let settle;
  const expected = { ok: true };
  const f = await fixture(t, args =>
    args.immediate
      ? expected
      : {
          then(resolve) {
            settle = resolve;
          },
        },
  );
  const pending = f.invoke({}, { signal: parent.signal });
  await Promise.resolve();
  parent.abort();
  assert.equal((await pending).ok, false);
  settle(expected);
  assert.equal(f.invoke({ immediate: true }), expected);
});

test('thenable errors retain their original rejection identity', async t => {
  const error = new Error('then body failed');
  const f = await fixture(t, () => ({
    then() {
      throw error;
    },
  }));
  await assert.rejects(
    f.invoke({}),
    value => value === error,
  );
});
