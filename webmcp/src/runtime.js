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
      onState({ ...state });
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
    const controller = new AbortController();
    let cancel;
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(CANCELLED);
    });
    const operation = { controller, cancel, ready: false };
    current = operation;
    const owns = () => mine === generation && current === operation && !controller.signal.aborted;
    const guarded = snapshot.map(value => ({
      ...value,
      execute: (...args) => {
        if (!owns() || !operation.ready || args[1]?.signal?.aborted === true) {
          return Promise.resolve({
            ok: false,
            error: 'The BestPrice page tools are not available right now.',
          });
        }
        return value.execute(...args);
      },
    }));
    report({ status: 'registering', registered: 0 });
    if (!owns()) return Promise.resolve(cancelledState());

    const registrations = Promise.allSettled(
      guarded.map(value =>
        Promise.resolve().then(() => {
          if (!owns()) throw CANCELLED;
          return modelContext.registerTool(value, { signal: controller.signal });
        }),
      ),
    );
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    return Promise.race([registrations, timeout, cancelled]).then(outcome => {
      clearTimeout(timer);
      if (!owns() || outcome === CANCELLED) return cancelledState();
      const registered =
        outcome === TIMED_OUT ? 0 : outcome.filter(result => result.status === 'fulfilled').length;
      if (outcome === TIMED_OUT || registered !== snapshot.length) {
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
