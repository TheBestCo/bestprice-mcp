/**
 * The published contract and the page that registers the tools must describe the same fields.
 *
 * Round 4's finding: the storefront's `show_offer` advertised `offer_ref` while
 * `webmcp/src/contracts.js` declared only `merchant_id`/`merchant_name` under
 * `additionalProperties: false`, so the reference the page itself called the exact selector was
 * invalid against the published contract. Every existing check passed, because they compared tool
 * names, counts and version strings — not fields.
 *
 * This suite compares the input contract field by field, in both directions, against the storefront
 * source of truth: the committed snapshot always (so the check cannot silently skip), and the live
 * sibling checkout when it is present (so the snapshot cannot silently drift).
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareInputSurfaces,
  DEFAULT_STOREFRONT_ROOT,
  extractToolDefinitions,
  readStorefrontSurface,
  STOREFRONT_FILES,
  surfaceIndex,
} from '../src/contract-parity.js';
import { createTools } from '../src/contracts.js';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/storefront-tools.v1.json', import.meta.url));
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const noop = () => ({ ok: true });

/** The published surface, read from the same `createTools` a page calls. */
const publishedSurface = () => {
  const definitions = ['home', 'listing', 'product'].flatMap(page => createTools({ page, execute: noop }));
  const unique = new Map(definitions.map(definition => [definition.name, definition]));
  return surfaceIndex([...unique.values()]);
};

/** The tools the item page and the shared search tool register: the surface the fixture covers. */
const STOREFRONT_TOOLS = Object.freeze([
  /* Extraction order: `tools.js` first, then the shared search tool it imports. */
  'get_page_product',
  'compare_page_offers',
  'get_product_specifications',
  'summarize_price_history',
  'show_offer',
  'show_price_history',
  'get_visible_products',
  'open_visible_product',
  'get_listing_filters',
  'apply_listing_filter',
  'clear_listing_filters',
  'get_listing_sort_options',
  'apply_listing_sort',
  'search_bestprice',
]);

describe('contract parity with the storefront', () => {
  it('publishes every field the storefront registers, with the same type and bounds', () => {
    const published = publishedSurface();
    const differences = compareInputSurfaces(fixture.surface, published, STOREFRONT_TOOLS);
    assert.deepEqual(differences, [], differences.join('\n'));
  });

  it('covers the item page and the shared search tool, not just one file', () => {
    assert.deepEqual(fixture.tools, [...STOREFRONT_TOOLS]);
    assert.deepEqual(
      fixture.extractedFrom.map(source => source.path),
      [...STOREFRONT_FILES],
    );
    for (const name of STOREFRONT_TOOLS) {
      assert.ok(fixture.surface[name]?.inputSchema, `${name} must be in the snapshot`);
      assert.ok(publishedSurface()[name]?.inputSchema, `${name} must be in the published contract`);
    }

    /* The snapshot records what it was extracted from, so a reviewer can re-run the extraction. */
    assert.equal(fixture.sourceOfTruth, 'bestprice.gr');
    assert.match(fixture.definitionsDigest, /^[0-9a-f]{64}$/u);
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
  });

  it('keeps the committed snapshot a transcription of the sibling checkout', {
    skip: existsSync(DEFAULT_STOREFRONT_ROOT) ? false : 'the bestprice.gr sibling checkout is not present',
  }, () => {
    /* The recorded source digests are checked first, so drift is reported as "this file changed"
     * rather than as a schema difference the reader then has to locate. */
    for (const source of fixture.extractedFrom) {
      const bytes = readFileSync(join(DEFAULT_STOREFRONT_ROOT, source.path));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        source.sha256,
        `${source.path} changed in the storefront; re-extract webmcp/test/fixtures/storefront-tools.v1.json`,
      );
    }

    /* And re-extracting the live files reproduces the snapshot exactly. When the storefront changes
     * its surface, this fails and the fixture is regenerated deliberately — which is the moment a
     * reviewer decides whether the published contract changes with it. */
    const live = readStorefrontSurface(DEFAULT_STOREFRONT_ROOT);
    assert.equal(live.digest, fixture.definitionsDigest);
    assert.deepEqual(live.surface, fixture.surface);
  });
});
