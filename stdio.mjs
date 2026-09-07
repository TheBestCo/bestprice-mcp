#!/usr/bin/env node
/**
 * Local stdio entry point for the BestPrice MCP server.
 *
 * Speaks MCP over stdin/stdout and forwards everything to the public Streamable HTTP endpoint.
 * Configure with BESTPRICE_MCP_URL and BESTPRICE_MCP_TIMEOUT_MS; see src/bridge.js.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge, readConfig } from './src/bridge.js';

// stdout carries the JSON-RPC frames; any other byte there corrupts the host's parser.
// Every diagnostic goes to stderr.
const log = message => process.stderr.write(`${message}\n`);

log('BestPrice MCP stdio forwarder started');

let config;
try {
  config = readConfig();
} catch (error) {
  log(`Configuration error: ${error.message}`);
  process.exit(2);
}

const bridge = createBridge({ ...config, log });

let closing = false;
const shutdown = (reason, code = 0) => {
  if (closing) return;
  closing = true;
  // stderr is a pipe, so this write is asynchronous; wait for it or process.exit truncates it.
  const flushed = new Promise(resolve => process.stderr.write(`Shutting down (${reason})\n`, resolve));
  setTimeout(() => process.exit(code), 2_000).unref();
  Promise.allSettled([bridge.close(), flushed]).then(() => process.exit(code));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.stdin.once('end', () => shutdown('stdin closed'));
process.on('unhandledRejection', error => {
  log(`Unhandled rejection: ${error?.stack ?? error}`);
  shutdown('unhandled rejection', 1);
});

// Logged after the signal and stdin handlers exist, so this line also means "safe to stop".
log(`Forwarding to: ${config.remoteUrl}`);

try {
  const server = await bridge.start(new StdioServerTransport());
  server.onclose = () => shutdown('transport closed');
} catch (error) {
  log(`Fatal: ${error?.stack ?? error}`);
  shutdown('fatal', 1);
}
