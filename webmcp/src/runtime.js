/**
 * Registration runtime for WebMCP tools.
 *
 * Registers a page's tools into a `modelContext` (the browser's `navigator.modelContext` or the local
 * fallback below) and fails closed: if any tool cannot be registered, or registration does not settle
 * in time, every tool registered so far is aborted and the page reports `degraded` with zero tools.
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
  /** @type {{ controller: AbortController, cancel?: () => void } | undefined} */
  let current;
  let generation = 0;

  const report = state => {
    onState(state);
    return state;
  };

  const abandon = () => {
    generation += 1;
    current?.cancel?.();
    current?.controller.abort();
    current = undefined;
  };

  /** Aborts every registered tool and reports the page as unavailable. */
  const teardown = () => {
    abandon();
    report({ status: 'unavailable', registered: 0 });
  };

  /** Replaces any previous registration with `tools`; resolves with the final state. */
  const register = tools => {
    teardown();
    if (typeof modelContext?.registerTool !== 'function') {
      return Promise.resolve({ status: 'unavailable', registered: 0 });
    }

    const controller = new AbortController();
    const mine = ++generation;
    let cancel;
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(CANCELLED);
    });
    current = { controller, cancel };
    report({ status: 'registering', registered: 0 });

    const registrations = Promise.allSettled(
      tools.map(tool =>
        Promise.resolve().then(() => modelContext.registerTool(tool, { signal: controller.signal })),
      ),
    );
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });

    return Promise.race([registrations, timeout, cancelled]).then(outcome => {
      clearTimeout(timer);
      if (mine !== generation || outcome === CANCELLED) return { status: 'cancelled', registered: 0 };

      const registered =
        outcome === TIMED_OUT ? 0 : outcome.filter(result => result.status === 'fulfilled').length;
      if (registered !== tools.length) {
        controller.abort();
        current = undefined;
        return report({ status: 'degraded', registered: 0 });
      }
      current = { controller };
      return report({ status: 'ready', registered });
    });
  };

  return { register, teardown };
}

/**
 * A minimal in-page stand-in for `navigator.modelContext`, used when the browser has no WebMCP support.
 * Tools are kept in a Map and removed when their registration signal aborts.
 *
 * @param {(tool: object) => void} [onRegister]
 */
export function createLocalModelContext(onRegister = () => {}) {
  const tools = new Map();
  return {
    tools,
    registerTool(tool, { signal } = {}) {
      if (!tool?.name || typeof tool.execute !== 'function') throw new TypeError('Invalid WebMCP tool.');
      tools.set(tool.name, tool);
      onRegister(tool);
      signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true });
    },
  };
}
