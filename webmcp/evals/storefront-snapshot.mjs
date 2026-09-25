/**
 * Re-reads the storefront and rewrites the two files that transcribe it:
 *
 * - `webmcp/test/fixtures/storefront-tools.v2.json`, the snapshot `contract-parity.test.js` checks the
 *   published contract against (and re-checks against the sibling checkout when it is present);
 * - `webmcp/src/storefront-catalog.js`, the title, description, page wording, input and output schema
 *   of every tool, which `contracts.js` publishes as they are — so a storefront wording, input or
 *   output change is a regeneration, not a hand edit.
 *
 * - `webmcp/test/fixtures/storefront-strict-output-schemas.json`, the storefront's strict output
 *   contract (closed and bounded) that the published schemas relax since registration revision
 *   2026-09-25.9: the demo's results are validated against it, so a published schema made lean never
 *   makes those tests lenient.
 *
 * Annotations and page lists stay written by hand in `contracts.js`: the parity test names every one
 * that differs from the snapshot.
 *
 *   node webmcp/evals/storefront-snapshot.mjs [storefront checkout]    # default: ../bestprice.gr
 *
 * The checkout must be clean for the files it is read from: a snapshot of uncommitted source is not a
 * transcription of the storefront. PHP renders the page lists, as the site does.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_STOREFRONT_ROOT,
  loadStorefrontOutputSchemas,
  packagePageTools,
  readStorefrontSurface,
  renderStorefrontPages,
  STOREFRONT_FILES,
  STOREFRONT_OUTPUT_SCHEMAS,
  STOREFRONT_PAGE_RENDERER,
  storefrontFileDigests,
} from '../src/contract-parity.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const FIXTURE_PATH = resolve(REPO_ROOT, 'webmcp/test/fixtures/storefront-tools.v2.json');
export const CATALOG_PATH = resolve(REPO_ROOT, 'webmcp/src/storefront-catalog.js');
export const STRICT_PATH = resolve(REPO_ROOT, 'webmcp/test/fixtures/storefront-strict-output-schemas.json');
/* What the page lists depend on besides the files the surface is read from. */
const PAGE_SOURCES = ['extra/mcpDiscovery/McpDiscoveryPage.php', STOREFRONT_PAGE_RENDERER];

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

export function buildSnapshot(root) {
  const paths = [...STOREFRONT_FILES, ...PAGE_SOURCES];
  const dirty = git(root, ['status', '--porcelain', '--', ...paths]);
  if (dirty)
    throw new Error(`The storefront checkout has uncommitted changes in files the snapshot reads:\n${dirty}`);
  const surface = readStorefrontSurface(root);
  const { version, pages } = renderStorefrontPages(root);
  packagePageTools(pages);
  return {
    fixtureVersion: 2,
    what: 'The WebMCP tool surface the BestPrice.gr storefront registers, read from the source of truth in the bestprice.gr repository.',
    sourceOfTruth: 'bestprice.gr',
    sourceCommit: git(root, ['log', '-1', '--format=%H', '--', ...paths]),
    contractVersion: version,
    extractedFrom: storefrontFileDigests(root),
    extraction:
      'webmcp/src/contract-parity.js readStorefrontSurface: title, description and output schema from extra/mcpDiscovery/webmcp-tools.json; input schema and annotations from the object literals the page modules register, with module and imported constants resolved',
    pagesFrom: `${STOREFRONT_PAGE_RENDERER} webmcp.pages: the manifest the site serves, which the storefront checks against the tools each page registers`,
    definitionsDigest: surface.digest,
    tools: surface.definitions.map(definition => definition.name),
    pages,
    surface: surface.surface,
  };
}

/** The strict output contract, checked against the published copy the surface was read with. */
export async function buildStrictSchemas(root, snapshot) {
  const { sha256, published, strict } = await loadStorefrontOutputSchemas(root);
  for (const name of snapshot.tools) {
    if (JSON.stringify(published[name]) !== JSON.stringify(snapshot.surface[name].outputSchema)) {
      throw new Error(
        `${name}: ${STOREFRONT_OUTPUT_SCHEMAS} and the generated document publish different output schemas`,
      );
    }
  }
  return {
    what: 'The strict output contract of every BestPrice WebMCP tool (closed and bounded), which the published output schemas relax; the tests validate every demo result against it.',
    sourceOfTruth: 'bestprice.gr',
    sourceCommit: snapshot.sourceCommit,
    path: STOREFRONT_OUTPUT_SCHEMAS,
    sha256,
    schemas: Object.fromEntries(snapshot.tools.map(name => [name, strict[name]])),
  };
}

export function renderCatalog(snapshot) {
  const catalog = Object.fromEntries(
    snapshot.tools.map(name => {
      const { title, description, pageDescriptions, inputSchema, outputSchema } = snapshot.surface[name];
      return [
        name,
        { title, description, ...(pageDescriptions ? { pageDescriptions } : {}), inputSchema, outputSchema },
      ];
    }),
  );
  return `/**
 * GENERATED by webmcp/evals/storefront-snapshot.mjs — do not edit.
 *
 * The title, description (and any page type's own wording), input schema and output schema of every
 * BestPrice WebMCP tool, as the storefront registers them: bestprice.gr \`extra/mcpDiscovery/webmcp-tools.json\` (its generated copy of
 * \`js/modules/webmcp/tool-catalog.js\`, \`input-schemas.js\` and \`output-schemas.js\`) at ${snapshot.sourceCommit.slice(0, 10)}, WebMCP
 * contract ${snapshot.contractVersion}. \`contracts.js\` publishes them as they are, and
 * \`webmcp/test/contract-parity.test.js\` compares every published definition with the snapshot.
 */

export const WEBMCP_CONTRACT_VERSION = ${JSON.stringify(snapshot.contractVersion)};

export const STOREFRONT_CATALOG = ${JSON.stringify(catalog, null, 2)};
`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.argv[2] ?? DEFAULT_STOREFRONT_ROOT);
  const snapshot = buildSnapshot(root);
  const strict = await buildStrictSchemas(root, snapshot);
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(STRICT_PATH, `${JSON.stringify(strict, null, 2)}\n`);
  writeFileSync(CATALOG_PATH, renderCatalog(snapshot));
  const biome = resolve(REPO_ROOT, 'node_modules/.bin/biome');
  if (existsSync(biome)) {
    execFileSync(biome, ['format', '--write', FIXTURE_PATH, STRICT_PATH, CATALOG_PATH], { stdio: 'inherit' });
  } else console.warn('biome is not installed: run `npm run format` before committing.');
  console.log(
    `Contract ${snapshot.contractVersion}: ${snapshot.tools.length} tools from ${root} at ${snapshot.sourceCommit.slice(0, 10)} (digest ${snapshot.definitionsDigest.slice(0, 12)}).`,
  );
}
