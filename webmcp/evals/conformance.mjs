import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  compareInputSurfaces,
  compareSurfaces,
  DEFAULT_STOREFRONT_ROOT,
  packagePageTools,
  readStorefrontSurface,
  renderStorefrontManifest,
  surfaceIndex,
} from '../src/contract-parity.js';
import { createTools, PAGE_TOOL_NAMES, TOOL_NAMES, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';

// Mandatory release check. No snapshot fallback or skip when source/PHP is absent.
const root = resolve(process.argv[2] || DEFAULT_STOREFRONT_ROOT);

/* The pages' registrations against the published contract: every field, words included. */
const source = readStorefrontSurface(root);
const published = surfaceIndex(
  ['home', 'listing', 'product'].flatMap(page => createTools({ page, execute: () => {} })),
);
assert.deepEqual(compareSurfaces(source.surface, published), []);

/* The manifest the site serves (/webmcp.json), rendered by the storefront's own PHP builder: the same
 * contract version, tools in the same order, the same page lists, words and output schemas, and the
 * same inputs an agent validates against (its field descriptions keep the Node mirror's wording). */
const { webmcp } = renderStorefrontManifest(root);
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
console.log(
  `Contract ${webmcp.version}: all ${TOOL_NAMES.length} runtime, PHP discovery and published contracts agree.`,
);
