#!/usr/bin/env node
/**
 * Local stdio entry point for the BestPrice MCP server.
 *
 * Speaks MCP over stdin/stdout and forwards everything to the public Streamable HTTP endpoint.
 * Configure with BESTPRICE_MCP_URL and BESTPRICE_MCP_TIMEOUT_MS; see src/bridge.js.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge, readConfig } from './src/bridge.js';
import { createUtf8Input } from './src/utf8-input.js';

// stdout carries the JSON-RPC frames; any other byte there corrupts the host's parser.
// Every diagnostic goes to stderr.
// A host may close the diagnostic pipe independently of the protocol. Observe errors
// before the first write; logging must not crash the bridge or recurse while shutting down.
let diagnosticsAvailable = true;
process.stderr.on('error', () => {
  diagnosticsAvailable = false;
});
process.stderr.once('close', () => {
  diagnosticsAvailable = false;
});
const writeDiagnostic = (message, done = () => {}) => {
  if (!diagnosticsAvailable || process.stderr.destroyed || process.stderr.writableEnded) {
    done();
    return;
  }
  try {
    process.stderr.write(message, done);
  } catch {
    diagnosticsAvailable = false;
    done();
  }
};
const log = message => writeDiagnostic(`${message}\n`);

log('BestPrice MCP stdio forwarder started');

let config;
try {
  config = readConfig();
} catch (error) {
  log(`Configuration error: ${error.message}`);
  process.exit(2);
}

const bridge = createBridge({ ...config, log });
const input = createUtf8Input();

let closing = false;
const shutdown = (reason, code = 0) => {
  if (closing) return;
  closing = true;
  // A pending cleanup promise does not keep Node alive. Preserve failure even if
  // all handles close before the unreferenced final watchdog can run.
  process.exitCode = code;
  process.stdin.unpipe(input);
  process.stdin.pause();
  input.destroy();
  // stderr is a pipe, so this write is asynchronous; wait for it or process.exit truncates it.
  const flushed = new Promise(resolve => writeDiagnostic(`Shutting down (${reason})\n`, resolve));
  setTimeout(() => process.exit(code), 2_000).unref();
  Promise.allSettled([bridge.close(), flushed]).then(() => process.exit(code));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Writable finish follows successful UTF-8 flush, even when startup has not attached
// the SDK reader. Readable end would wait for that reader and strand a closed host.
input.once('finish', () => shutdown('stdin closed'));
input.once('error', () => shutdown('invalid stdin', 1));
process.stdin.once('error', () => shutdown('stdin error', 1));
// A broken output pipe ends the protocol, unlike stderr. Close the upstream too.
process.stdout.on('error', () => shutdown('stdout error', 1));
process.on('unhandledRejection', error => {
  log(`Unhandled rejection: ${error?.stack ?? error}`);
  shutdown('unhandled rejection', 1);
});

// Logged after the signal and stdin handlers exist, so this line also means "safe to stop".
log(`Forwarding to: ${config.remoteUrl}`);

// Start validation even while the upstream handshake is pending. Backpressure is preserved;
// no raw bytes reach the SDK and a broken host cannot keep feeding a closing bridge.
process.stdin.pipe(input);
try {
  const server = await bridge.start(new StdioServerTransport(input));
  server.onclose = () => shutdown('transport closed');
} catch (error) {
  log(`Fatal: ${error?.stack ?? error}`);
  shutdown('fatal', 1);
}
