const DEFAULT_TIMEOUT_MS = 2500;
const CANCELLED = Symbol('cancelled');
const TIMED_OUT = Symbol('timed_out');

export function createRegistration({ modelContext, onState = () => {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let controller;
  let active;
  let cancel;
  let generation = 0;

  const teardown = () => {
    generation += 1;
    cancel?.();
    controller?.abort();
    cancel = undefined;
    controller = undefined;
    active = undefined;
    onState({ status: 'unavailable', registered: 0 });
  };

  const register = tools => {
    teardown();
    if (typeof modelContext?.registerTool !== 'function') {
      return Promise.resolve({ status: 'unavailable', registered: 0 });
    }

    const registrationController = new AbortController();
    const activeGeneration = ++generation;
    controller = registrationController;
    onState({ status: 'registering', registered: 0 });

    const registrations = Promise.allSettled(
      tools.map(tool =>
        Promise.resolve().then(() => modelContext.registerTool(tool, { signal: registrationController.signal }))
      )
    );
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    const cancelled = new Promise(resolve => {
      cancel = () => resolve(CANCELLED);
    });

    const pending = Promise.race([registrations, timeout, cancelled]).then(results => {
      clearTimeout(timer);
      const current = activeGeneration === generation && controller === registrationController;
      if (!current || results === CANCELLED) return { status: 'cancelled', registered: 0 };

      if (results === TIMED_OUT) {
        registrationController.abort();
        active = undefined;
        controller = undefined;
        cancel = undefined;
        onState({ status: 'degraded', registered: 0 });
        return { status: 'degraded', registered: 0 };
      }

      const registered = results.filter(result => result.status === 'fulfilled').length;
      const ready = registered === tools.length;
      if (!ready) registrationController.abort();
      const state = { status: ready ? 'ready' : 'degraded', registered: ready ? registered : 0 };
      onState(state);
      cancel = undefined;
      if (!ready) {
        active = undefined;
        controller = undefined;
      }
      return state;
    });

    active = pending;
    return pending;
  };

  return { register, teardown };
}

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
