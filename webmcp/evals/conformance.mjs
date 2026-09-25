import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  compareInputSurfaces,
  compareSurfaces,
  DEFAULT_STOREFRONT_ROOT,
  packagePageTools,
  readStorefrontSurface,
  renderStorefrontManifest,
  STOREFRONT_PAGE_TYPES,
  surfaceIndex,
} from '../src/contract-parity.js';
import {
  createTools,
  PAGE_TOOL_NAMES,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  WEBMCP_CONTRACT_VERSION,
} from '../src/contracts.js';

// Mandatory release check. No snapshot fallback or skip when source/PHP is absent.
const root = resolve(process.argv[2] || DEFAULT_STOREFRONT_ROOT);

/* The pages' registrations against the published contract: every field, words included. */
const source = readStorefrontSurface(root);
const published = surfaceIndex(Object.values(TOOL_DEFINITIONS));
assert.deepEqual(compareSurfaces(source.surface, published), []);

/* The manifest the site serves (/webmcp.json), rendered by the storefront's own PHP builder: the same
 * contract version, tools in the same order, the same page lists, words and output schemas, and the
 * same inputs an agent validates against (its field descriptions keep the Node mirror's wording). */
const { webmcp, registry } = renderStorefrontManifest(root);
assert.equal(webmcp.version, WEBMCP_CONTRACT_VERSION);
assert.deepEqual(webmcp.toolNames, [...TOOL_NAMES]);
assert.deepEqual(
  packagePageTools(Object.fromEntries(webmcp.pages.map(entry => [entry.page, entry.tools]))),
  PAGE_TOOL_NAMES,
);
const served = surfaceIndex(
  webmcp.tools.map(tool => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.input_schema,
    outputSchema: tool.output_schema,
  })),
);
assert.deepEqual(compareInputSurfaces(source.surface, served), []);
for (const name of TOOL_NAMES) {
  for (const field of ['title', 'description', 'outputSchema']) {
    assert.deepEqual(served[name][field], published[name][field], `${name}.${field}`);
  }
}
/* Each page's wording: its own (pages[].descriptions) where it has any, the tool's otherwise — what
 * createTools registers on that page type. */
for (const entry of webmcp.pages) {
  const registered = createTools({ page: STOREFRONT_PAGE_TYPES[entry.page], execute: () => {} });
  for (const tool of registered) {
    assert.equal(
      entry.descriptions?.[tool.name] ?? served[tool.name].description,
      tool.description,
      `${entry.page}: ${tool.name}.description`,
    );
  }
}
/* Every tool the manifest lists is at the contract's version (contract 2.1: `2.1.0`). */
for (const tool of webmcp.tools)
  assert.equal(tool.version, `${WEBMCP_CONTRACT_VERSION}.0`, `${tool.name}.version`);

/* The registry inventory (/.well-known/webmcp.json): the same tools in the same order, words and
 * schemas, and — since contract 2.1 — the scanner's `pages` hint: same-origin paths, placed after
 * `updated_at` and before `tools`, which webmcp.com reads to find pages beyond `/`. */
assert.deepEqual(
  registry.tools.map(tool => tool.name),
  [...TOOL_NAMES],
);
for (const tool of registry.tools) {
  assert.equal(tool.description, published[tool.name].description, `registry ${tool.name}.description`);
  assert.deepEqual(
    tool.output_schema,
    published[tool.name].outputSchema,
    `registry ${tool.name}.outputSchema`,
  );
  assert.deepEqual(tool.version, `${WEBMCP_CONTRACT_VERSION}.0`, `registry ${tool.name}.version`);
}
assert.deepEqual(
  compareInputSurfaces(
    source.surface,
    surfaceIndex(registry.tools.map(tool => ({ name: tool.name, inputSchema: tool.input_schema }))),
  ),
  [],
);
const registryKeys = Object.keys(registry);
assert.ok(Array.isArray(registry.pages) && registry.pages.length > 0, 'registry pages hint');
for (const path of registry.pages)
  assert.match(path, /^\/(?!\/)/u, `registry page ${path} is a same-origin path`);
assert.equal(
  registryKeys.indexOf('pages'),
  registryKeys.indexOf('updated_at') + 1,
  'pages right after updated_at',
);
assert.ok(registryKeys.indexOf('pages') < registryKeys.indexOf('tools'), 'pages before tools');

console.log(
  `Contract ${webmcp.version}: all ${TOOL_NAMES.length} runtime, PHP discovery, registry and published contracts agree.`,
);
