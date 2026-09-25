/** Native browser/read-only smoke. No model, polyfill, merchant navigation, retries or qualification. */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { PAGE_TOOL_NAMES } from '../webmcp/src/contracts.js';
import {
  makeNativeReadReceipt,
  verifyNativeReadPayload,
  verifyReadDocument,
} from './native-read-contracts.js';
import {
  allowPriceHistoryRead,
  allowSpecificationsRead,
  inspectBrowsingProductLinks,
  isAllowedBrowsingPage,
  selectVisibleProductReadTarget,
} from './native-read-policy.js';
import { finalizeNativeReadVerdict, recordNativeGuardFailure } from './native-read-verdict.js';

const report = {
  kind: 'native-webmcp-read-smoke',
  purpose: 'diagnostic',
  nativeQualification: false,
  readContractVersion: 2,
  model: null,
  startedAt: new Date().toISOString(),
  sourceRevision: process.env.GITHUB_SHA ?? null,
  passed: false,
  pages: [],
  calls: [],
  blocked: {},
  requests: 0,
  navigations: 0,
  policy: {
    serviceWorkers: 'blocked',
    measurements: 'blocked',
    externalRequests: 'blocked',
    userAgentOverride: false,
    toolActions: false,
    nonReadHttpMethods: 'blocked_except_scoped_specifications_and_price_history_reads',
  },
};
let phase = 'launch';
let browser;
let context;
const started = performance.now();
const fail = code => {
  throw new Error(code);
};
const ensure = (condition, code) => {
  if (!condition) fail(code);
};
const markBlocked = key => {
  report.blocked[key] = (report.blocked[key] ?? 0) + 1;
};
const allowedPage = isAllowedBrowsingPage;
const sha256File = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
/* The tools each page type must register: the published contract, not a copy of it. */
const expected = PAGE_TOOL_NAMES;
try {
  ensure(process.argv.includes('--live'), 'explicit_live_flag_required');
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  report.browserBinarySha256 = await sha256File(process.env.CHROME_BIN);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: false,
    timeout: 20000,
  });
  let controlOrigin = null;
  let specificationsPermit = null;
  let historyPermit = null;
  report.specificationsReads = 0;
  report.priceHistoryReads = 0;
  report.priceHistoryPreflights = 0;
  const controlBlocks = { redirect: 0, frame: 0, popup: 0 };
  const deniedControl = new Map([
    ['/denied-main', 'redirect'],
    ['/denied-frame', 'frame'],
    ['/denied-popup', 'popup'],
  ]);
  const navigationGuard = await browser.newBrowserCDPSession();
  report.browserVersion = browser.version();
  report.headless = false;
  navigationGuard.on('Fetch.requestPaused', event => {
    const url = new URL(event.request.url);
    const navigation = event.resourceType === 'Document';
    let blocked = null;
    if (controlOrigin) {
      if (
        event.request.method !== 'GET' ||
        url.origin !== controlOrigin ||
        !['/page', '/redirect'].includes(url.pathname)
      ) {
        blocked = 'control';
        if (navigation && deniedControl.has(url.pathname))
          controlBlocks[deniedControl.get(url.pathname)] += 1;
      }
    } else {
      report.requests += 1;
      if (report.requests > 800 || performance.now() - started >= 150000) blocked = 'budget';
      else if (navigation) {
        report.navigations += 1;
        if (report.navigations > 12 || event.request.method !== 'GET' || !allowedPage(url))
          blocked = 'navigation';
      } else if (
        allowSpecificationsRead(event.request, event.resourceType, specificationsPermit, performance.now())
      ) {
        report.specificationsReads += 1;
      } else if (allowPriceHistoryRead(event.request, event.resourceType, historyPermit, performance.now())) {
        if (event.request.method === 'POST') report.priceHistoryReads += 1;
        else report.priceHistoryPreflights += 1;
      } else if (!['GET', 'HEAD'].includes(event.request.method)) blocked = 'non_read_method';
      else if (
        (url.hostname === 'rpc.bestprice.gr' && url.pathname.startsWith('/beacon')) ||
        /(?:^|\.)(?:google-analytics\.com|analytics\.google\.com)$/u.test(url.hostname)
      )
        blocked = 'measurement';
      else if (url.hostname === 'rpc.bestprice.gr') blocked = 'rpc_excluded';
      else if (url.pathname.includes('%')) blocked = 'encoded_subresource_path';
      else if (/^\/(?:agent\/r|r|to|redirect|click|track-click)(?:\/|$)/u.test(url.pathname))
        blocked = 'commercial_path';
      else if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !/(?:^|\.)(?:bestprice\.gr|pstatic\.gr)$/u.test(url.hostname)
      )
        blocked = 'external_subresource';
      if (blocked) markBlocked(blocked);
    }
    // Capture provenance before asynchronous completion or a page/control transition.
    const observation = {
      phase,
      denied: Boolean(blocked),
      document: navigation,
      resourceType: event.resourceType,
      control: controlOrigin != null,
    };
    navigationGuard
      .send(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', {
        requestId: event.requestId,
        ...(blocked ? { errorReason: 'BlockedByClient' } : {}),
      })
      .catch(error => recordNativeGuardFailure(report, observation, error));
  });
  // One browser-wide interceptor, not overlapping browser/context Fetch handlers.
  // Unsupported interception fails before any live page is visited.
  await navigationGuard.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  });
  report.policy.browserWideDocumentInterception = true;
  phase = 'navigation_safety_control';
  const hits = {};
  const fixture = createServer((request, response) => {
    hits[request.url] = (hits[request.url] ?? 0) + 1;
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/denied-main', 'cache-control': 'no-store' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    response.end(
      request.url === '/page'
        ? `<html><body>control<iframe src="/denied-frame"></iframe><button id="open" onclick="window.open('/denied-popup','_blank')">open</button></body></html>`
        : '<html><body>denied endpoint must never receive a request</body></html>',
    );
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  controlOrigin = `http://127.0.0.1:${fixture.address().port}`;
  const control = await browser.newContext({ serviceWorkers: 'block' });
  let controlPhase = 'redirect';
  try {
    // A refused redirect may leave an error-document navigation in progress. Do not reuse
    // that page for the iframe/popup controls or confuse its late commit with their failure.
    const redirectPage = await control.newPage();
    await redirectPage.goto(`${controlOrigin}/redirect`, { timeout: 5000 }).catch(() => {});
    await redirectPage.close();
    controlPhase = 'page';
    const controlPage = await control.newPage();
    await controlPage.goto(`${controlOrigin}/page`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    // Each vector has a distinct noncacheable endpoint and an observable attempted request.
    // A user-gesture popup avoids mistaking the browser's popup blocker for our boundary.
    controlPhase = 'popup';
    await controlPage.locator('#open').click({ timeout: 5000 });
    controlPhase = 'observations';
    const until = performance.now() + 2000;
    while (Object.values(controlBlocks).some(count => count < 1) && performance.now() < until) {
      await controlPage.waitForTimeout(25);
    }
    const deniedRequests = Object.fromEntries(
      [...deniedControl].map(([path, kind]) => [kind, hits[path] ?? 0]),
    );
    report.navigationControl = {
      allowedRequests: (hits['/page'] ?? 0) + (hits['/redirect'] ?? 0),
      deniedRequests,
      blocked: { ...controlBlocks },
    };
    ensure(
      report.navigationControl.allowedRequests === 2 &&
        Object.values(deniedRequests).every(count => count === 0) &&
        Object.values(controlBlocks).every(count => count >= 1),
      'navigation_safety_control_failed',
    );
    report.navigationControl.passed = true;
  } catch (error) {
    report.navigationControl = {
      allowedRequests: (hits['/page'] ?? 0) + (hits['/redirect'] ?? 0),
      deniedRequests: Object.fromEntries([...deniedControl].map(([path, kind]) => [kind, hits[path] ?? 0])),
      blocked: { ...controlBlocks },
      passed: false,
      step: controlPhase,
      errorName: String(error.name).slice(0, 40),
      // Local control errors contain no catalog/user data; redact URLs and retain a bounded
      // diagnostic so a failed assertion, timeout and competing navigation are distinguishable.
      detail: String(error.message)
        .replace(/https?:\/\/[^\s"']+/gu, '[local-url]')
        .slice(0, 240),
      networkCode: /ERR_[A-Z_]+/u.exec(String(error.message))?.[0] ?? null,
    };
    throw error;
  } finally {
    await control.close();
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
    controlOrigin = null;
  }
  report.browserVersion = browser.version();
  report.headless = false;
  const modernArgs = Number(report.browserVersion.split('.')[0]) >= 155;
  report.argumentEncoding = modernArgs ? 'object' : 'legacy-json-string';
  context = await browser.newContext({
    serviceWorkers: 'block',
    acceptDownloads: false,
    viewport: { width: 1440, height: 1000 },
  });
  // A URL cannot identify a document: same-URL reloads must invalidate a read receipt.
  // This sentinel does not replace or polyfill any native WebMCP API.
  const documentKey = `__bpNativeRead_${randomUUID().replaceAll('-', '')}`;
  await context.addInitScript(key => {
    Object.defineProperty(globalThis, key, { value: crypto.randomUUID(), configurable: false });
  }, documentKey);
  await context.routeWebSocket('**/*', socket => {
    markBlocked('websocket');
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const readDocument = () =>
    page.evaluate(
      key => ({
        documentId: globalThis[key] ?? null,
        url: location.href,
      }),
      documentKey,
    );
  let firstRelease;
  const visit = async (kind, target) => {
    phase = `${kind}:navigation`;
    ensure(allowedPage(new URL(target)), 'invalid_page_target');
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const row = { kind, httpStatus: response?.status() ?? null };
    report.pages.push(row);
    ensure(response?.status() !== 429, 'rate_limited_stop');
    ensure(response?.ok(), 'page_http_failure');
    ensure(allowedPage(new URL(page.url())), 'unexpected_document_origin');
    phase = `${kind}:registration`;
    const initial = await page.evaluate(() => ({
      api: Boolean(document.modelContext?.getTools && document.modelContext?.executeTool),
      registration: document.documentElement.dataset.bpWebmcpRegistration ?? null,
    }));
    row.api = initial.api;
    row.initialRegistration = initial.registration;
    ensure(initial.api, 'native_api_unavailable');
    await page.waitForFunction(
      () => document.documentElement.dataset.bpWebmcpRegistration === 'ready',
      null,
      { timeout: 15000 },
    );
    const state = await page.evaluate(async () => ({
      registration: document.documentElement.dataset.bpWebmcpRegistration,
      release:
        typeof APP !== 'undefined' && ['string', 'number'].includes(typeof APP.release)
          ? String(APP.release)
          : null,
      tools: (await document.modelContext.getTools()).map(tool => ({
        name: tool.name,
        readOnly: tool.annotations?.readOnlyHint === true,
        sameOrigin: !tool.origin || tool.origin === location.origin,
      })),
    }));
    row.registration = state.registration;
    row.release = /^[a-zA-Z0-9._-]{1,80}$/u.test(state.release ?? '') ? state.release : null;
    row.tools = state.tools.filter(tool => /^[a-z_]{1,64}$/u.test(tool.name));
    ensure(
      row.tools.length === state.tools.length && row.tools.every(tool => tool.sameOrigin),
      'invalid_tool_inventory',
    );
    ensure(
      JSON.stringify(row.tools.map(tool => tool.name).sort()) === JSON.stringify([...expected[kind]].sort()),
      'tool_inventory_mismatch',
    );
    ensure(row.release, 'missing_storefront_release');
    firstRelease ??= row.release;
    ensure(row.release === firstRelease, 'storefront_release_changed');
    row.passed = true;
  };
  const invoke = async (kind, name, args = {}, expectedProductId) => {
    phase = `${kind}:${name}`;
    ensure(
      [
        'get_visible_products',
        'get_listing_filters',
        'get_listing_sort_options',
        'get_page_product',
        'compare_page_offers',
        'get_product_specifications',
        'summarize_price_history',
      ].includes(name),
      'action_tool_refused',
    );
    const before = await readDocument();
    const began = performance.now();
    // This tool reads specifications using a POST with exactly one FormData field.
    // The source-confirmed selector is read-only; it does not authorize other POSTs.
    const specificationsUrl = new URL(before.url);
    specificationsUrl.search = '';
    specificationsUrl.hash = '';
    if (name === 'get_product_specifications')
      specificationsPermit = {
        tool: name,
        url: specificationsUrl.href,
        expiresAt: performance.now() + 10000,
        used: false,
      };
    if (name === 'summarize_price_history')
      historyPermit = {
        tool: name,
        productId: expectedProductId,
        expiresAt: performance.now() + 10000,
        used: false,
        preflightUsed: false,
      };
    let observation;
    try {
      observation = await page.evaluate(
        async ({ name, args, modernArgs, expectedProductId, documentKey }) => {
          const documentBefore = { documentId: globalThis[documentKey] ?? null, url: location.href };
          const tool = (await document.modelContext.getTools()).find(tool => tool.name === name);
          if (tool?.annotations?.readOnlyHint !== true) return { error: 'not_read_only' };
          const result = await document.modelContext.executeTool(
            tool,
            modernArgs ? args : JSON.stringify(args),
            { signal: AbortSignal.timeout(10000) },
          );
          const payload = typeof result === 'string' ? JSON.parse(result) : result;
          const wire = JSON.stringify(payload);
          const arrays = {};
          for (const [key, value] of Object.entries(payload ?? {})) {
            if (
              [
                'products',
                'offers',
                'groups',
                'specifications',
                'series',
                'filters',
                'options',
                'warnings',
                'sort_options',
                'sections',
              ].includes(key) &&
              Array.isArray(value)
            )
              arrays[key] = value.length;
          }
          const productCandidates =
            name === 'get_visible_products' && Array.isArray(payload?.products)
              ? payload.products.slice(0, 8).map(product => ({
                  product_id:
                    typeof product?.product_id === 'string' && product.product_id.length <= 20
                      ? product.product_id
                      : null,
                  bestprice_url:
                    typeof product?.bestprice_url === 'string' && product.bestprice_url.length <= 2048
                      ? product.bestprice_url
                      : null,
                }))
              : undefined;
          return {
            // Raw output is ephemeral input to semantic validation; never spread it into
            // the persisted observation, where only allowlisted summaries belong.
            payload: new TextEncoder().encode(wire ?? '').byteLength <= 262144 ? payload : null,
            documentBefore,
            documentAfter: { documentId: globalThis[documentKey] ?? null, url: location.href },
            ok: payload?.ok === true,
            bytes: new TextEncoder().encode(wire ?? '').byteLength,
            arrays,
            ...(productCandidates ? { productCandidates } : {}),
            ...(expectedProductId
              ? { productIdentityMatches: payload?.product_id === expectedProductId }
              : {}),
          };
        },
        { name, args, modernArgs, expectedProductId, documentKey },
      );
    } finally {
      specificationsPermit = null;
      historyPermit = null;
    }
    // Candidate identities/URLs are ephemeral navigation input, never report content.
    const { productCandidates, payload, documentBefore, documentAfter } = observation;
    const row = makeNativeReadReceipt({
      name,
      page: kind,
      observation,
      durationMs: Math.round(performance.now() - began),
    });
    report.calls.push(row);
    ensure(
      observation.ok && observation.bytes > 0 && observation.bytes <= 262144,
      'read_tool_contract_failed',
    );
    // Observe the near-term transition interval too; a dispatched same-URL reload is not
    // a successful read. This is an observed 150ms window, not a promise about future navigation.
    await page.waitForTimeout(150);
    verifyReadDocument(before, documentBefore, documentAfter, await readDocument());
    row.documentUnchanged = true;
    row.contractChecks = verifyNativeReadPayload(name, args, payload, expectedProductId);
    row.contractValidated = true;
    return productCandidates;
  };
  await visit('home', 'https://www.bestprice.gr/');
  await visit('listing', 'https://www.bestprice.gr/search?q=Sony%20WH-1000XM5');
  const visibleProducts = await invoke('listing', 'get_visible_products', { limit: 2 });
  await invoke('listing', 'get_listing_filters');
  await invoke('listing', 'get_listing_sort_options');
  phase = 'product:selection';
  const productLinks = await page.locator('a[href*="/item/"]').evaluateAll(elements => {
    const matches = elements.filter(element => {
      const url = new URL(element.href, location.href);
      const rect = element.getBoundingClientRect();
      return (
        url.origin === location.origin &&
        /^\/item\/\d+\//u.test(url.pathname) &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    return matches.slice(0, 64).map(element => element.href);
  });
  report.productLinkSelection = inspectBrowsingProductLinks(productLinks).diagnostics;
  const target = selectVisibleProductReadTarget(visibleProducts, productLinks);
  report.productReadSelection = {
    source: 'get_visible_products',
    candidates: visibleProducts?.length ?? 0,
    selected: Boolean(target),
  };
  ensure(target, 'no_safe_native_read_product');
  ensure(allowedPage(new URL(target.url)), 'unsafe_product_link');
  await visit('product', target.url);
  ensure(
    /^\/item\/(\d{10})\//u.exec(new URL(page.url()).pathname)?.[1] === target.productId,
    'product_navigation_identity_mismatch',
  );
  await invoke('product', 'get_page_product', {}, target.productId);
  await invoke('product', 'compare_page_offers', { limit: 2 }, target.productId);
  await invoke('product', 'get_product_specifications', { limit: 3 }, target.productId);
  await invoke('product', 'summarize_price_history', {}, target.productId);
  ensure(report.priceHistoryReads === 1, 'history_read_not_observed');
  ensure(report.specificationsReads === 1, 'specifications_read_not_observed');
  ensure(!report.blocked.budget, 'browser_budget_exhausted');
  ensure(!report.blocked.navigation_guard_error, 'navigation_guard_failed');
  report.passed = true;
} catch (error) {
  report.failure = {
    phase,
    category: /^[A-Za-z_]{1,60}$/u.test(error.message ?? '') ? error.message : 'browser_or_assertion_failure',
  };
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exitCode = finalizeNativeReadVerdict(report);
  report.finishedAt = new Date().toISOString();
  await mkdir('diagnostic-output', { recursive: true });
  await writeFile('diagnostic-output/native-read-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
