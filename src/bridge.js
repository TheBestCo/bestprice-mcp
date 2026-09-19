/**
 * Bridges a local stdio MCP host to the public BestPrice Streamable HTTP endpoint.
 *
 * The bridge is a full MCP client towards the remote (so the SDK owns sessions, protocol
 * negotiation, and SSE parsing) and a full MCP server towards the local host. Every request the
 * host sends is delegated to the remote; nothing is answered locally except `initialize`, which is
 * built from what the remote reported when the bridge connected.
 */

import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  ResultSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

const pkg = createRequire(import.meta.url)('../package.json');

export const DEFAULT_REMOTE_URL = 'https://mcp.bestprice.gr/mcp';
export const DEFAULT_TIMEOUT_MS = 60_000;
export const BRIDGE_INFO = Object.freeze({ name: 'bestprice-mcp-stdio', version: pkg.version });

const MAX_TIMEOUT_MS = 2_147_483_647;
const validateTimeout = timeoutMs => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError(`BESTPRICE_MCP_TIMEOUT_MS must be a positive integer <= ${MAX_TIMEOUT_MS}`);
  }
};

/** Advertised when the remote cannot be reached at startup so the host still completes `initialize`. */
const FALLBACK_CAPABILITIES = Object.freeze({ tools: {} });
/** Every SDK hop prefixes error messages with `MCP error <code>: `; peel them all off before relaying. */
const MCP_ERROR_PREFIX = /^MCP error -?\d+: /u;
const stripPrefixes = message => {
  let clean = message;
  while (MCP_ERROR_PREFIX.test(clean)) clean = clean.replace(MCP_ERROR_PREFIX, '');
  return clean;
};

/* Cancel the waiter, not the shared operation. Observe late rejections even after cancellation,
 * and remove listeners on every settlement. In particular, one caller cannot abort initialize
 * for all the other callers sharing it. */
const waitForSignal = (promise, signal) =>
  new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });

/**
 * Reads bridge configuration from environment variables.
 *
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {{ remoteUrl: URL, timeoutMs: number }}
 * @throws {TypeError} for a non-http(s) URL or a timeout outside the supported timer interval.
 */
export function readConfig({ env = process.env } = {}) {
  const rawUrl = env.BESTPRICE_MCP_URL?.trim() || DEFAULT_REMOTE_URL;
  let remoteUrl;
  try {
    remoteUrl = new URL(rawUrl);
  } catch {
    throw new TypeError(`BESTPRICE_MCP_URL is not a valid URL: ${rawUrl}`);
  }
  if (remoteUrl.protocol !== 'https:' && remoteUrl.protocol !== 'http:') {
    throw new TypeError(`BESTPRICE_MCP_URL must use http or https: ${rawUrl}`);
  }

  const rawTimeout = env.BESTPRICE_MCP_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number(rawTimeout) : DEFAULT_TIMEOUT_MS;
  validateTimeout(timeoutMs);

  return { remoteUrl, timeoutMs };
}

/**
 * Creates a bridge between a local MCP server transport and a remote Streamable HTTP MCP server.
 *
 * @param {{
 *   remoteUrl: URL | string,
 *   timeoutMs?: number,
 *   fetch?: typeof globalThis.fetch,
 *   log?: (message: string) => void,
 * }} options `fetch` is injectable for tests; `log` receives diagnostics and must never write to stdout.
 * @returns {{
 *   connectRemote: () => Promise<Client>,
 *   start: (serverTransport: import('@modelcontextprotocol/sdk/shared/transport.js').Transport) => Promise<Server>,
 *   close: () => Promise<void>,
 *   client: () => Client | undefined,
 * }}
 */
export function createBridge({ remoteUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetch, log = () => {} }) {
  validateTimeout(timeoutMs);
  const url = new URL(remoteUrl);
  const requestOptions = { timeout: timeoutMs };
  let client;
  let connecting;
  let pendingClient;
  let server;
  let starting = false;
  let closed = false;
  let closing;
  const requests = new Set();
  const references = new Map();
  const retired = new Set();
  const cleanups = new Set();
  const closedError = () => new McpError(ErrorCode.ConnectionClosed, 'Bridge is closed.');

  /** Relay the original error code/data without accumulating SDK message prefixes. */
  const relay = (code, message, data) => Object.assign(new Error(message), { code, data });
  const toRelayError = error => {
    if (error instanceof McpError) return relay(error.code, stripPrefixes(error.message), error.data);
    return relay(ErrorCode.InternalError, `Upstream ${url.host}: ${error?.message ?? String(error)}`);
  };

  /** Only an explicit rejected-session response permits one replay of that request. */
  const isStaleSession = error =>
    error instanceof StreamableHTTPError &&
    (error.code === 404 || (error.code === 400 && /session|not initialized/iu.test(error.message)));

  const closeRemote = async (remote, terminate = false) => {
    if (!remote) return;
    if (terminate) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('Session termination timed out')),
        Math.min(timeoutMs, 1000),
      );
      try {
        await waitForSignal(remote.transport?.terminateSession?.(), controller.signal);
      } catch (error) {
        log(`Could not terminate upstream session: ${error.message}`);
      } finally {
        clearTimeout(timer);
      }
    }
    // Always abort the transport, including when DELETE never completes or ignores cancellation.
    await remote.close().catch(error => log(`Could not close upstream client: ${error.message}`));
  };

  const disposeRetired = remote => {
    if (!retired.has(remote) || references.has(remote)) return;
    retired.delete(remote);
    const cleanup = closeRemote(remote).finally(() => cleanups.delete(cleanup));
    cleanups.add(cleanup);
  };

  const connectRemote = () => {
    if (closed) return Promise.reject(closedError());
    if (client) return Promise.resolve(client);
    if (connecting) return connecting;

    const candidate = new Client(BRIDGE_INFO, { capabilities: {} });
    pendingClient = candidate;
    let candidateClosed = false;
    candidate.onerror = error => log(`Upstream error: ${error.message}`);
    candidate.onclose = () => {
      candidateClosed = true;
      if (client === candidate) client = undefined;
    };
    candidate.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      if (closed || client !== candidate) return;
      await server
        ?.sendToolListChanged()
        .catch(error => log(`Could not relay tool list change: ${error.message}`));
    });
    connecting = (async () => {
      try {
        await candidate.connect(new StreamableHTTPClientTransport(url, { fetch }), requestOptions);
        if (closed || candidateClosed) throw closedError();
        client = candidate;
        return candidate;
      } catch (error) {
        await closeRemote(candidate);
        throw error;
      } finally {
        if (pendingClient === candidate) pendingClient = undefined;
      }
    })().finally(() => {
      connecting = undefined;
    });
    return connecting;
  };

  const withRemote = async (fn, parentSignal) => {
    const controller = new AbortController();
    const { signal } = controller;
    const cancel = () => controller.abort(parentSignal.reason);
    parentSignal?.addEventListener('abort', cancel, { once: true });
    if (parentSignal?.aborted) cancel();
    const timer = setTimeout(
      () =>
        controller.abort(new McpError(ErrorCode.RequestTimeout, 'Request timed out', { timeout: timeoutMs })),
      timeoutMs,
    );
    requests.add(controller);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        signal.throwIfAborted();
        let remote;
        do {
          remote = await waitForSignal(connectRemote(), signal);
          signal.throwIfAborted();
          // An earlier waiter may have retired the resolved client before this waiter resumed.
        } while (remote !== client);
        references.set(remote, (references.get(remote) ?? 0) + 1);
        try {
          return await waitForSignal(fn(remote, { ...requestOptions, signal }), signal);
        } catch (error) {
          signal.throwIfAborted();
          if (!isStaleSession(error)) throw error;
          if (client === remote) client = undefined;
          retired.add(remote);
          if (attempt !== 0) throw error;
          log('Upstream session expired; reconnecting');
          // Do not close a sibling's in-flight request or replay an ambiguous transport failure.
          // Each sibling keeps its own deadline and may retry only its own stale-session response.
        } finally {
          const remaining = references.get(remote) - 1;
          if (remaining > 0) references.set(remote, remaining);
          else references.delete(remote);
          disposeRetired(remote);
        }
      }
    } catch (error) {
      throw toRelayError(error);
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', cancel);
      requests.delete(controller);
    }
  };

  const start = async serverTransport => {
    if (closed) throw closedError();
    if (server || starting) throw new Error('Bridge already started.');
    starting = true;
    let local;
    try {
      let remote;
      try {
        remote = await connectRemote();
      } catch (error) {
        if (closed) throw closedError();
        log(`Upstream unavailable at startup, will retry on first request: ${error.message}`);
      }
      if (closed) throw closedError();
      const serverInfo = remote?.getServerVersion() ?? BRIDGE_INFO;
      const capabilities = remote?.getServerCapabilities() ?? FALLBACK_CAPABILITIES;
      const instructions = remote?.getInstructions();

      local = new Server(serverInfo, { capabilities, instructions });
      server = local;
      if (capabilities.tools) {
        local.setRequestHandler(ListToolsRequestSchema, (request, extra) =>
          withRemote((c, options) => c.listTools(request.params, options), extra.signal),
        );
        local.setRequestHandler(CallToolRequestSchema, (request, extra) =>
          withRemote((c, options) => c.callTool(request.params, CallToolResultSchema, options), extra.signal),
        );
      }
      // Forward other advertised methods with the same cancellation and elapsed deadline.
      local.fallbackRequestHandler = (request, extra) =>
        withRemote(
          (c, options) =>
            c.request({ method: request.method, params: request.params }, ResultSchema, options),
          extra.signal,
        );

      await local.connect(serverTransport);
      if (closed) throw closedError();
      return local;
    } catch (error) {
      if (server === local) server = undefined;
      await local?.close();
      throw error;
    } finally {
      starting = false;
    }
  };

  const close = () => {
    if (closing) return closing;
    closed = true;
    const local = server;
    const current = client;
    const remotes = new Set([current, pendingClient, ...retired]);
    server = undefined;
    client = undefined;
    retired.clear();
    for (const controller of requests) controller.abort(closedError());
    // Reserve the shared close promise before invoking any user-supplied onclose callback.
    closing = Promise.resolve()
      .then(() =>
        Promise.allSettled([
          local?.close(),
          ...[...remotes].map(remote => closeRemote(remote, remote === current && !!remote)),
          ...cleanups,
        ]),
      )
      .then(() => {});
    return closing;
  };

  return { connectRemote, start, close, client: () => client };
}
