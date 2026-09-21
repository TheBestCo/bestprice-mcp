import assert from 'node:assert/strict';
import test from 'node:test';
import { createRegistration } from '../webmcp/src/runtime.js';

const setup = execute => {
  let tool;
  const registration = createRegistration({
    modelContext: {
      registerTool: value => {
        tool = value;
      },
    },
    onState: () => Promise.reject(new Error('optional observer failure')),
  });
  return {
    ready: async () => {
      const state = await registration.register([{ name: 'read_fixture', execute }]);
      assert.equal(state.status, 'ready');
      return (...args) => tool.execute(...args);
    },
    close: () => registration.teardown(),
  };
};

// Shared deterministic workload. Network-free, synthetic registration only.
export async function exerciseLifecycle(createFixture, cycles = 25, width = 16) {
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const bounded = async promise => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Lifecycle waiter did not settle')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  let execute;
  let calls = 0;
  const fixture = createFixture((args, options) => execute(args, options));
  try {
    for (let cycle = 0; cycle < cycles; cycle++) {
      const signals = [];
      const pending = [];
      const parents = Array.from({ length: width }, () => new AbortController());
      const reasons = parents.map((_, id) => ({ cycle, id }));
      execute = ({ id }, { signal }) => {
        calls++;
        signals[id] = signal;
        signal.addEventListener('abort', event => event.stopImmediatePropagation());
        if (id % 4 === 0) return { ok: true, cycle, id };
        return new Promise((resolve, reject) => {
          pending[id] = { resolve, reject };
        });
      };
      const invoke = await fixture.ready();
      const outputs = parents.map((parent, id) => {
        parent.signal.addEventListener('abort', event => event.stopImmediatePropagation());
        return Promise.resolve(invoke({ id }, { signal: parent.signal }));
      });
      check(signals.length === width, 'Every live invocation must execute once');
      for (let id = 0; id < width; id++) {
        // Fabricated public events are not real cancellation and must not consume it.
        parents[id].signal.dispatchEvent(new Event('abort'));
        signals[id].dispatchEvent(new Event('abort'));
        if (id % 4 === 1) parents[id].abort(reasons[id]);
        if (id % 4 === 2) pending[id].resolve({ ok: true, cycle, id });
      }
      const beforeClose = await bounded(Promise.all(outputs.filter((_, id) => id % 4 !== 3)));
      let offset = 0;
      for (let id = 0; id < width; id++) {
        if (id % 4 === 3) continue;
        const value = beforeClose[offset++];
        check(value.ok === (id % 4 !== 1), 'A sibling or fabricated event changed the result');
        if (id % 4 === 1) check(signals[id].reason === reasons[id], 'Caller cancellation reason changed');
        else check(value.cycle === cycle && value.id === id, 'An invocation received another result');
      }
      fixture.close();
      const results = await bounded(Promise.all(outputs));
      for (let id = 0; id < width; id++) {
        check(signals[id].aborted, 'Teardown left a handler or confirmation watcher live');
        check(parents[id].signal.aborted === (id % 4 === 1), 'Teardown mutated a caller-owned signal');
        if (id % 4 === 3) check(results[id].ok === false, 'Teardown published obsolete success');
        // Late outcomes must be observed without replacing an already-settled refusal.
        if (id % 4 === 1) pending[id].reject(new Error('late fixture failure'));
        if (id % 4 === 3) pending[id].resolve({ ok: true });
      }
      await Promise.resolve();
      const countBefore = calls;
      check((await bounded(Promise.resolve(invoke({ id: 0 })))).ok === false, 'A stale tool ran');
      check(calls === countBefore, 'Stale registration caused another effect');
      check((await Promise.all(outputs)).every((value, id) => value === results[id]), 'Settlement changed');
    }
    check(calls === cycles * width, 'Duplicate or missing tool execution');
    return { cycles, invocations: calls, staleCallsRefused: cycles };
  } finally {
    fixture.close();
  }
}

test('25 generations and 400 mixed invocations retain isolation, cancellation and cleanup', {
  timeout: 12000,
}, async () => {
  assert.deepEqual(await exerciseLifecycle(setup), { cycles: 25, invocations: 400, staleCallsRefused: 25 });
});
