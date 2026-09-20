import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../stdio.mjs', import.meta.url));

// Genuine installed SDK, actual stdio process and loopback HTTP. No substituted imports,
// production endpoint, shopper action or merchant navigation participates.
for (const [label, bytes, code] of [
  ['empty EOF', Buffer.alloc(0), 0],
  ['buffered valid EOF', Buffer.from('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'), 0],
  ['truncated EOF', Buffer.from([0xe2, 0x82]), 1],
]) {
  test(`real SDK closes on ${label} during stalled HTTP initialize`, { timeout: 12000 }, async t => {
    const sockets = new Set();
    const server = createServer(request => request.resume());
    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const requestSeen = once(server, 'request', { signal: AbortSignal.timeout(5000) });
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        BESTPRICE_MCP_URL: `http://127.0.0.1:${server.address().port}/mcp`,
        BESTPRICE_MCP_TIMEOUT_MS: '10000',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.stdin.on('error', () => {});
    const closed = once(child, 'close');
    await requestSeen;
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    t.after(() => clearTimeout(timer));
    child.stdin.end(bytes);
    const [exitCode, signal] = await closed;
    assert.equal(signal, null, 'shutdown waited for the upstream initialize deadline');
    assert.equal(exitCode, code, stderr);
    assert.equal(stdout, '');
    assert.match(stderr, code ? /Shutting down \(invalid stdin\)/u : /Shutting down \(stdin closed\)/u);
  });
}
