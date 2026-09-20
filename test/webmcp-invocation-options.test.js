import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistration } from '../webmcp/src/runtime.js';

async function setup(t, execute) {
  let tool;
  const registration = createRegistration({
    modelContext: {
      registerTool(value) {
        tool = value;
      },
    },
  });
  t.after(() => registration.teardown());
  assert.equal((await registration.register([{ name: 'read_test', execute }])).status, 'ready');
  return { invoke: (...args) => tool.execute(...args), close: () => registration.teardown() };
}

for (const signal of [false, 0, '', 'signal', {}, { aborted: false }, { aborted: true }]) {
  test(`invalid signal ${JSON.stringify(signal)} refuses before handler execution`, async t => {
    let calls = 0;
    const fixture = await setup(t, () => {
      calls++;
      return { ok: true };
    });
    assert.equal((await fixture.invoke({}, { signal })).ok, false);
    assert.equal(calls, 0);
  });
}

for (const signal of [undefined, null]) {
  test(`optional signal ${String(signal)} retains normal synchronous identity`, async t => {
    const receipt = { ok: true };
    const fixture = await setup(t, () => receipt);
    assert.equal(fixture.invoke({}, { signal }), receipt);
  });
}

test('reads signal once and keeps the first native signal live after a synchronous receipt', async t => {
  const first = new AbortController();
  const second = new AbortController();
  let reads = 0;
  let child;
  const receipt = { ok: true };
  const fixture = await setup(t, (_args, options) => {
    child = options.signal;
    assert.equal(options.marker, 42);
    return receipt;
  });
  const options = {
    marker: 42,
    get signal() {
      reads++;
      if (reads > 1) throw new Error('signal was read twice');
      return first.signal;
    },
  };
  assert.equal(fixture.invoke({}, options), receipt);
  assert.equal(reads, 1);
  assert.equal(options.marker, 42);
  second.abort();
  assert.equal(child.aborted, false);
  const reason = { kind: 'real-caller-cancellation' };
  first.abort(reason);
  assert.equal(child.aborted, true);
  assert.equal(child.reason, reason);
});

test('throwing option accessors fail closed without invoking a page tool', async t => {
  let calls = 0;
  const fixture = await setup(t, () => {
    calls++;
    return { ok: true };
  });
  for (const field of ['signal', 'marker']) {
    const options = Object.defineProperty({}, field, {
      enumerable: true,
      get() {
        throw new Error('private option getter');
      },
    });
    assert.equal((await fixture.invoke({}, options)).ok, false);
  }
  assert.equal(calls, 0);
});

for (const event of ['caller', 'registration']) {
  test(`option snapshot ${event} cancellation cannot enter the handler`, async t => {
    const caller = new AbortController();
    let calls = 0;
    const fixture = await setup(t, () => {
      calls++;
      return { ok: true };
    });
    const options = {
      signal: caller.signal,
      get marker() {
        if (event === 'caller') caller.abort();
        else fixture.close();
        return 1;
      },
    };
    assert.equal((await fixture.invoke({}, options)).ok, false);
    assert.equal(calls, 0);
  });
}

test('an aborted native signal cannot disguise itself with an own aborted property', async t => {
  const caller = new AbortController();
  caller.abort();
  Object.defineProperty(caller.signal, 'aborted', { value: false });
  let calls = 0;
  const fixture = await setup(t, () => {
    calls++;
    return { ok: true };
  });
  assert.equal((await fixture.invoke({}, { signal: caller.signal })).ok, false);
  assert.equal(calls, 0);
});

test('refused preparation does not damage a live sibling or the registration', async t => {
  const caller = new AbortController();
  let signal;
  const fixture = await setup(t, (_args, options) => {
    signal = options.signal;
    return { ok: true };
  });
  assert.equal((await fixture.invoke({}, { signal: false })).ok, false);
  assert.equal((await fixture.invoke({}, { signal: caller.signal })).ok, true);
  assert.equal(signal.aborted, false);
  assert.equal((await fixture.invoke({})).ok, true);
});
