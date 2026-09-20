/**
 * Registration runtime for WebMCP tools.
 *
 * The browser's document.modelContext and the local adapter may retain callbacks even while
 * registration is pending or after unregistration. Execution therefore checks batch ownership
 * independently of registration rollback. Synthetic adapter runs are never native evidence.
 */

const DEFAULT_TIMEOUT_MS = 2500;
const CANCELLED = Symbol('cancelled');
const TIMED_OUT = Symbol('timed_out');

/**
 * @typedef {{ status: 'unavailable' | 'registering' | 'ready' | 'degraded' | 'cancelled', registered: number }} RegistrationState
 */

/**
 * @param {{
 *   modelContext?: { registerTool?: (tool: object, options: { signal: AbortSignal }) => unknown },
 *   onState?: (state: RegistrationState) => void,
 *   timeoutMs?: number,
 * }} options
 * @returns {{ register: (tools: object[]) => Promise<RegistrationState>, teardown: () => void }}
 */
export function createRegistration({ modelContext, onState = () => {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new TypeError('Registration timeout must be a positive, supported timer interval.');
  }
  let current;
  let generation = 0;
  const cancelledState = () => ({ status: 'cancelled', registered: 0 });
  const report = state => {
    try {
      // Observers neither own the verdict nor the registration lifecycle.
      Promise.resolve(onState({ ...state })).catch(() => {});
    } catch {
      // Telemetry must not strand tools or prevent teardown.
    }
    return state;
  };

  const abandon = () => {
    const mine = ++generation;
    const previous = current;
    // Detach BEFORE abort dispatch: an abort listener can synchronously register a new batch.
    current = undefined;
    previous?.cancel?.();
    previous?.controller.abort();
    return mine;
  };

  const teardown = () => {
    const mine = abandon();
    if (mine === generation) report({ status: 'unavailable', registered: 0 });
  };

  const register = tools => {
    const mine = abandon();
    if (mine !== generation) return Promise.resolve(cancelledState());
    report({ status: 'unavailable', registered: 0 });
    if (mine !== generation) return Promise.resolve(cancelledState());
    if (typeof modelContext?.registerTool !== 'function') {
      return Promise.resolve({ status: 'unavailable', registered: 0 });
    }

    let snapshot;
    try {
      if (!Array.isArray(tools)) throw new TypeError('Expected a tool array.');
      const names = new Set();
      // Array.from also visits holes; a sparse array must not count as a complete registration.
      snapshot = Array.from(tools, value => {
        const copy = { ...value };
        if (
          typeof copy.name !== 'string' ||
          !copy.name.trim() ||
          typeof copy.execute !== 'function' ||
          names.has(copy.name)
        ) {
          throw new TypeError('Invalid or duplicate WebMCP tool.');
        }
        names.add(copy.name);
        return copy;
      });
    } catch {
      const state = report({ status: 'degraded', registered: 0 });
      return Promise.resolve(mine === generation ? state : cancelledState());
    }

    if (mine !== generation) return Promise.resolve(cancelledState());
    // Timers cannot preempt synchronous registration or a busy microtask queue. Keep
    // a monotonic budget too, starting before registration observers and browser calls.
    const expiresAt = performance.now() + timeoutMs;
    const expired = () => performance.now() >= expiresAt;
    const controller = new AbortController();
    let cancel;
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(CANCELLED);
    });
    const operation = { controller, cancel, ready: false };
    current = operation;
    const owns = () => mine === generation && current === operation && !controller.signal.aborted;
    const refusal = () => ({
      ok: false,
      error: 'The BestPrice page tools are not available right now.',
    });
    // One registration listener, even with many concurrent invocations. Each invocation owns
    // its own composed signal: cancelling one must not abort a sibling or a caller-owned signal.
    const invocations = new Set();
    controller.signal.addEventListener(
      'abort',
      () => {
        for (const cancel of [...invocations]) cancel();
      },
      { once: true },
    );
    const guarded = snapshot.map(value => ({
      ...value,
      execute: (...args) => {
        const parent = args[1]?.signal;
        if (!owns() || !operation.ready || parent?.aborted === true) {
          return Promise.resolve(refusal());
        }
        // The result may be an immediate dispatch receipt while a confirmation watcher
        // remains active. Native composition keeps that watcher bound to the caller and
        // registration after waiter bookkeeping is released, without a retained manual listener.
        const invocationSignal = AbortSignal.any([controller.signal, parent].filter(Boolean));
        let resolve;
        let reject;
        const pending = new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        });
        let settled = false;
        const finish = (callback, result) => {
          if (settled) return;
          settled = true;
          invocations.delete(cancel);
          parent?.removeEventListener('abort', cancel);
          callback(result);
        };
        const cancel = () => {
          if (settled) return;
          // Release the waiter once even when an abort listener re-enters the registry.
          finish(resolve, refusal());
        };
        invocations.add(cancel);
        try {
          parent?.addEventListener('abort', cancel, { once: true });
          args[1] = { ...args[1], signal: invocationSignal };
          if (!owns() || parent?.aborted === true) {
            cancel();
            return pending;
          }
          const result = value.execute(...args);
          if (result != null && typeof result.then === 'function') {
            // Observe late rejections even if cancellation already settled the caller. The
            // signal lets cooperative handlers stop later effects; synchronous effects cannot
            // be undone. Original handler failures still reject while the invocation is live.
            Promise.resolve(result).then(
              output => finish(resolve, owns() ? output : refusal()),
              error => finish(reject, error),
            );
            return pending;
          }
          // Preserve synchronous handlers' return identity and thrown errors while still
          // refusing any result whose handler synchronously tore down its own registration.
          if (settled) return pending;
          if (!owns()) {
            cancel();
            return pending;
          }
          finish(resolve, undefined);
          return result;
        } catch (error) {
          if (settled) return pending;
          // This promise was not returned. Resolve it only to release bookkeeping, then
          // rethrow the original synchronous exception without manufacturing a rejection.
          finish(resolve, undefined);
          throw error;
        }
      },
    }));
    report({ status: 'registering', registered: 0 });
    if (!owns()) return Promise.resolve(cancelledState());

    const registrations = Promise.allSettled(
      guarded.map(value =>
        Promise.resolve().then(() => {
          if (!owns()) throw CANCELLED;
          if (expired()) throw TIMED_OUT;
          return modelContext.registerTool(value, { signal: controller.signal });
        }),
      ),
    );
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), Math.max(1, Math.ceil(expiresAt - performance.now())));
    });
    return Promise.race([registrations, timeout, cancelled]).then(outcome => {
      clearTimeout(timer);
      if (!owns() || outcome === CANCELLED) return cancelledState();
      const timedOut = outcome === TIMED_OUT || expired();
      const registered = timedOut ? 0 : outcome.filter(result => result.status === 'fulfilled').length;
      if (timedOut || registered !== snapshot.length) {
        current = undefined;
        controller.abort();
        if (mine !== generation) return cancelledState();
        const state = report({ status: 'degraded', registered: 0 });
        return mine === generation ? state : cancelledState();
      }
      operation.ready = true;
      operation.cancel = undefined;
      const state = report({ status: 'ready', registered });
      return owns() ? state : cancelledState();
    });
  };

  return { register, teardown };
}

/** Minimal synthetic stand-in, not a polyfill or native-browser evidence. */
export function createLocalModelContext(onRegister = () => {}) {
  const tools = new Map();
  return {
    tools,
    registerTool(tool, { signal } = {}) {
      if (typeof tool?.name !== 'string' || !tool.name.trim() || typeof tool.execute !== 'function') {
        throw new TypeError('Invalid WebMCP tool.');
      }
      if (signal?.aborted) throw signal.reason ?? new Error('Registration aborted.');
      if (tools.has(tool.name)) throw new TypeError('Duplicate WebMCP tool.');
      const name = tool.name;
      const remove = () => {
        if (tools.get(name) === tool) tools.delete(name);
        signal?.removeEventListener('abort', remove);
      };
      // Observe abort before exposing the registration to a potentially reentrant callback.
      signal?.addEventListener('abort', remove, { once: true });
      tools.set(name, tool);
      try {
        onRegister(tool);
      } catch (error) {
        remove();
        throw error;
      }
    },
  };
}
