/**
 * Bounded read-only smoke test of the public BestPrice MCP endpoint.
 * Not part of `npm test` (that suite stays offline). CI runs this script directly.
 */
import { readFileSync } from 'node:fs';

const ENDPOINT = 'https://mcp.bestprice.gr/mcp';
const HEALTH = 'https://mcp.bestprice.gr/healthz';
const TOOLS = ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'];
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

const fail = message => {
  console.error(`live-smoke: ${message}`);
  process.exitCode = 1;
};

async function post(body, accept = 'application/json') {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept,
      'user-agent': 'bestprice-mcp-live-smoke/2.8.0',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, contentType: response.headers.get('content-type') ?? '', json, text };
}

let health;
try {
  const response = await fetch(HEALTH, {
    headers: { accept: 'application/json', 'user-agent': 'bestprice-mcp-live-smoke/2.8.0' },
    signal: AbortSignal.timeout(15_000),
  });
  health = await response.json();
  if (!response.ok || health.ok !== true || health.version !== server.version) {
    fail(`healthz version ${health?.version ?? response.status} did not match server.json ${server.version}`);
  }
} catch (error) {
  fail(`healthz request failed: ${error.message}`);
}

if (process.exitCode) process.exit(process.exitCode);

const init = await post({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'bestprice-mcp-live-smoke', version: server.version },
  },
});
const info = init.json?.result?.serverInfo;
if (init.status !== 200 || info?.version !== server.version || info?.name !== 'bestprice-agent-commerce') {
  fail(`initialize status ${init.status} server ${info?.name ?? '?'} ${info?.version ?? '?'}`);
}

const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
const names = (listed.json?.result?.tools ?? []).map(tool => tool.name);
if (listed.status !== 200 || names.join(',') !== TOOLS.join(',')) {
  fail(`tools/list status ${listed.status} names ${names.join(',') || '(none)'}`);
}
for (const tool of listed.json?.result?.tools ?? []) {
  if (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false) {
    fail(`${tool.name} annotations are not read-only`);
  }
}

const search = await post({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: 'search_products', arguments: { query: 'Sony WH-1000XM5', limit: 2 } },
});
const products = search.json?.result?.structuredContent?.products;
if (
  search.status !== 200 ||
  search.json?.result?.isError ||
  !Array.isArray(products) ||
  products.length < 1
) {
  fail(`search_products status ${search.status} isError ${search.json?.result?.isError ?? '?'}`);
}

if (!process.exitCode) {
  console.log(
    `live-smoke: ok version ${health.version} revision ${health.revision} tools ${names.length} search ${products.length}`,
  );
}
