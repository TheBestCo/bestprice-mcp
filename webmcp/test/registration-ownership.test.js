/** Synthetic lifecycle tests, never native browser or shopper qualification. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const tool = (name, execute = () => ({ ok: true })) => ({ name, execute });
const refused = async callback => {
  let result;
  try {
    result = await callback();
  } catch {
    return;
  }
  assert.equal(result?.ok, false, 'an unavailable callback must refuse, never execute');
};

for (const ending of ['success', 'failure', 'timeout']) {
  test(`no partial batch executes while another registration is pending (${ending})`, async t => {
    const captured = new Map();
    const slow = deferred();
    let executions = 0;
    const registration = createRegistration({
      timeoutMs: ending === 'timeout' ? 20 : 1000,
      modelContext: {
        registerTool(value) {
          captured.set(value.name, value);
          return value.name === 'slow' ? slow.promise : undefined;
        },
      },
    });
    t.after(() => {
      slow.resolve();
      registration.teardown();
    });
    const pending = registration.register([
      tool('fast', () => {
        executions += 1;
        return { ok: true };
      }),
      tool('slow'),
    ]);
    await nextTurn();
    await refused(() => captured.get('fast').execute({}));
    assert.equal(executions, 0);
    if (ending === 'success') slow.resolve();
    if (ending === 'failure') slow.resolve(Promise.reject(new Error('registration failed')));
    const result = await pending;
    assert.equal(result.status, ending === 'success' ? 'ready' : 'degraded');
    if (ending !== 'success') await refused(() => captured.get('fast').execute({}));
  });
}

for (const ending of ['teardown', 'replacement']) {
  test(`retained callback cannot execute after ${ending}`, async () => {
    const context = createLocalModelContext();
    const registration = createRegistration({ modelContext: context });
    let executions = 0;
    await registration.register([
      tool('old', () => {
        executions += 1;
        return { ok: true };
      }),
    ]);
    const retained = context.tools.get('old');
    if (ending === 'teardown') registration.teardown();
    else await registration.register([tool('new')]);
    try {
      await refused(() => retained.execute({}));
      assert.equal(executions, 0);
    } finally {
      registration.teardown();
    }
  });
}

test('an already-cancelled invocation never reaches the tool', async () => {
  const context = createLocalModelContext();
  const registration = createRegistration({ modelContext: context });
  let executions = 0;
  await registration.register([
    tool('safe', () => {
      executions += 1;
      return { ok: true };
    }),
  ]);
  const controller = new AbortController();
  controller.abort();
  try {
    await refused(() => context.tools.get('safe').execute({}, { signal: controller.signal }));
    assert.equal(executions, 0);
  } finally {
    registration.teardown();
  }
});

test('teardown before queued registration prevents all browser calls', async () => {
  let calls = 0;
  const registration = createRegistration({
    modelContext: {
      registerTool() {
        calls += 1;
      },
    },
  });
  const pending = registration.register([tool('old')]);
  registration.teardown();
  assert.equal((await pending).status, 'cancelled');
  assert.equal(calls, 0);
});

test('mutating the caller array and execute property cannot change an in-flight batch', async () => {
  const context = createLocalModelContext();
  const registration = createRegistration({ modelContext: context });
  const original = tool('first', () => ({ ok: true, value: 'original' }));
  const input = [original];
  const pending = registration.register(input);
  input.push(tool('injected'));
  original.execute = () => ({ ok: true, value: 'mutated' });
  try {
    assert.deepEqual(await pending, { status: 'ready', registered: 1 });
    assert.equal((await context.tools.get('first').execute({})).value, 'original');
    assert.equal(context.tools.has('injected'), false);
  } finally {
    registration.teardown();
  }
});

for (const input of [null, {}, [null], [tool('same'), tool('same')], new Array(1)]) {
  test(`invalid batch ${JSON.stringify(input)} fails closed without partial browser registration`, async () => {
    let calls = 0;
    const registration = createRegistration({
      modelContext: {
        registerTool() {
          calls += 1;
        },
      },
    });
    try {
      assert.deepEqual(await registration.register(input), { status: 'degraded', registered: 0 });
      assert.equal(calls, 0);
    } finally {
      registration.teardown();
    }
  });
}

test('a throwing state observer cannot interrupt cleanup or registration', async () => {
  const context = createLocalModelContext();
  const registration = createRegistration({
    modelContext: context,
    onState() {
      throw new Error('observer failed');
    },
  });
  assert.equal((await registration.register([tool('safe')])).status, 'ready');
  assert.doesNotThrow(() => registration.teardown());
  assert.equal(context.tools.size, 0);
});

test('a state observer cannot rewrite the returned readiness verdict', async () => {
  const registration = createRegistration({
    modelContext: createLocalModelContext(),
    onState(state) {
      state.status = 'forged';
      state.registered = 100;
    },
  });
  try {
    assert.deepEqual(await registration.register([tool('safe')]), { status: 'ready', registered: 1 });
  } finally {
    registration.teardown();
  }
});

test('reentrant replacement from an abort listener keeps ownership and tears down cleanly', async () => {
  let registration;
  let replacement;
  let replaced = false;
  const context = createLocalModelContext();
  const modelContext = {
    registerTool(value, options) {
      context.registerTool(value, options);
      if (value.name === 'old')
        options.signal.addEventListener(
          'abort',
          () => {
            if (replaced) return;
            replaced = true;
            replacement = registration.register([tool('replacement')]);
          },
          { once: true },
        );
    },
  };
  registration = createRegistration({ modelContext });
  await registration.register([tool('old')]);
  const superseded = registration.register([tool('outer')]);
  assert.equal((await replacement).status, 'ready');
  assert.equal((await superseded).status, 'cancelled');
  assert.deepEqual([...context.tools.keys()], ['replacement']);
  registration.teardown();
  assert.equal(context.tools.size, 0);
});

test('teardown from the ready observer cannot return a stale ready verdict', async () => {
  const context = createLocalModelContext();
  let registration;
  registration = createRegistration({
    modelContext: context,
    onState(state) {
      if (state.status === 'ready') registration.teardown();
    },
  });
  assert.equal((await registration.register([tool('safe')])).status, 'cancelled');
  assert.equal(context.tools.size, 0);
});

test('local registration rejects an already-aborted lifetime', () => {
  const context = createLocalModelContext();
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => context.registerTool(tool('expired'), { signal: controller.signal }));
  assert.equal(context.tools.size, 0);
});

test('local duplicate registration does not replace the first owner', () => {
  const context = createLocalModelContext();
  const first = tool('same');
  context.registerTool(first);
  assert.throws(() => context.registerTool(tool('same')));
  assert.equal(context.tools.get('same'), first);
});

test('a throwing local observer rolls back registration', () => {
  const context = createLocalModelContext(() => {
    throw new Error('observer failed');
  });
  assert.throws(() => context.registerTool(tool('safe')));
  assert.equal(context.tools.size, 0);
});

test('abort during the local observer removes the registered tool', () => {
  const controller = new AbortController();
  const context = createLocalModelContext(() => controller.abort());
  context.registerTool(tool('safe'), { signal: controller.signal });
  assert.equal(context.tools.size, 0);
});

test('an old lifetime cannot remove a different tool with the same name', () => {
  const context = createLocalModelContext();
  const controller = new AbortController();
  context.registerTool(tool('same'), { signal: controller.signal });
  const replacement = tool('same');
  context.tools.set('same', replacement);
  controller.abort();
  assert.equal(context.tools.get('same'), replacement);
});

test('ready callbacks preserve arguments, receiver, return value and thrown errors', async () => {
  const context = createLocalModelContext();
  const registration = createRegistration({ modelContext: context });
  const failure = new Error('tool failure');
  await registration.register([
    tool('safe', function (args, options) {
      if (args.fail) throw failure;
      return { ok: true, name: this.name, args, options };
    }),
  ]);
  try {
    const args = { value: 1 };
    const options = { custom: true };
    const actual = context.tools.get('safe').execute(args, options);
    assert.deepEqual(actual, {
      ok: true,
      name: 'safe',
      args,
      options: { ...options, signal: actual.options.signal },
    });
    assert.ok(actual.options.signal instanceof AbortSignal);
    assert.equal(actual.options.signal.aborted, false);
    assert.equal(actual.args, args);
    assert.deepEqual(options, { custom: true }, 'the caller options are not mutated');
    await assert.rejects(
      async () => context.tools.get('safe').execute({ fail: true }),
      error => error === failure,
    );
  } finally {
    registration.teardown();
  }
});

test('a getter that reenters registration cannot replace the newer owner', async () => {
  const context = createLocalModelContext();
  const registration = createRegistration({ modelContext: context });
  let replacement;
  const outer = {
    get name() {
      replacement = registration.register([tool('replacement')]);
      return 'outer';
    },
    execute: () => ({ ok: true }),
  };
  const superseded = registration.register([outer]);
  try {
    assert.equal((await replacement).status, 'ready');
    assert.equal((await superseded).status, 'cancelled');
    assert.deepEqual([...context.tools.keys()], ['replacement']);
  } finally {
    registration.teardown();
  }
});

test('teardown in the registering observer prevents dispatch', async () => {
  let calls = 0;
  let registration;
  registration = createRegistration({
    modelContext: {
      registerTool() {
        calls += 1;
      },
    },
    onState(state) {
      if (state.status === 'registering') registration.teardown();
    },
  });
  assert.equal((await registration.register([tool('safe')])).status, 'cancelled');
  assert.equal(calls, 0);
});

for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2147483648]) {
  test(`invalid registration timeout ${timeoutMs} is rejected before any registration`, () => {
    assert.throws(() => createRegistration({ timeoutMs }), TypeError);
  });
}

test('an empty batch stays a compatible ready state with zero tools', async () => {
  const registration = createRegistration({ modelContext: createLocalModelContext() });
  assert.deepEqual(await registration.register([]), { status: 'ready', registered: 0 });
  registration.teardown();
});
