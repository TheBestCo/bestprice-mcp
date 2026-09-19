/** Monotonic registration-budget checks, using the real runtime and synthetic context. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const tool = name => ({ name, execute: () => ({ ok: true }) });

for (const elapsed of [1000, 1001]) {
  for (const outcome of ['resolve', 'reject']) {
    test(`${outcome} at elapsed ${elapsed} cannot publish late registration`, async t => {
      let clock = 0;
      t.mock.method(performance, 'now', () => clock);
      let retained;
      let signal;
      const states = [];
      const runtime = createRegistration({
        timeoutMs: 1000,
        onState: state => states.push(state),
        modelContext: {
          registerTool(value, options) {
            retained = value;
            signal = options.signal;
            clock += elapsed;
            if (outcome === 'reject') throw new Error('synthetic registration failure');
          },
        },
      });
      t.after(() => runtime.teardown());
      assert.deepEqual(await runtime.register([tool('first')]), { status: 'degraded', registered: 0 });
      assert.equal(signal.aborted, true);
      assert.equal((await retained.execute({})).ok, false);
      assert.equal(
        states.some(state => state.status === 'ready'),
        false,
      );
    });
  }
}

test('once the budget is consumed no later tool is sent to the browser', async t => {
  let clock = 0;
  const calls = [];
  const signals = [];
  t.mock.method(performance, 'now', () => clock);
  const runtime = createRegistration({
    timeoutMs: 1000,
    modelContext: {
      registerTool(value, { signal }) {
        calls.push(value.name);
        signals.push(signal);
        clock += 1000;
      },
    },
  });
  t.after(() => runtime.teardown());
  assert.deepEqual(await runtime.register([tool('first'), tool('second')]), {
    status: 'degraded',
    registered: 0,
  });
  assert.deepEqual(calls, ['first']);
  assert.ok(signals.every(signal => signal.aborted));
});

test('registering observer time is part of the budget', async t => {
  let clock = 0;
  const calls = [];
  t.mock.method(performance, 'now', () => clock);
  const runtime = createRegistration({
    timeoutMs: 1000,
    onState: state => {
      if (state.status === 'registering') clock += 1000;
    },
    modelContext: { registerTool: value => calls.push(value.name) },
  });
  t.after(() => runtime.teardown());
  assert.deepEqual(await runtime.register([tool('first')]), { status: 'degraded', registered: 0 });
  assert.deepEqual(calls, []);
});

test('registration that finishes one tick before expiry stays usable after its registration deadline', async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const context = createLocalModelContext(() => {
    clock += 999;
  });
  const runtime = createRegistration({ modelContext: context, timeoutMs: 1000 });
  t.after(() => runtime.teardown());
  assert.deepEqual(await runtime.register([tool('first')]), { status: 'ready', registered: 1 });
  clock += 5000;
  assert.equal(context.tools.get('first').execute({}).ok, true);
});

test('a timed-out generation cannot poison the next registration', async t => {
  let clock = 0;
  let slow = true;
  t.mock.method(performance, 'now', () => clock);
  const context = createLocalModelContext(() => {
    if (slow) clock += 1000;
  });
  const runtime = createRegistration({ modelContext: context, timeoutMs: 1000 });
  t.after(() => runtime.teardown());
  assert.deepEqual(await runtime.register([tool('first')]), { status: 'degraded', registered: 0 });
  assert.equal(context.tools.size, 0);
  slow = false;
  assert.deepEqual(await runtime.register([tool('second')]), { status: 'ready', registered: 1 });
  assert.equal(context.tools.get('second').execute({}).ok, true);
});

test('reentrant replacement retains ownership when the superseded generation also expires', async t => {
  let clock = 0;
  let replace = true;
  let next;
  t.mock.method(performance, 'now', () => clock);
  let runtime;
  const context = createLocalModelContext(() => {
    if (replace) {
      replace = false;
      clock += 1000;
      next = runtime.register([tool('second')]);
    }
  });
  runtime = createRegistration({ modelContext: context, timeoutMs: 1000 });
  t.after(() => runtime.teardown());
  assert.deepEqual(await runtime.register([tool('first')]), { status: 'cancelled', registered: 0 });
  assert.deepEqual(await next, { status: 'ready', registered: 1 });
  assert.deepEqual([...context.tools.keys()], ['second']);
});
