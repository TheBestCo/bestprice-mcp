/** Reference-runtime lifecycle controls; no browser/model qualification evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

for (const asynchronous of [false, true]) {
  for (const ending of ['caller', 'teardown', 'replacement']) {
    test(`${asynchronous ? 'async' : 'sync'} confirmation watcher remains cancellable after result: ${ending}`, async () => {
      const context = createLocalModelContext();
      const registration = createRegistration({ modelContext: context });
      const caller = new AbortController();
      let lifetime;
      let aborts = 0;
      const receipt = { ok: true, outcome: 'unconfirmed' };
      const tool = {
        name: 'watch',
        execute(_args, options) {
          lifetime = options.signal;
          lifetime.addEventListener('abort', () => aborts++, { once: true });
          return asynchronous ? Promise.resolve(receipt) : receipt;
        },
      };
      try {
        assert.equal((await registration.register([tool])).status, 'ready');
        const result = context.tools.get('watch').execute({}, { signal: caller.signal });
        if (!asynchronous) assert.equal(result, receipt, 'keep synchronous result identity');
        assert.equal(await result, receipt);
        assert.equal(lifetime.aborted, false, 'returning a receipt must not terminate its watcher');
        if (ending === 'caller') caller.abort(new Error('shopper changed their mind'));
        else if (ending === 'replacement')
          await registration.register([{ name: 'new', execute: () => ({ ok: true }) }]);
        else registration.teardown();
        assert.equal(
          lifetime.aborted,
          true,
          'completed invocation detached a still-live confirmation watcher',
        );
        assert.equal(aborts, 1);
        if (ending === 'caller') assert.equal(lifetime.reason, caller.signal.reason);
        else assert.equal(caller.signal.aborted, false, 'never abort a caller-owned signal');
      } finally {
        registration.teardown();
      }
    });
  }
}
