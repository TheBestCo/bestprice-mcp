import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  compareInputSurfaces,
  DEFAULT_STOREFRONT_ROOT,
  readStorefrontSurface,
  surfaceIndex,
} from '../src/contract-parity.js';
import { createTools } from '../src/contracts.js';

// Mandatory release check. No snapshot fallback or skip when source/PHP is absent.
const root = resolve(process.argv[2] || DEFAULT_STOREFRONT_ROOT);
const source = readStorefrontSurface(root);
const published = surfaceIndex(
  ['home', 'listing', 'product'].flatMap(page => createTools({ page, execute: () => {} })),
);
assert.deepEqual(compareInputSurfaces(source.surface, published), []);
const code =
  'class Page {} require $argv[1]; $r = new ReflectionClass("McpDiscoveryPage"); $p = $r->newInstanceWithoutConstructor(); $m = $r->getMethod("webMcpTools"); echo json_encode($m->invoke($p));';
const php = JSON.parse(
  execFileSync('php', ['-r', code, resolve(root, 'extra/mcpDiscovery/McpDiscoveryPage.php')], {
    encoding: 'utf8',
  }),
);
assert.deepEqual(
  compareInputSurfaces(
    source.surface,
    surfaceIndex(php.map(tool => ({ ...tool, inputSchema: tool.input_schema }))),
  ),
  [],
);
console.log(
  `All ${Object.keys(source.surface).length} runtime, PHP discovery and published input contracts agree.`,
);
