/** Contract/runtime integration with the synthetic context, not native shopper qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTools, PAGE_TOOL_NAMES } from '../src/contracts.js';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};

for (const [page, names] of Object.entries(PAGE_TOOL_NAMES)) {
  for (const name of names) {
    test(`${page}/${name} forwards the exact execution options and synchronous result`, () => {
      const args = Object.freeze({ query: 'τηλεόραση' });
      const options = Object.freeze({ signal: new AbortController().signal, requestTag: 'unit-control' });
      const result = Object.freeze({ ok: true });
      const calls = [];
      const tool = createTools({
        page,
        execute: (...received) => {
          calls.push(received);
          return result;
        },
      }).find(tool => tool.name === name);
      assert.equal(tool.execute(args, options), result);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], name);
      assert.equal(calls[0][1], args);
      assert.equal(calls[0][2], options);
    });
  }
}

for (const stop of ['caller', 'teardown', 'replacement']) {
  test(`composed contracts propagate ${stop} cancellation before a later handler effect`, async t => {
    const context = createLocalModelContext();
    const registration = createRegistration({ modelContext: context });
    const release = deferred();
    const finished = deferred();
    const caller = new AbortController();
    const reason = new Error('synthetic caller cancellation');
    let handlerSignal;
    let effects = 0;
    t.after(() => {
      release.resolve();
      registration.teardown();
    });
    await registration.register(createTools({
      page: 'home',
      execute: async (_name, _args, options) => {
        handlerSignal = options?.signal;
        await release.promise;
        if (!handlerSignal?.aborted) effects += 1;
        finished.resolve();
        return { ok: true };
      },
    }));
    const pending = context.tools.get('search_bestprice').execute({ query: 'phone' }, { signal: caller.signal });
    if (stop === 'caller') caller.abort(reason);
    else if (stop === 'teardown') registration.teardown();
    else await registration.register(createTools({ page: 'home', execute: () => ({ ok: true }) }));
    release.resolve();
    assert.equal((await pending).ok, false);
    await finished.promise;
    assert.equal(effects, 0, 'cancellation must reach the handler, not just hide its result');
    assert.equal(handlerSignal?.aborted, true);
    if (stop === 'caller') assert.equal(handlerSignal.reason, reason);
    else assert.equal(caller.signal.aborted, false, 'teardown must not abort the caller-owned signal');
    if (stop === 'replacement') {
      assert.equal(context.tools.get('search_bestprice').execute({ query: 'new' }).ok, true);
    }
  });
}

test('composed contracts keep sibling invocation signals independent', async t => {
  const context = createLocalModelContext();
  const registration = createRegistration({ modelContext: context });
  const release = deferred();
  const signals = new Map();
  t.after(() => {
    release.resolve();
    registration.teardown();
  });
  await registration.register(createTools({
    page: 'home',
    execute: async (_name, args, options) => {
      signals.set(args.query, options?.signal);
      await release.promise;
      return { ok: true };
    },
  }));
  const caller = new AbortController();
  const tool = context.tools.get('search_bestprice');
  const first = tool.execute({ query: 'first' }, { signal: caller.signal });
  const second = tool.execute({ query: 'second' });
  caller.abort();
  release.resolve();
  assert.equal((await first).ok, false);
  assert.equal((await second).ok, true);
  assert.equal(signals.get('first')?.aborted, true);
  assert.equal(signals.get('second')?.aborted, false);
  assert.notEqual(signals.get('first'), signals.get('second'));
});

test('binding preserves original throws, promise identity, and calls without options', async () => {
  const error = new Error('original handler failure');
  const [throwing] = createTools({ page: 'home', execute: () => { throw error; } });
  assert.throws(() => throwing.execute({}), received => received === error);
  const pending = Promise.resolve({ ok: true });
  const [asyncTool] = createTools({ page: 'home', execute: () => pending });
  assert.equal(asyncTool.execute({}), pending);
  assert.equal((await pending).ok, true);
});

for (const execute of [undefined, null, false, {}, 'handler']) {
  test(`rejects a non-callable executor at construction: ${String(execute)}`, () => {
    assert.throws(() => createTools({ page: 'home', execute }), /execute must be a function/u);
  });
}

for (const page of ['constructor', 'toString', '__proto__']) {
  test(`rejects inherited page name ${page} as an unknown page`, () => {
    assert.throws(() => createTools({ page, execute: () => {} }), /Unknown WebMCP page type/u);
  });
}
