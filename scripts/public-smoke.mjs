/** Opt-in public probe. No merchant/landing navigation, no retries, no qualification claims. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { cents, createToolVerifier, IntegrityError } from './public-contracts.js';

const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const HEALTH = 'https://mcp.bestprice.gr/healthz';
const MAX_BYTES = 2_000_000;
const MAX_REQUESTS = 40;
const ensure = (condition, code) => {
  if (!condition) throw new IntegrityError(code);
};
const cancel = response => {
  Promise.resolve(response?.body?.cancel()).catch(() => {});
};

/** Observe late failures and dispose late responses; a non-cooperative fetch cannot own the wait. */
function waitFor(promise, signal, onLate = () => {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      value => {
        if (settled) {
          onLate(value);
          return;
        }
        if (signal.aborted) {
          onLate(value);
          abort();
          return;
        }
        finish(resolve, value);
      },
      error => finish(reject, error),
    );
    if (signal.aborted) abort();
  });
}

async function boundedText(response, signal, checkTime) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let complete = false;
  try {
    for (;;) {
      checkTime();
      const { done, value } = await waitFor(reader.read(), signal);
      if (done) {
        complete = true;
        break;
      }
      bytes += value.byteLength;
      ensure(bytes <= MAX_BYTES, 'BODY_SIZE_LIMIT');
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
  } finally {
    if (!complete) Promise.resolve(reader.cancel()).catch(() => {});
    reader.releaseLock();
  }
}

/** Only the fetch dependency and shorter test deadlines are injectable; destinations stay fixed. */
export async function runPublicSmoke({
  fetchImpl = globalThis.fetch,
  expectedRevision,
  deadlineMs = 120_000,
  requestMs = 15_000,
} = {}) {
  ensure(Number.isSafeInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 120_000, 'INVALID_DEADLINE');
  ensure(Number.isSafeInteger(requestMs) && requestMs > 0 && requestMs <= 15_000, 'INVALID_REQUEST_DEADLINE');
  ensure(
    expectedRevision === undefined || /^[a-f0-9]{40}$/u.test(expectedRevision),
    'INVALID_EXPECTED_REVISION',
  );
  const report = {
    purpose: 'diagnostic',
    qualification: false,
    startedAt: new Date().toISOString(),
    expectedRevision: expectedRevision ?? null,
    revision: null,
    passed: false,
    requests: [],
    lanes: [],
  };
  const controller = new AbortController();
  const expiresAt = performance.now() + deadlineMs;
  const expired = new IntegrityError('SMOKE_DEADLINE');
  const timer = setTimeout(() => controller.abort(expired), deadlineMs);
  const checkTime = () => {
    if (performance.now() >= expiresAt) controller.abort(expired);
    controller.signal.throwIfAborted();
  };
  const safeFailure = error =>
    error instanceof IntegrityError ? error.code : 'TRANSPORT_OR_PROTOCOL_FAILURE';
  let metadata;
  const request = async (input, init = {}, lane = 'health') => {
    checkTime();
    const url = new URL(input instanceof Request ? input.url : input);
    ensure(url.href === ENDPOINT || url.href === HEALTH, 'DESTINATION_REFUSED');
    ensure(report.requests.length < MAX_REQUESTS, 'REQUEST_BUDGET_EXCEEDED');
    const source = new Request(input, init);
    const headers = new Headers(source.headers);
    if (source.method === 'POST' && lane === 'json') headers.set('accept', 'application/json');
    const signals = [controller.signal, source.signal];
    const attempt = new AbortController();
    const attemptExpiresAt = performance.now() + requestMs;
    const attemptTimer = setTimeout(() => attempt.abort(new IntegrityError('REQUEST_DEADLINE')), requestMs);
    const signal = AbortSignal.any([...signals, attempt.signal]);
    const checkAttempt = () => {
      checkTime();
      if (performance.now() >= attemptExpiresAt) attempt.abort(new IntegrityError('REQUEST_DEADLINE'));
      signal.throwIfAborted();
    };
    const event = { lane, method: source.method, status: null, revision: null };
    report.requests.push(event);
    let response;
    try {
      response = await waitFor(fetchImpl(source, { headers, redirect: 'manual', signal }), signal, cancel);
      event.status = response.status;
      event.revision = response.headers.get('x-bestprice-revision');
      // Record rejected responses too, but only successful responses may attest the serving revision.
      if (response.ok) {
        ensure(/^[a-f0-9]{40}$/u.test(event.revision ?? ''), 'MISSING_REVISION');
        ensure(!expectedRevision || event.revision === expectedRevision, 'UNEXPECTED_REVISION');
        ensure(!report.revision || report.revision === event.revision, 'MIXED_SAMPLED_REVISIONS');
        report.revision = event.revision;
      }
      checkAttempt();
      if (source.method === 'GET' && url.href === ENDPOINT) return response;
      const text = await boundedText(response, signal, checkAttempt);
      checkAttempt();
      // Buffer only finite, bounded response bytes. The installed SDK still owns JSON/SSE parsing.
      const copyHeaders = new Headers(response.headers);
      copyHeaders.delete('content-length');
      copyHeaders.delete('content-encoding');
      return new Response([204, 205, 304].includes(response.status) ? null : text, {
        status: response.status,
        statusText: response.statusText,
        headers: copyHeaders,
      });
    } catch (error) {
      event.failure = safeFailure(error);
      cancel(response);
      throw error;
    } finally {
      clearTimeout(attemptTimer);
    }
  };
  const health = async () => {
    const response = await request(HEALTH, { headers: { accept: 'application/json' } });
    ensure(response.ok, 'HEALTH_HTTP_FAILURE');
    const body = await response.json();
    ensure(body.ok === true && body.disabled === false, 'HEALTH_NOT_READY');
    ensure(body.revision === report.revision, 'HEALTH_REVISION_MISMATCH');
  };
  try {
    await health();
    for (const lane of ['dual', 'json']) {
      checkTime();
      const result = { lane, passed: false, steps: [] };
      report.lanes.push(result);
      const client = new Client({ name: 'bestprice-integrity-canary', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
        fetch: (input, init) => request(input, init, lane),
        reconnectionOptions: {
          maxRetries: 0,
          initialReconnectionDelay: 1000,
          maxReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1,
        },
      });
      const options = { timeout: requestMs, signal: controller.signal };
      try {
        await waitFor(client.connect(transport, options), controller.signal);
        checkTime();
        const server = client.getServerVersion();
        ensure(server?.name === 'bestprice-agent-commerce', 'SERVER_IDENTITY_DRIFT');
        result.serverVersion = server.version;
        const { tools } = await waitFor(client.listTools({}, options), controller.signal);
        checkTime();
        const verifier = createToolVerifier(tools);
        const descriptors = tools.toSorted((a, b) => a.name.localeCompare(b.name));
        ensure(!metadata || isDeepStrictEqual(metadata, descriptors), 'TRANSPORT_DESCRIPTOR_DRIFT');
        metadata ??= descriptors;
        result.schemaDigest = createHash('sha256').update(JSON.stringify(descriptors)).digest('hex');
        result.steps.push({ name: 'initialize_and_inventory', passed: true, toolCount: tools.length });
        const call = async (name, args) => {
          verifier.input(name, args);
          const started = performance.now();
          const response = await waitFor(
            client.callTool({ name, arguments: args }, undefined, options),
            controller.signal,
          );
          checkTime();
          const output = verifier.output(name, args, response);
          result.steps.push({
            name,
            passed: true,
            latencyMs: Math.round(performance.now() - started),
            resultCount: output.products?.length ?? output.offers?.length ?? output.series?.length ?? 0,
          });
          return output;
        };
        const search = await call('search_products', { query: 'Sony WH-1000XM5', price_max: 300, limit: 2 });
        const productId = search.products[0].product_id;
        await call('compare_offers', { product_id: productId, postal_code: '11527', limit: 4 });
        await call('get_price_history', { product_id: productId, period_days: 180 });
        const decision = await call('get_shopping_decision', { message: 'Laptop για σχολή έως 600 €' });
        const winner = decision.products.find(
          product => product.product_id === decision.recommended_product_id,
        );
        ensure(cents(winner.price_from) <= 60_000, 'DECISION_ITEM_BUDGET_BREACH');
        result.passed = true;
      } catch (error) {
        result.failure = safeFailure(error);
      } finally {
        await client.close().catch(() => {});
      }
    }
    await health();
    report.passed = report.lanes.length === 2 && report.lanes.every(lane => lane.passed);
  } catch (error) {
    report.failure = safeFailure(error);
  } finally {
    clearTimeout(timer);
    controller.abort();
    report.finishedAt = new Date().toISOString();
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/public-smoke.mjs OUTPUT.json [EXPECTED_REVISION]');
  const report = await runPublicSmoke({ expectedRevision: process.argv[3] });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
