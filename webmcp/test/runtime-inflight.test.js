/** Controlled model contexts, not native browser or shopper qualification. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { createRegistration } from '../src/runtime.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const within = async promise => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('invocation did not settle after cancellation')), 250);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
async function fixture(t, execute) {
  const published = [];
  const registration = createRegistration({
    modelContext: { registerTool: tool => published.push(tool) },
  });
  t.after(() => registration.teardown());
  assert.equal((await registration.register([{ name: 'read', execute }])).status, 'ready');
  return { registration, published, tool: published[0] };
}

for (const transition of ['teardown', 'replacement']) {
  test(`${transition} cancels running work and refuses its late success`, async t => {
    const release = deferred();
    t.after(() => release.resolve({ ok: true }));
    let signal;
    let effects = 0;
    const { registration, tool } = await fixture(t, async (_args, options) => {
      signal = options?.signal;
      await release.promise;
      if (!signal?.aborted) effects += 1;
      return { ok: true };
    });
    const pending = tool.execute({});
    if (transition === 'teardown') registration.teardown();
    else await registration.register([{ name: 'next', execute: () => ({ ok: true }) }]);
    release.resolve();
    const result = await pending;
    assert.equal(signal?.aborted, true, 'handler must receive the registration lifetime');
    assert.equal(result.ok, false, 'obsolete completion cannot appear successful');
    assert.equal(effects, 0, 'cooperative handler performs no post-cancellation effect');
  });

  test(`${transition} settles even when the old handler ignores cancellation`, async t => {
    const { registration, tool } = await fixture(t, () => new Promise(() => {}));
    const pending = tool.execute({});
    if (transition === 'teardown') registration.teardown();
    else await registration.register([{ name: 'next', execute: () => ({ ok: true }) }]);
    assert.equal((await within(pending)).ok, false);
  });
}

test('one invocation cancellation preserves a sibling and the live registration', async t => {
  const release = deferred();
  t.after(() => release.resolve());
  const signals = [];
  const { tool } = await fixture(t, async (args, options) => {
    signals.push(options?.signal);
    if (args.slow) await release.promise;
    return { ok: true, value: args.value };
  });
  const parent = new AbortController();
  const first = tool.execute({ slow: true }, { signal: parent.signal });
  parent.abort(new Error('only this request'));
  const second = await tool.execute({ value: 'healthy' });
  release.resolve();
  assert.equal((await first).ok, false);
  assert.deepEqual(second, { ok: true, value: 'healthy' });
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
  assert.notEqual(signals[0], signals[1]);
});

test('preserves other invocation options without mutating the caller options', async t => {
  const parent = new AbortController();
  const options = Object.freeze({ signal: parent.signal, marker: 'kept' });
  const args = Object.freeze({ id: 42 });
  const { tool } = await fixture(t, (received, forwarded) => {
    assert.equal(received, args);
    assert.equal(forwarded.marker, 'kept');
    assert.ok(forwarded.signal instanceof AbortSignal);
    assert.notEqual(forwarded.signal, parent.signal);
    return { ok: true };
  });
  assert.equal((await tool.execute(args, options)).ok, true);
  assert.equal(options.signal, parent.signal);
  assert.equal(parent.signal.aborted, false);
});

test('already-cancelled calls never enter the handler', async t => {
  let calls = 0;
  const { tool } = await fixture(t, () => {
    calls += 1;
    return { ok: true };
  });
  const parent = new AbortController();
  parent.abort();
  assert.equal((await tool.execute({}, { signal: parent.signal })).ok, false);
  assert.equal(calls, 0);
});

for (const mode of ['value', 'resolved', 'rejected', 'throw']) {
  test(`cleans up caller listeners on 100 ${mode} completions`, async t => {
    const error = new Error('original handler error');
    const { tool } = await fixture(t, () => {
      if (mode === 'throw') throw error;
      if (mode === 'rejected') return Promise.reject(error);
      const result = { ok: true };
      return mode === 'resolved' ? Promise.resolve(result) : result;
    });
    const parent = new AbortController();
    for (let i = 0; i < 100; i += 1) {
      if (mode === 'throw' || mode === 'rejected') {
        await assert.rejects(
          async () => tool.execute({}, { signal: parent.signal }),
          value => value === error,
        );
      } else assert.equal((await tool.execute({}, { signal: parent.signal })).ok, true);
      assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
    }
    assert.equal(parent.signal.aborted, false);
  });
}

test('observes a late handler rejection after cancellation', async t => {
  const release = deferred();
  const { registration, tool } = await fixture(t, () => release.promise);
  // Baseline also gets a rejection observer so reproduction cannot crash the test runner.
  const pending = tool.execute({}).then(
    value => ({ value }),
    error => ({ error }),
  );
  registration.teardown();
  release.reject(new Error('late handler failure'));
  const outcome = await within(pending);
  assert.equal(outcome.value?.ok, false);
  assert.equal(outcome.error, undefined);
});

test('cancelling 100 concurrent invocations releases every caller listener', async t => {
  const { registration, tool } = await fixture(t, () => new Promise(() => {}));
  const parents = Array.from({ length: 100 }, () => new AbortController());
  const pending = parents.map(parent => tool.execute({}, { signal: parent.signal }));
  registration.teardown();
  const results = await within(Promise.all(pending));
  assert.ok(results.every(result => result.ok === false));
  for (const parent of parents) {
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
    assert.equal(parent.signal.aborted, false, 'batch must not abort caller-owned controllers');
  }
});

test('keeps synchronous return identity, receiver and errors without retaining caller listeners', async t => {
  const result = { ok: true };
  const error = new Error('synchronous tool failure');
  const parent = new AbortController();
  const { tool } = await fixture(t, function (args) {
    assert.equal(this.name, 'read');
    if (args.fail) throw error;
    return result;
  });
  assert.equal(tool.execute({}, { signal: parent.signal }), result);
  assert.throws(() => tool.execute({ fail: true }, { signal: parent.signal }), value => value === error);
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
});

test('a handler that synchronously tears down cannot return an obsolete success', async t => {
  let registration;
  const data = await fixture(t, () => {
    registration.teardown();
    return { ok: true };
  });
  registration = data.registration;
  assert.equal((await data.tool.execute({})).ok, false);
});

for (const stop of ['teardown', 'caller abort']) {
  test(`option getter ${stop} is checked again before entering the handler`, async t => {
    let calls = 0;
    const { registration, tool } = await fixture(t, () => {
      calls += 1;
      return { ok: true };
    });
    const parent = new AbortController();
    const options = {
      signal: parent.signal,
      get marker() {
        if (stop === 'teardown') registration.teardown();
        else parent.abort();
        return 'cancelled';
      },
    };
    assert.equal((await tool.execute({}, options)).ok, false);
    assert.equal(calls, 0);
    assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
  });
}

test('reentrant replacement from a running handler abort cannot steal or cancel the new batch', async t => {
  let registration;
  let replacement;
  let replaced = false;
  const data = await fixture(t, (_args, options) => {
    options.signal.addEventListener(
      'abort',
      () => {
        if (replaced) return;
        replaced = true;
        replacement = registration.register([
          { name: 'read', execute: () => ({ ok: true, fresh: true }) },
        ]);
      },
      { once: true },
    );
    return new Promise(() => {});
  });
  registration = data.registration;
  const first = data.tool.execute({});
  const second = data.tool.execute({});
  registration.teardown();
  assert.ok((await within(Promise.all([first, second]))).every(value => value.ok === false));
  assert.equal((await replacement).status, 'ready');
  assert.deepEqual(await data.published.at(-1).execute({}), { ok: true, fresh: true });
});

test('an async state observer rejection cannot become an unhandled process failure', () => {
  const runtime = new URL('../src/runtime.js', import.meta.url).href;
  const script = `
    import { createRegistration, createLocalModelContext } from ${JSON.stringify(runtime)};
    const context = createLocalModelContext();
    const registration = createRegistration({ modelContext: context, onState: async () => { throw Error('sink'); } });
    const state = await registration.register([{ name: 'safe', execute: () => ({ ok: true }) }]);
    if (state.status !== 'ready') process.exitCode = 2;
    registration.teardown();
    if (context.tools.size !== 0) process.exitCode = 3;
    await new Promise(resolve => setImmediate(resolve));
  `;
  const result = spawnSync(
    process.execPath,
    ['--unhandled-rejections=strict', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 2000 },
  );
  assert.equal(result.status, 0, result.stderr);
});
