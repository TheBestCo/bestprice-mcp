/** Native browser/read-only smoke. No model, polyfill, merchant navigation, retries or qualification. */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { allowSpecificationsRead, isAllowedBrowsingPage } from './native-read-policy.js';

const report = {
  kind: 'native-webmcp-read-smoke',
  purpose: 'diagnostic',
  nativeQualification: false,
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
    nonReadHttpMethods: 'blocked_except_one_current_product_specifications_read',
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
const expected = {
  home: ['search_bestprice'],
  listing: [
    'search_bestprice',
    'get_visible_products',
    'open_visible_product',
    'get_listing_filters',
    'apply_listing_filter',
    'clear_listing_filters',
    'get_listing_sort_options',
    'apply_listing_sort',
  ],
  product: [
    'search_bestprice',
    'get_page_product',
    'compare_page_offers',
    'get_product_specifications',
    'summarize_price_history',
    'show_offer',
    'show_price_history',
  ],
};
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
  report.specificationsReads = 0;
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
    navigationGuard
      .send(blocked ? 'Fetch.failRequest' : 'Fetch.continueRequest', {
        requestId: event.requestId,
        ...(blocked ? { errorReason: 'BlockedByClient' } : {}),
      })
      .catch(() => {
        markBlocked('navigation_guard_error');
      });
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
  await context.routeWebSocket('**/*', socket => {
    markBlocked('websocket');
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
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
  const invoke = async (kind, name, args = {}) => {
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
    const before = page.url();
    const began = performance.now();
    // This tool reads specifications using a POST with exactly one FormData field.
    // The source-confirmed selector is read-only; it does not authorize other POSTs.
    const specificationsUrl = new URL(before);
    specificationsUrl.search = '';
    specificationsUrl.hash = '';
    if (name === 'get_product_specifications')
      specificationsPermit = {
        tool: name,
        url: specificationsUrl.href,
        expiresAt: performance.now() + 10000,
        used: false,
      };
    let observation;
    try {
      observation = await page.evaluate(
        async ({ name, args, modernArgs }) => {
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
          return { ok: payload?.ok === true, bytes: new TextEncoder().encode(wire ?? '').byteLength, arrays };
        },
        { name, args, modernArgs },
      );
    } finally {
      specificationsPermit = null;
    }
    const row = { name, page: kind, ...observation, durationMs: Math.round(performance.now() - began) };
    report.calls.push(row);
    ensure(
      observation.ok && observation.bytes > 0 && observation.bytes <= 262144,
      'read_tool_contract_failed',
    );
    ensure(page.url() === before, 'read_tool_changed_document');
  };
  await visit('home', 'https://www.bestprice.gr/');
  await visit('listing', 'https://www.bestprice.gr/search?q=Sony%20WH-1000XM5');
  await invoke('listing', 'get_visible_products', { limit: 2 });
  await invoke('listing', 'get_listing_filters');
  await invoke('listing', 'get_listing_sort_options');
  const productUrl = await page.locator('a[href*="/item/"]').evaluateAll(elements => {
    const match = elements.find(element => {
      const url = new URL(element.href, location.href);
      const rect = element.getBoundingClientRect();
      return (
        url.origin === location.origin &&
        /^\/item\/\d+\//u.test(url.pathname) &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    return match?.href ?? null;
  });
  ensure(productUrl, 'no_visible_product_link');
  ensure(allowedPage(new URL(productUrl)), 'unsafe_product_link');
  await visit('product', productUrl);
  await invoke('product', 'get_page_product');
  await invoke('product', 'compare_page_offers', { limit: 2 });
  await invoke('product', 'get_product_specifications', { limit: 3 });
  await invoke('product', 'summarize_price_history');
  ensure(report.specificationsReads === 1, 'specifications_read_not_observed');
  ensure(!report.blocked.budget, 'browser_budget_exhausted');
  ensure(!report.blocked.navigation_guard_error, 'navigation_guard_failed');
  report.passed = true;
} catch (error) {
  report.failure = {
    phase,
    category: /^[a-z_]{1,60}$/u.test(error.message ?? '') ? error.message : 'browser_or_assertion_failure',
  };
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await mkdir('diagnostic-output', { recursive: true });
  await writeFile('diagnostic-output/native-read-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
