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

/** Advertised when the remote cannot be reached at startup so the host still completes `initialize`. */
const FALLBACK_CAPABILITIES = Object.freeze({ tools: {} });
/** Every SDK hop prefixes error messages with `MCP error <code>: `; peel them all off before relaying. */
const MCP_ERROR_PREFIX = /^MCP error -?\d+: /u;
const stripPrefixes = message => {
  let clean = message;
  while (MCP_ERROR_PREFIX.test(clean)) clean = clean.replace(MCP_ERROR_PREFIX, '');
  return clean;
};

/**
 * Reads bridge configuration from environment variables.
 *
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {{ remoteUrl: URL, timeoutMs: number }}
 * @throws {TypeError} when `BESTPRICE_MCP_URL` is not an http(s) URL or `BESTPRICE_MCP_TIMEOUT_MS` is not a positive integer.
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
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError(`BESTPRICE_MCP_TIMEOUT_MS must be a positive integer: ${rawTimeout}`);
  }

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
  const url = remoteUrl instanceof URL ? remoteUrl : new URL(remoteUrl);
  const requestOptions = { timeout: timeoutMs };

  /** @type {Client | undefined} */
  let client;
  /** @type {Promise<Client> | undefined} */
  let connecting;
  /** @type {Server | undefined} */
  let server;

  /**
   * Errors thrown from a request handler are serialized by the SDK as `{ code, message, data }`.
   * Relaying a `McpError` directly would re-prefix its message on every hop, so upstream errors are
   * rethrown as a plain error carrying the same code and data with the original message intact.
   */
  const relay = (code, message, data) => Object.assign(new Error(message), { code, data });
  const toRelayError = error => {
    if (error instanceof McpError) return relay(error.code, stripPrefixes(error.message), error.data);
    return relay(ErrorCode.InternalError, `Upstream ${url.host}: ${error?.message ?? String(error)}`);
  };

  /**
   * The remote forgot our session (expired or restarted); a fresh `initialize` fixes it.
   * The spec asks for 404, while SDK-based servers answer 400 "Server not initialized".
   */
  const isStaleSession = error =>
    error instanceof StreamableHTTPError &&
    (error.code === 404 || (error.code === 400 && /session|not initialized/iu.test(error.message)));

  const connectRemote = () => {
    if (client) return Promise.resolve(client);
    if (connecting) return connecting;

    connecting = (async () => {
      const candidate = new Client(BRIDGE_INFO, { capabilities: {} });
      candidate.onerror = error => log(`Upstream error: ${error.message}`);
      candidate.onclose = () => {
        if (client === candidate) client = undefined;
      };
      candidate.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
        await server
          ?.sendToolListChanged()
          .catch(error => log(`Could not relay tool list change: ${error.message}`));
      });
      await candidate.connect(new StreamableHTTPClientTransport(url, { fetch }), requestOptions);
      client = candidate;
      return candidate;
    })().finally(() => {
      connecting = undefined;
    });
    return connecting;
  };

  const dropRemote = async () => {
    const remote = client;
    client = undefined;
    if (!remote) return;
    const transport = remote.transport;
    try {
      await transport?.terminateSession?.();
    } catch (error) {
      log(`Could not terminate upstream session: ${error.message}`);
    }
    await remote.close().catch(error => log(`Could not close upstream client: ${error.message}`));
  };

  const withRemote = async (fn, retried = false) => {
    let remote;
    try {
      remote = await connectRemote();
    } catch (error) {
      throw toRelayError(error);
    }
    try {
      return await fn(remote);
    } catch (error) {
      if (!retried && isStaleSession(error)) {
        log('Upstream session expired; reconnecting');
        await dropRemote();
        return withRemote(fn, true);
      }
      throw toRelayError(error);
    }
  };

  const start = async serverTransport => {
    if (server) throw new Error('Bridge already started.');

    let remote;
    try {
      remote = await connectRemote();
    } catch (error) {
      log(`Upstream unavailable at startup, will retry on first request: ${error.message}`);
    }

    const serverInfo = remote?.getServerVersion() ?? BRIDGE_INFO;
    const capabilities = remote?.getServerCapabilities() ?? FALLBACK_CAPABILITIES;
    const instructions = remote?.getInstructions();

    server = new Server(serverInfo, { capabilities, instructions });
    if (capabilities.tools) {
      server.setRequestHandler(ListToolsRequestSchema, request =>
        withRemote(c => c.listTools(request.params, requestOptions)),
      );
      server.setRequestHandler(CallToolRequestSchema, request =>
        withRemote(c => c.callTool(request.params, CallToolResultSchema, requestOptions)),
      );
    }
    // Anything else the remote advertises (resources, prompts, completions, ...) is forwarded untouched.
    server.fallbackRequestHandler = request =>
      withRemote(c =>
        c.request({ method: request.method, params: request.params }, ResultSchema, requestOptions),
      );

    await server.connect(serverTransport);
    return server;
  };

  const close = async () => {
    const local = server;
    server = undefined;
    await Promise.allSettled([local?.close(), dropRemote()]);
  };

  return { connectRemote, start, close, client: () => client };
}
