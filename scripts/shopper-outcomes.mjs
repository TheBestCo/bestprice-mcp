/** Opt-in, bounded synthetic search/route diagnostic. Never follows a merchant redirect. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { createToolVerifier, verifyMirror, verifyPublicLinks } from './public-contracts.js';
import {
  CASES,
  inspectSearchOutcome,
  isProductDocument,
  PROBE_CLIENT,
  PROBE_VERSION,
} from './shopper-outcomes.js';

const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const HEALTH = 'https://mcp.bestprice.gr/healthz';
const ORIGIN = 'https://www.bestprice.gr';
const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};
const safeCode = error =>
  /^[A-Z][A-Z0-9_]{1,64}$/u.test(error?.message ?? '') ? error.message : 'SCHEMA_OR_TRANSPORT_FAILURE';

async function bodyText(response, signal) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      size += value.byteLength;
      requireValue(size <= 2_000_000, 'BODY_LIMIT');
      chunks.push(value);
    }
    signal.throwIfAborted();
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function runShopperOutcomes({ fetchImpl = globalThis.fetch } = {}) {
  const report = {
    kind: 'synthetic-shopper-outcomes-v1',
    qualification: false,
    commercialLift: null,
    sourceRevision: process.env.GITHUB_SHA ?? null,
    startedAt: new Date().toISOString(),
    client: PROBE_CLIENT,
    cohort: 'synthetic',
    passed: false,
    revision: null,
    requests: [],
    cases: [],
    routes: [],
    policy: {
      retries: 0,
      maximumRequests: 28,
      maximumRoutes: 3,
      browserNavigation: false,
      merchantNavigation: false,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('RUN_DEADLINE')), 180_000);
  const permittedLinks = new Set();
  const permittedDocuments = new Set();
  let client;
  const request = async (input, options = {}) => {
    controller.signal.throwIfAborted();
    requireValue(report.requests.length < 28, 'REQUEST_LIMIT');
    const source = new Request(input, options);
    const url = source.url;
    const isMcp = url === ENDPOINT || url === HEALTH;
    requireValue(isMcp || permittedLinks.has(url) || permittedDocuments.has(url), 'DESTINATION_REFUSED');
    requireValue(
      isMcp ? ['GET', 'POST', 'DELETE'].includes(source.method) : source.method === 'GET',
      'METHOD_REFUSED',
    );
    const headers = new Headers(source.headers);
    headers.set('user-agent', `${PROBE_CLIENT}/${PROBE_VERSION}`);
    headers.set('x-mcp-client-name', PROBE_CLIENT);
    headers.set('x-mcp-client-version', PROBE_VERSION);
    const signal = AbortSignal.any([controller.signal, source.signal, AbortSignal.timeout(15_000)]);
    const entry = {
      surface: isMcp ? 'mcp' : permittedLinks.has(url) ? 'signed-route' : 'product-document',
      method: source.method,
    };
    report.requests.push(entry);
    const response = await fetchImpl(source, { headers, signal, redirect: 'manual' });
    entry.status = response.status;
    if (isMcp && response.ok) {
      const revision = response.headers.get('x-bestprice-revision');
      requireValue(/^[a-f0-9]{40}$/u.test(revision ?? ''), 'MISSING_REVISION');
      requireValue(!report.revision || revision === report.revision, 'MIXED_BACKEND_REVISIONS');
      report.revision = revision;
      entry.revision = revision;
    }
    // The SDK owns its optional session event stream and closes it with the client.
    if (url === ENDPOINT && source.method === 'GET') return response;
    const text = await bodyText(response, signal);
    const copied = new Headers(response.headers);
    copied.delete('content-encoding');
    copied.delete('content-length');
    return new Response([204, 205, 304].includes(response.status) ? null : text, {
      status: response.status,
      headers: copied,
    });
  };
  const health = async () => {
    const response = await request(HEALTH);
    requireValue(response.ok, 'HEALTH_HTTP');
    const value = await response.json();
    requireValue(
      value.ok === true && value.disabled === false && value.revision === report.revision,
      'HEALTH_STATE',
    );
  };
  try {
    await health();
    client = new Client({ name: PROBE_CLIENT, version: PROBE_VERSION });
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      fetch: request,
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
      },
    });
    const options = { timeout: 15_000, signal: controller.signal };
    await client.connect(transport, options);
    const { tools } = await client.listTools({}, options);
    const verifier = createToolVerifier(tools);
    const schema = tools.find(tool => tool.name === 'search_products').outputSchema;
    const validate = new AjvJsonSchemaValidator().getValidator(schema);
    const routes = new Map();
    for (const testCase of CASES) {
      const args = {
        query: testCase.query,
        limit: 3,
        ...(testCase.price_max == null ? {} : { price_max: testCase.price_max }),
      };
      try {
        verifier.input('search_products', args);
        const started = performance.now();
        const result = await client.callTool(
          { name: 'search_products', arguments: args },
          undefined,
          options,
        );
        requireValue(result.isError !== true, 'TOOL_ERROR');
        verifyMirror(result);
        requireValue(validate(result.structuredContent).valid, 'OUTPUT_SCHEMA');
        verifyPublicLinks(result.structuredContent);
        const inspected = inspectSearchOutcome(testCase, result);
        const { links, ...retained } = inspected;
        report.cases.push({ ...retained, latencyMs: Math.round(performance.now() - started) });
        if (inspected.status === 'passed' && testCase.required && links.length && routes.size < 3) {
          routes.set(links[0].productId, links[0]);
        }
      } catch (error) {
        report.cases.push({ id: testCase.id, status: 'failed', failures: [safeCode(error)] });
      }
    }
    for (const link of routes.values()) {
      const route = { productId: link.productId, linkDigest: link.digest, passed: false };
      report.routes.push(route);
      try {
        permittedLinks.add(link.url);
        const response = await request(link.url);
        route.status = response.status;
        requireValue([301, 302, 303, 307, 308].includes(response.status), 'SIGNED_ROUTE_NOT_REDIRECT');
        const location = new URL(response.headers.get('location'), ORIGIN);
        // Check the actual signed route target, but do not execute attribution/query actions on the document.
        requireValue(
          location.origin === ORIGIN && !location.username && !location.password && !location.hash,
          'SIGNED_ROUTE_ORIGIN',
        );
        route.targetMatches = location.pathname === link.path;
        requireValue(route.targetMatches, 'SIGNED_ROUTE_PRODUCT_MISMATCH');
        let document = `${ORIGIN}${location.pathname}`;
        for (let hop = 0; hop < 2; hop += 1) {
          requireValue(isProductDocument(document, link.productId), 'DOCUMENT_REFUSED');
          permittedDocuments.add(document);
          const page = await request(document);
          route.documentStatus = page.status;
          if ([301, 302, 303, 307, 308].includes(page.status)) {
            document = new URL(page.headers.get('location'), ORIGIN).href;
            continue;
          }
          requireValue(page.status === 200, 'DOCUMENT_NOT_OK');
          const html = await page.text();
          const canonical = (html.match(/<link\b[^>]*>/giu) ?? [])
            .find(tag => /\brel\s*=\s*["']canonical["']/iu.test(tag))
            ?.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
          requireValue(canonical && isProductDocument(canonical, link.productId), 'CANONICAL_ID_NOT_PROVEN');
          route.passed = true;
          break;
        }
        requireValue(route.passed, 'DOCUMENT_REDIRECT_LIMIT');
      } catch (error) {
        route.failure = safeCode(error);
      }
    }
    await health();
    report.passed =
      report.cases.length === CASES.length &&
      report.cases.every(item => item.status === 'passed') &&
      report.routes.length === 3 &&
      report.routes.every(item => item.passed);
    report.reviewRequired = report.cases.filter(item => item.status === 'needs_review').length;
  } catch (error) {
    report.failure = safeCode(error);
  } finally {
    controller.abort();
    clearTimeout(timer);
    await client?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireValue(process.argv.includes('--live'), 'EXPLICIT_LIVE_FLAG_REQUIRED');
  const output = process.argv[2];
  requireValue(output && output !== '--live', 'OUTPUT_PATH_REQUIRED');
  const report = await runShopperOutcomes();
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      passed: report.passed,
      cases: report.cases.map(({ id, status, failures }) => ({ id, status, failures })),
      routes: report.routes,
    }),
  );
  if (!report.passed) process.exitCode = 1;
}
