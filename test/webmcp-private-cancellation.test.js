import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { createRegistration } from '../webmcp/src/runtime.js';

const setup = async (t, execute, onRegistrationAbort) => {
  let tool;
  let lifetime;
  const registry = createRegistration({
    modelContext: {
      registerTool(value, { signal }) {
        tool = value;
        lifetime = signal;
        if (onRegistrationAbort) signal.addEventListener('abort', onRegistrationAbort);
      },
    },
  });
  t.after(() => registry.teardown());
  assert.equal((await registry.register([{ name: 'read_test', execute }])).status, 'ready');
  return { invoke: (...args) => tool.execute(...args), lifetime, close: () => registry.teardown() };
};

// Network-free lifecycle regressions. These adapters are not native WebMCP qualification.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = async promise => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Cancellation did not settle the waiter')), 500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

for (const location of ['caller', 'handler', 'registration']) {
  test(`real abort survives a stopping listener on ${location}`, async t => {
    const parent = new AbortController();
    const reason = new Error('private test reason');
    const stop = event => event.stopImmediatePropagation();
    if (location === 'caller') parent.signal.addEventListener('abort', stop);
    let child;
    const fixture = await setup(
      t,
      (_args, { signal }) => {
        child = signal;
        if (location === 'handler') signal.addEventListener('abort', stop);
        return new Promise(() => {});
      },
      location === 'registration' ? stop : undefined,
    );
    const pending = fixture.invoke({}, { signal: parent.signal });
    if (location === 'registration') fixture.close();
    else parent.abort(reason);
    assert.equal((await bounded(pending)).ok, false);
    assert.equal(child.aborted, true);
    if (location !== 'registration') assert.equal(child.reason, reason);
  });

  test(`fabricated abort on ${location} does not cancel live work`, async t => {
    const parent = new AbortController();
    let child;
    let finish;
    const fixture = await setup(t, (_args, { signal }) => {
      child = signal;
      return new Promise(resolve => {
        finish = resolve;
      });
    });
    const pending = fixture.invoke({}, { signal: parent.signal });
    const target = location === 'caller' ? parent.signal : location === 'handler' ? child : fixture.lifetime;
    target.dispatchEvent(new Event('abort'));
    await pause(40);
    assert.equal(target.aborted, false);
    const answer = { ok: true, marker: 'unchanged' };
    finish(answer);
    assert.equal(await bounded(pending), answer);
  });
}

test('fabricated caller event cannot consume the real cancellation listener', async t => {
  const parent = new AbortController();
  const fixture = await setup(t, () => new Promise(() => {}));
  const pending = fixture.invoke({}, { signal: parent.signal });
  parent.signal.dispatchEvent(new Event('abort'));
  await pause(40);
  parent.abort(new Error('real cancellation'));
  assert.equal((await bounded(pending)).ok, false);
});

test('cancelling one invocation leaves its sibling and caller-owned signals intact', async t => {
  const parents = [new AbortController(), new AbortController()];
  const children = [];
  const finishes = [];
  const fixture = await setup(t, (_args, { signal }) => {
    children.push(signal);
    return new Promise(resolve => {
      finishes.push(resolve);
    });
  });
  const first = fixture.invoke({}, { signal: parents[0].signal });
  const second = fixture.invoke({}, { signal: parents[1].signal });
  const reason = { kind: 'caller-cancelled' };
  parents[0].abort(reason);
  assert.equal((await bounded(first)).ok, false);
  assert.equal(children[0].reason, reason);
  assert.equal(children[1].aborted, false);
  assert.equal(parents[1].signal.aborted, false);
  const answer = { ok: true };
  finishes[1](answer);
  assert.equal(await bounded(second), answer);
});

for (const source of ['caller', 'registration']) {
  test(`confirmation signal survives immediate receipt until ${source} cancellation`, async t => {
    const parent = new AbortController();
    let child;
    const receipt = { ok: true, outcome: 'dispatched' };
    const fixture = await setup(t, (_args, { signal }) => {
      child = signal;
      return receipt;
    });
    assert.equal(await fixture.invoke({}, { signal: parent.signal }), receipt);
    assert.equal(child.aborted, false);
    if (source === 'caller') parent.abort(receipt);
    else fixture.close();
    assert.equal(child.aborted, true);
    if (source === 'caller') assert.equal(child.reason, receipt);
    else assert.equal(parent.signal.aborted, false);
  });
}

for (const outcome of ['resolve', 'reject']) {
  test(`late handler ${outcome} cannot replace cancellation or become unhandled`, async t => {
    const parent = new AbortController();
    let resolve;
    let reject;
    const fixture = await setup(
      t,
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    const pending = fixture.invoke({}, { signal: parent.signal });
    parent.abort();
    const cancelled = await bounded(pending);
    assert.equal(cancelled.ok, false);
    if (outcome === 'resolve') resolve({ ok: true });
    else reject(new Error('late handler failure'));
    await pause(0);
    assert.equal(await pending, cancelled);
  });
}

test('an already cancelled caller cannot execute a tool', async t => {
  let calls = 0;
  const fixture = await setup(t, () => {
    calls++;
    return { ok: true };
  });
  const parent = new AbortController();
  parent.abort();
  assert.equal((await fixture.invoke({}, { signal: parent.signal })).ok, false);
  assert.equal(calls, 0);
});

test('settled invocation leaves no waiter listener on public signals', async t => {
  const parent = new AbortController();
  const external = () => {};
  parent.signal.addEventListener('abort', external);
  const fixture = await setup(t, () => ({ ok: true }));
  await fixture.invoke({}, { signal: parent.signal });
  assert.deepEqual(getEventListeners(parent.signal, 'abort'), [external]);
});

test('parallel caller cancellation settles every waiter without aborting registration', async t => {
  const parent = new AbortController();
  parent.signal.addEventListener('abort', event => event.stopImmediatePropagation());
  const fixture = await setup(t, () => new Promise(() => {}));
  const calls = Array.from({ length: 20 }, () => fixture.invoke({}, { signal: parent.signal }));
  parent.abort();
  const results = await bounded(Promise.all(calls));
  assert.equal(
    results.every(result => result.ok === false),
    true,
  );
  assert.equal(fixture.lifetime.aborted, false);
});

test('live synchronous return and throw identity remain unchanged', async t => {
  const receipt = { ok: true };
  const first = await setup(t, () => receipt);
  assert.equal(first.invoke({}), receipt);
  const error = new Error('original handler exception');
  const second = await setup(t, () => {
    throw error;
  });
  assert.throws(
    () => second.invoke({}),
    value => value === error,
  );
});
