/**
 * The published contract and the pages that register the tools must describe the same tools.
 *
 * Round 4's finding: the storefront's `show_offer` advertised `offer_ref` while
 * `webmcp/src/contracts.js` declared only `merchant_id`/`merchant_name` under
 * `additionalProperties: false`, so the reference the page itself called the exact selector was
 * invalid against the published contract. Every existing check passed, because they compared tool
 * names, counts and version strings — not fields.
 *
 * This suite compares every definition field by field, in both directions — the input contract, and
 * since contract 1.8 the title, description, annotations and output schema too — plus the tools each
 * page type registers, against the storefront source of truth: the committed snapshot always (so the
 * check cannot silently skip), and the live sibling checkout when it is present and current (so the
 * snapshot cannot silently drift).
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareInputSurfaces,
  compareSurfaces,
  DEFAULT_STOREFRONT_ROOT,
  extractToolDefinitions,
  packagePageTools,
  readStorefrontSurface,
  renderStorefrontPages,
  STOREFRONT_FILES,
  STOREFRONT_SOURCES,
  STOREFRONT_TOOL_DOCUMENT,
  surfaceIndex,
} from '../src/contract-parity.js';
import {
  createTools,
  PAGE_TOOL_NAMES,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  WEBMCP_CONTRACT_VERSION,
} from '../src/contracts.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/storefront-tools.v2.json', import.meta.url));
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const noop = () => ({ ok: true });

/** The published surface: every definition, with any page type's own wording. */
const publishedSurface = () => surfaceIndex(Object.values(TOOL_DEFINITIONS));

describe('contract parity with the storefront', () => {
  it('publishes every tool the storefront registers, field by field and word for word', () => {
    const differences = compareSurfaces(fixture.surface, publishedSurface());
    assert.deepEqual(differences, [], differences.join('\n'));
    assert.deepEqual([...TOOL_NAMES], fixture.tools, 'the same tools, in the storefront catalog order');
  });

  it('registers on each page type the wording the storefront registers there', () => {
    for (const page of Object.keys(PAGE_TOOL_NAMES)) {
      for (const tool of createTools({ page, execute: noop })) {
        const source = fixture.surface[tool.name];
        assert.equal(
          tool.description,
          source.pageDescriptions?.[page] ?? source.description,
          `${page}: ${tool.name}`,
        );
        assert.equal('pageDescriptions' in tool, false, 'a registered tool carries one description');
      }
    }
    /* Contract 1.9: the item page has its own wording for the two tools it shares with every page. */
    assert.deepEqual(
      Object.keys(fixture.surface).filter(name => fixture.surface[name].pageDescriptions),
      ['search_bestprice', 'get_shopping_decision'],
    );
  });

  it('exposes the tools each storefront page type registers, in registration order', () => {
    assert.deepEqual(packagePageTools(fixture.pages), PAGE_TOOL_NAMES);
    /* The listing pages are one surface on the storefront too. */
    assert.deepEqual(fixture.pages.search, fixture.pages.category);
    assert.deepEqual(fixture.pages.search, fixture.pages.hub);
  });

  it('records what it was read from, so a reviewer can read it again', () => {
    assert.equal(fixture.fixtureVersion, 2);
    assert.equal(fixture.sourceOfTruth, 'bestprice.gr');
    assert.match(fixture.sourceCommit, /^[0-9a-f]{40}$/u);
    assert.equal(fixture.contractVersion, WEBMCP_CONTRACT_VERSION);
    assert.match(fixture.definitionsDigest, /^[0-9a-f]{64}$/u);
    assert.deepEqual(
      fixture.extractedFrom.map(source => source.path),
      [...STOREFRONT_FILES],
    );
    for (const source of fixture.extractedFrom) assert.match(source.sha256, /^[0-9a-f]{64}$/u, source.path);
    for (const name of fixture.tools) {
      for (const field of ['title', 'description', 'inputSchema', 'annotations', 'outputSchema']) {
        assert.ok(fixture.surface[name]?.[field], `${name}.${field} must be in the snapshot`);
      }
    }
  });

  it('names the field the round-4 audit found missing, on both surfaces', () => {
    const showOfferFixture = fixture.surface.show_offer.inputSchema;
    const showOfferPublished = publishedSurface().show_offer.inputSchema;

    /* The two surfaces that disagreed: the page's selector set has three fields, the published
     * contract had two. This is asserted by name, not by count. */
    assert.deepEqual(Object.keys(showOfferFixture.properties).sort(), [
      'merchant_id',
      'merchant_name',
      'offer_ref',
    ]);
    assert.deepEqual(Object.keys(showOfferPublished.properties).sort(), [
      'merchant_id',
      'merchant_name',
      'offer_ref',
    ]);
    assert.equal(showOfferFixture.additionalProperties, false);
    assert.equal(showOfferPublished.additionalProperties, false);
    assert.equal(showOfferFixture.required, undefined, 'the page lets any selector identify the offer');
    assert.equal(showOfferPublished.required, undefined);
    assert.deepEqual(showOfferPublished.properties.offer_ref, {
      type: 'string',
      minLength: 8,
      maxLength: 40,
      description: showOfferPublished.properties.offer_ref.description,
    });
  });

  it('fails on a field present in one surface and missing from the other', () => {
    const published = publishedSurface();
    const withOfferRef = fixture.surface;
    const withoutOfferRef = structuredClone(fixture.surface);
    delete withoutOfferRef.show_offer.inputSchema.properties.offer_ref;

    /* The exact defect: the source of truth has the field, the published contract does not. */
    const missing = compareInputSurfaces(
      withOfferRef,
      { ...published, show_offer: withoutOfferRef.show_offer },
      ['show_offer'],
    );
    assert.equal(missing.length, 1);
    assert.match(missing[0], /show_offer\.offer_ref: missing from the published contract/u);

    /* ... and the mirror image: a field the published contract invents. */
    const invented = compareInputSurfaces(
      { ...withOfferRef, show_offer: withoutOfferRef.show_offer },
      published,
      ['show_offer'],
    );
    assert.equal(invented.length, 1);
    assert.match(invented[0], /show_offer\.offer_ref: published but absent from the source of truth/u);

    /* A tool on one surface only is a difference too. `compareInputSurfaces(expected, actual)` reads
     * left to right — the storefront first, the published contract second — and the messages name the
     * direction, so a swap is diagnosed as a swap rather than as the same defect twice. */
    assert.deepEqual(compareInputSurfaces({}, { show_offer: published.show_offer }, ['show_offer']), [
      'show_offer: present in the published contract but not in the source of truth',
    ]);
    assert.deepEqual(compareInputSurfaces({ show_offer: published.show_offer }, {}, ['show_offer']), [
      'show_offer: present in the source of truth but not in the published contract',
    ]);
    /* The full comparison reports the same input defect once, not again as a raw path. */
    assert.deepEqual(
      compareSurfaces(withOfferRef, { ...published, show_offer: withoutOfferRef.show_offer }, ['show_offer']),
      missing,
    );
  });

  it('fails on a changed type or bound, not only on a missing field', () => {
    const published = publishedSurface();
    const mutated = structuredClone(fixture.surface);
    mutated.show_offer.inputSchema.properties.merchant_id.type = 'integer';
    assert.deepEqual(compareInputSurfaces(mutated, published, ['show_offer']), [
      'show_offer.merchant_id.type: "string" != "integer"',
    ]);

    const bounded = structuredClone(fixture.surface);
    bounded.compare_page_offers.inputSchema.properties.limit.maximum = 8;
    assert.deepEqual(compareInputSurfaces(bounded, published, ['compare_page_offers']), [
      'compare_page_offers.limit.maximum: 4 != 8',
    ]);

    const patterned = structuredClone(fixture.surface);
    patterned.show_offer.inputSchema.properties.merchant_id.pattern = '^\\d{1,10}$';
    assert.deepEqual(compareInputSurfaces(patterned, published, ['show_offer']), [
      'show_offer.merchant_id.pattern: "^\\\\d{1,20}$" != "^\\\\d{1,10}$"',
    ]);

    const opened = structuredClone(fixture.surface);
    opened.show_offer.inputSchema.additionalProperties = true;
    assert.deepEqual(compareInputSurfaces(opened, published, ['show_offer']), [
      'show_offer: inputSchema.additionalProperties false != true',
    ]);

    /* The storefront expresses most requirements as `minLength`; an identifier-shaped field has
     * none, so requiring it in the published contract is a constraint the page does not state. */
    const overrequired = structuredClone(published);
    overrequired.show_offer.inputSchema.required = ['merchant_id'];
    assert.deepEqual(compareInputSurfaces(fixture.surface, overrequired, ['show_offer']), [
      'show_offer: published contract requires merchant_id, the source of truth does not',
    ]);
    /* ... and a `minLength` requirement is the same constraint written differently, so it is not a
     * difference: the storefront's `offer_ref` is required by construction. */
    const viaMinLength = structuredClone(published);
    viaMinLength.show_offer.inputSchema.required = ['offer_ref'];
    assert.deepEqual(compareInputSurfaces(fixture.surface, viaMinLength, ['show_offer']), []);
  });

  it('fails on changed words, annotations or output, which the input check alone does not read', () => {
    const published = publishedSurface();
    const only = ['get_shopping_decision'];
    assert.deepEqual(compareSurfaces(fixture.surface, published, only), []);

    const reworded = structuredClone(published);
    reworded.get_shopping_decision.description = 'Ask something.';
    assert.deepEqual(compareSurfaces(fixture.surface, reworded, only), [
      `get_shopping_decision.description: "Ask something." != ${JSON.stringify(fixture.surface.get_shopping_decision.description)}`,
    ]);

    /* A property's description is invisible to the input check but is still what the page registers. */
    const fieldWords = structuredClone(published);
    fieldWords.get_shopping_decision.inputSchema.properties.message.description = 'The question.';
    assert.equal(compareInputSurfaces(fixture.surface, fieldWords, only).length, 0);
    assert.equal(compareSurfaces(fixture.surface, fieldWords, only).length, 1);
    assert.match(
      compareSurfaces(fixture.surface, fieldWords, only)[0],
      /^get_shopping_decision\.inputSchema\.properties\.message\.description: "The question\." != /u,
    );

    const hinted = structuredClone(published);
    hinted.get_shopping_decision.annotations.consequentialHint = true;
    delete hinted.get_shopping_decision.annotations.untrustedContentHint;
    assert.deepEqual(compareSurfaces(fixture.surface, hinted, only), [
      'get_shopping_decision.annotations.consequentialHint: true != false',
      'get_shopping_decision.annotations.untrustedContentHint: missing from the published contract',
    ]);

    const reshaped = structuredClone(published);
    reshaped.get_shopping_decision.outputSchema.oneOf[0].properties.recommended = { type: 'object' };
    const [difference, ...rest] = compareSurfaces(fixture.surface, reshaped, only);
    assert.match(difference, /^get_shopping_decision\.outputSchema\.oneOf\[0\]\.properties\.recommended\./u);
    assert.ok(rest.length < 8, 'a reshaped field is reported in a bounded number of paths');
  });

  it('extracts the storefront surface from source, including shared schema constants', () => {
    /* A definition is recognised by its contents, so the shapes the storefront actually writes — a
     * factory return value and an array built inside an arrow body — are both read. */
    const source = [
      "const EMPTY = { type: 'object', properties: {}, additionalProperties: false };",
      'const limited = n => ({',
      "  name: 'shared_tool',",
      "  title: 'Shared',",
      '  inputSchema: { type: "object", properties: { limit: { type: "integer", maximum: n } }, additionalProperties: false },',
      '});',
      'export default () => [',
      '  {',
      "    name: 'empty_tool',",
      '    inputSchema: EMPTY,',
      "    description: 'not a name: this string must not confuse the reader',",
      '  },',
      '];',
    ].join('\n');
    const definitions = extractToolDefinitions(source);
    assert.deepEqual(
      definitions.map(definition => definition.name),
      ['shared_tool', 'empty_tool'],
      'both literal shapes the storefront writes are read',
    );
    assert.deepEqual(
      definitions.find(definition => definition.name === 'empty_tool').inputSchema,
      { type: 'object', properties: {}, additionalProperties: false },
      'the shared EMPTY_SCHEMA constant is resolved, not recorded as a hole',
    );

    /* An escaped quote inside a description must not end the string early. */
    const escaped = [
      'const t = {',
      "  name: 'q',",
      '  description: "a \\" quoted \\" description",',
      "  inputSchema: { type: 'object', properties: { a: { type: 'string', pattern: '^\\\\d+$' } }, additionalProperties: false },",
      '};',
    ].join('\n');
    const [quoted] = extractToolDefinitions(escaped);
    assert.equal(quoted.name, 'q');
    assert.equal(quoted.description, 'a " quoted " description');
    assert.equal(quoted.inputSchema.properties.a.pattern, '^\\d+$');

    /* The regex literal in the storefront's own pattern must not swallow the rest of the file. */
    assert.ok(fixture.surface.show_offer.inputSchema.properties.merchant_id.pattern);

    /* Contract 1.7 bounds every continuation offset with `Number.MAX_SAFE_INTEGER`: the reader
     * resolves that one member expression, and leaves any other as a named hole. */
    const [bounded] = extractToolDefinitions(
      [
        "const t = { name: 'o', inputSchema: { type: 'object', properties: {",
        '  offset: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },',
        '  other: { type: "integer", maximum: Math.PI },',
        '}, additionalProperties: false } };',
      ].join('\n'),
    );
    assert.equal(bounded.inputSchema.properties.offset.maximum, Number.MAX_SAFE_INTEGER);
    assert.deepEqual(bounded.inputSchema.properties.other.maximum, { $ref: 'Math.PI' });
    assert.equal(
      fixture.surface.get_product_specifications.inputSchema.properties.offset.maximum,
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('reads the shapes contract 1.8 writes: catalog text, templates, string bounds and execute bodies', () => {
    const source = [
      'const MAX_LIMIT = 8;',
      'const DEFAULT_LIMIT = 6;',
      'const TIMEOUT_MS = 10_000;',
      "export const POSTAL = '^(?:[1-7][0-9]{4}|8[0-5][0-9]{3})$';",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test writes a template literal
      "const note = `nested ${ok ? `inner ${x}` : ''} template`;",
      'export default execute => ({',
      "  name: 'decide',",
      "  ...toolText('decide'),",
      '  inputSchema: {',
      "    type: 'object',",
      '    properties: {',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test writes a template literal
      '      limit: { type: "integer", maximum: MAX_LIMIT, description: `From 1 to ${MAX_LIMIT}. Defaults to ${DEFAULT_LIMIT}.` },',
      '      postal: { type: "string", pattern: POSTAL, description: "a } brace, a , comma" },',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the source under test writes a template literal
      '      wait: { type: "integer", maximum: TIMEOUT_MS, description: `Unresolved ${unknown}.` },',
      '    },',
      '    additionalProperties: false,',
      '  },',
      '  outputSchema: OUTPUT_SCHEMAS.decide,',
      '  execute: measured("decide", track, async args => {',
      '    if (/^[a-z]+$/u.test(args.x)) return { ok: false, title: "leaked", error: "no" };',
      '    return { ok: true, description: "leaked" };',
      '  }),',
      '  annotations: READ_ONLY,',
      '});',
    ].join('\n');
    const readOnly = { readOnlyHint: true, consequentialHint: false };
    const [definition] = extractToolDefinitions(source, new Map([['READ_ONLY', readOnly]]));
    const { limit, postal, wait } = definition.inputSchema.properties;
    assert.equal(limit.maximum, 8);
    assert.equal(
      limit.description,
      'From 1 to 8. Defaults to 6.',
      'template substitutions of known constants',
    );
    assert.equal(postal.pattern, '^(?:[1-7][0-9]{4}|8[0-5][0-9]{3})$', 'a string constant is a bound too');
    assert.equal(
      postal.description,
      'a } brace, a , comma',
      'punctuation inside a string does not end a value',
    );
    assert.equal(wait.maximum, 10000, 'a numeric separator is read as the number it writes');
    assert.deepEqual(wait.description, { $template: ['Unresolved ', { $ref: 'unknown' }, '.'] });
    assert.deepEqual(definition.annotations, readOnly, 'an imported constant resolves');
    /* The catalog text is spread from a call the reader does not evaluate; the name it reads is kept so
     * the surface can check it, and an execute body's objects never leak into the definition. */
    assert.equal(definition.textFrom, 'decide');
    assert.equal(definition.outputSchemaRef, 'OUTPUT_SCHEMAS.decide');
    assert.equal(definition.title, undefined);
    assert.equal(definition.description, undefined);
  });

  it('joins the generated catalog with the registering modules, and refuses a surface it cannot join', () => {
    const root = mkdtempSync(join(tmpdir(), 'storefront-surface-'));
    const write = (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    const outputSchema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const catalog = tools => JSON.stringify({ tools });
    const entry = { title: 'Read', description: 'Reads.', output_schema: outputSchema };
    try {
      for (const path of STOREFRONT_SOURCES) write(path, '');
      write(
        'pages/search/webmcp/shared-tools.js',
        'export const READ_ONLY = { readOnlyHint: true };\nexport const NAVIGATION = { readOnlyHint: false };',
      );
      write(
        'pages/search/webmcp/tools.js',
        [
          "import { READ_ONLY as SHARED, NAVIGATION } from './shared-tools';",
          "export default () => [{ name: 'read_tool', ...toolText('read_tool'), inputSchema: { type: 'object' }, annotations: SHARED }];",
        ].join('\n'),
      );
      write(STOREFRONT_TOOL_DOCUMENT, catalog({ read_tool: entry }));
      const surface = readStorefrontSurface(root);
      assert.deepEqual(surface.surface.read_tool, {
        title: 'Read',
        description: 'Reads.',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
        outputSchema,
        pageDescriptions: null,
      });
      assert.match(surface.digest, /^[0-9a-f]{64}$/u);

      /* A page's own wording is published by storefront page and read by package page type. */
      write(
        STOREFRONT_TOOL_DOCUMENT,
        catalog({
          read_tool: { ...entry, page_descriptions: { search: 'Reads here.', hub: 'Reads here.' } },
        }),
      );
      assert.deepEqual(readStorefrontSurface(root).surface.read_tool.pageDescriptions, {
        listing: 'Reads here.',
      });
      write(
        STOREFRONT_TOOL_DOCUMENT,
        catalog({ read_tool: { ...entry, page_descriptions: { hub: 'Other.', search: 'Reads here.' } } }),
      );
      assert.throws(
        () => readStorefrontSurface(root),
        /registers different wording from the other listing pages/u,
      );
      write(
        STOREFRONT_TOOL_DOCUMENT,
        catalog({ read_tool: { ...entry, page_descriptions: { checkout: 'x' } } }),
      );
      assert.throws(() => readStorefrontSurface(root), /wording for an unknown page type: checkout/u);
      write(STOREFRONT_TOOL_DOCUMENT, catalog({ read_tool: entry }));

      /* A tool the catalog lists that no page registers, and one a page registers with another
       * tool's words, are both refusals — never a surface with holes. */
      write(STOREFRONT_TOOL_DOCUMENT, catalog({ read_tool: entry, ghost_tool: entry }));
      assert.throws(
        () => readStorefrontSurface(root),
        /ghost_tool: in extra\/mcpDiscovery\/webmcp-tools\.json but registered by none/u,
      );
      write(STOREFRONT_TOOL_DOCUMENT, catalog({}));
      assert.throws(() => readStorefrontSurface(root), /read_tool: registered but not in/u);
      write(STOREFRONT_TOOL_DOCUMENT, catalog({ read_tool: entry }));
      write(
        'pages/search/webmcp/tools.js',
        "export default () => [{ name: 'read_tool', ...toolText('other_tool'), inputSchema: { type: 'object' } }];",
      );
      assert.throws(() => readStorefrontSurface(root), /does not register the catalog text of read_tool/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('folds the storefront page types onto the package page types, and refuses listings that disagree', () => {
    const pages = { home: ['a'], search: ['b'], category: ['b'], hub: ['b'], product: ['c'], site: ['d'] };
    const rendered = JSON.stringify({
      webmcp: { version: '9.9', pages: Object.entries(pages).map(([page, tools]) => ({ page, tools })) },
    });
    const calls = [];
    const run = (command, args) => {
      calls.push([command, ...args]);
      return rendered;
    };
    assert.deepEqual(renderStorefrontPages('/storefront', run), { version: '9.9', pages });
    assert.deepEqual(calls, [['php', join('/storefront', 'tools/scripts/mcp_discovery_json.php')]]);
    assert.deepEqual(packagePageTools(pages), { home: ['a'], listing: ['b'], product: ['c'], site: ['d'] });
    assert.throws(
      () => packagePageTools({ ...pages, hub: ['b', 'x'] }),
      /hub page registers different tools/u,
    );
    assert.throws(() => packagePageTools({ ...pages, product: undefined }), /no tools for the product page/u);
  });

  /* A checkout older than the snapshot cannot re-verify it: its files predate the source commit. */
  const siblingSkipReason = () => {
    if (!existsSync(DEFAULT_STOREFRONT_ROOT)) return 'the bestprice.gr sibling checkout is not present';
    const git = args =>
      execFileSync('git', ['-C', DEFAULT_STOREFRONT_ROOT, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    let head;
    try {
      head = git(['rev-parse', 'HEAD']);
    } catch {
      return false; // Not a git checkout: its files are compared as they are.
    }
    try {
      git(['merge-base', '--is-ancestor', fixture.sourceCommit, 'HEAD']);
      return false;
    } catch {
      return `the sibling checkout (${head.slice(0, 10)}) does not contain the snapshot's source commit ${fixture.sourceCommit.slice(0, 10)}; fetch it, or set BESTPRICE_STOREFRONT_ROOT to a checkout that does`;
    }
  };

  it('keeps the committed snapshot a transcription of the sibling checkout', {
    skip: siblingSkipReason(),
  }, t => {
    /* The recorded source digests are checked first, so drift is reported as "this file changed"
     * rather than as a schema difference the reader then has to locate. */
    for (const source of fixture.extractedFrom) {
      const bytes = readFileSync(join(DEFAULT_STOREFRONT_ROOT, source.path));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        source.sha256,
        `${source.path} changed in the storefront; run node webmcp/evals/storefront-snapshot.mjs`,
      );
    }

    /* And re-reading the live files reproduces the snapshot exactly. When the storefront changes its
     * surface, this fails and the snapshot is regenerated deliberately — which is the moment a
     * reviewer decides whether the published contract changes with it. */
    const live = readStorefrontSurface(DEFAULT_STOREFRONT_ROOT);
    assert.equal(live.digest, fixture.definitionsDigest);
    assert.deepEqual(live.surface, fixture.surface);

    let php = true;
    try {
      execFileSync('php', ['--version'], { stdio: 'ignore' });
    } catch {
      php = false;
    }
    if (!php) {
      t.diagnostic(
        'php is not on PATH: the page lists were not re-rendered (webmcp/evals/conformance.mjs does)',
      );
      return;
    }
    const rendered = renderStorefrontPages(DEFAULT_STOREFRONT_ROOT);
    assert.equal(rendered.version, fixture.contractVersion);
    assert.deepEqual(rendered.pages, fixture.pages);
  });
});
