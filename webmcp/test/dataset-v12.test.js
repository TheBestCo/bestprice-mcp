import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { argumentRules, serializeDataset } from '../evals/dataset-v3.js';
import { CONTRACT_1_9_REV7_ARGUMENT_RULES, V11_PATH } from '../evals/dataset-v11.js';
import {
  CONTRACT_1_9_REV12_ARGUMENT_RULES,
  caseArgumentRules,
  DATASET_V12_CONTRACT,
  DATASET_V12_VERSION,
  deriveDatasetV12,
  READ_ONLY_UNLESS,
  V12_PATH,
} from '../evals/dataset-v12.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { TOOL_DEFINITIONS } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';
import { unaccountedRequirements } from './helpers/contract-history.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };

describe('dataset 12.0.0', () => {
  const v11 = read(V11_PATH);
  const v12 = read(V12_PATH);
  const before = byId(v11);
  const after = byId(v12);

  it('is exactly what the generator derives from 11.0.0 and revision 2026-09-25.12', () => {
    assert.equal(readFileSync(V12_PATH, 'utf8'), serializeDataset(deriveDatasetV12(v11)));
    assert.equal(v12.datasetVersion, DATASET_V12_VERSION);
    assert.equal(DATASET_V12_CONTRACT, '1.9');
    assert.match(
      v12.sourceContracts,
      /16 contextual tools, contract 1\.9, storefront revision 2026-09-25\.12/u,
    );
  });

  it('changes only argument rules: new optional arguments, one selector fewer, and reads that stay reads', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const changed = new Set();
    for (const [id, item] of after) {
      const { allowed_args: args, ...definition } = item;
      const { allowed_args: oldArgs, ...oldDefinition } = before.get(id);
      assert.deepEqual(definition, oldDefinition, id);
      assert.deepEqual(Object.keys(args).sort(), Object.keys(oldArgs).sort(), id);
      for (const [tool, rules] of Object.entries(args)) {
        /* Frozen since contract 2.0: the rules it was generated with are recorded. */
        assert.deepEqual(rules, caseArgumentRules(tool, item.expected_tools), `${id}.${tool}`);
        if (JSON.stringify(rules) !== JSON.stringify(oldArgs[tool])) changed.add(tool);
      }
    }
    assert.deepEqual([...changed].sort(), [
      'clear_listing_filters',
      'compare_page_offers',
      'get_visible_products',
      'show_offer',
      'summarize_price_history',
    ]);
    /* Every other tool's rules are the ones 11.0.0 recorded. */
    for (const [tool, rules] of Object.entries(CONTRACT_1_9_REV7_ARGUMENT_RULES)) {
      if (!changed.has(tool)) assert.deepEqual(CONTRACT_1_9_REV12_ARGUMENT_RULES[tool], rules, tool);
    }
    /* What changed, by name. */
    const rulesOf = tool => CONTRACT_1_9_REV12_ARGUMENT_RULES[tool];
    assert.equal(rulesOf('compare_page_offers').limit.maximum, 12);
    assert.deepEqual(Object.keys(rulesOf('compare_page_offers')).sort(), [
      'include_all_stores',
      'limit',
      'offset',
      'product_id',
    ]);
    assert.deepEqual(Object.keys(rulesOf('clear_listing_filters')).sort(), ['filter', 'value']);
    assert.deepEqual(rulesOf('summarize_price_history'), { show_chart: { type: 'boolean' } });
    assert.deepEqual(Object.keys(rulesOf('show_offer')).sort(), ['merchant_name', 'offer_ref']);
    assert.deepEqual(rulesOf('get_visible_products'), CONTRACT_1_9_REV7_ARGUMENT_RULES.get_visible_products);
    /* Each tool that acts only when asked names its acting argument. */
    for (const [tool, flag] of Object.entries(READ_ONLY_UNLESS)) {
      assert.deepEqual(rulesOf(tool)[flag], { type: 'boolean' }, tool);
    }
    /* The recorded rules are what argumentRules still generates for every tool contract 2.0 kept
     * unchanged in its inputs. */
    for (const tool of [
      'compare_page_offers',
      'clear_listing_filters',
      'show_offer',
      'summarize_price_history',
    ]) {
      assert.deepEqual(argumentRules(TOOL_DEFINITIONS[tool]), rulesOf(tool), tool);
    }
  });

  it('only requires result properties a success of the published contract carries, or that later contracts removed', () => {
    /* Frozen: a requirement is either still in a success of the published contract, or recorded as
     * taken out since (test/helpers/contract-history.js). */
    assert.deepEqual(unaccountedRequirements(v12, TOOL_DEFINITIONS), []);
  });

  it('passes reading past the fourth offer and removing one filter, which 11.0.0 failed', async () => {
    const adapter = createDemoAdapter();
    adapter.setPage('product');
    const first = await adapter.execute('compare_page_offers', { limit: 1 });
    const args = { limit: 1, offset: first.next_offset };
    const rest = await adapter.execute('compare_page_offers', args);
    assert.equal(rest.ok, true);
    const offers = item => {
      const step = call => ({ tool: 'compare_page_offers', arguments: call, result: rest });
      return gradeJourney(item, { steps: [step(args)], terminal });
    };
    const product = [...after.values()].find(
      item => item.expected_tools.length === 1 && item.expected_tools[0] === 'compare_page_offers',
    );
    assert.ok(product, 'a case whose one expected tool is compare_page_offers');
    assert.equal(offers(before.get(product.id)).reason, 'unexpected argument compare_page_offers.offset');
    const graded = offers(product);
    assert.equal(graded.outcome, 'passed', graded.reason);

    const listing = await createListing();
    const removal = { filter: 'brand' };
    const cleared = await listing.execute('clear_listing_filters', removal);
    const clearing = [...after.values()].find(item => item.expected_tools.includes('clear_listing_filters'));
    const journey = item =>
      gradeJourney(item, {
        steps: item.expected_tools.map(tool => ({
          tool,
          arguments: tool === 'clear_listing_filters' ? removal : {},
          result: tool === 'clear_listing_filters' ? cleared : { ok: true },
        })),
        terminal,
      });
    assert.equal(journey(before.get(clearing.id)).reason, 'unexpected argument clear_listing_filters.filter');
    assert.notEqual(journey(clearing).reason, 'unexpected argument clear_listing_filters.filter');
  });

  it('admits reading more results or a price history as extra reads, but not loading or charting', async () => {
    /* listing-003 expects get_visible_products: there, loading more is part of the task. */
    const listing = after.get('listing-003');
    assert.ok(listing.expected_tools.includes('get_visible_products'));
    assert.deepEqual(listing.allowed_args.get_visible_products.load_more, { type: 'boolean' });

    /* A product case that expects neither: both stay admitted extra reads, as reads only. */
    const adapter = createDemoAdapter();
    adapter.setPage('product');
    const item = [...after.values()].find(
      candidate =>
        candidate.expected_tools.length === 1 &&
        candidate.expected_tools[0] === 'compare_page_offers' &&
        candidate.extra_calls_allowed.includes('get_visible_products') &&
        candidate.extra_calls_allowed.includes('summarize_price_history'),
    );
    assert.ok(item, 'a compare_page_offers case with both admitted extra reads');
    assert.deepEqual(item.allowed_args.get_visible_products.load_more, { type: 'boolean', enum: [false] });
    assert.deepEqual(item.allowed_args.summarize_price_history.show_chart, {
      type: 'boolean',
      enum: [false],
    });
    const compared = await adapter.execute('compare_page_offers', {});
    const history = await adapter.execute('summarize_price_history', {});
    const grade = extra =>
      gradeJourney(item, {
        steps: [extra, { tool: 'compare_page_offers', arguments: {}, result: compared }],
        terminal,
      });
    const read = grade({
      tool: 'summarize_price_history',
      arguments: { show_chart: false },
      result: history,
    });
    assert.equal(read.outcome, 'passed', read.reason);
    assert.match(read.reason, /1 admitted extra read/u);
    /* 11.0.0 refused show_chart as unknown; 12.0.0 refuses it only when it would open the chart. */
    assert.equal(
      grade({ tool: 'summarize_price_history', arguments: { show_chart: true }, result: history }).reason,
      'invalid value summarize_price_history.show_chart',
    );
    assert.equal(
      gradeJourney(before.get(item.id), {
        steps: [
          { tool: 'summarize_price_history', arguments: { show_chart: false }, result: history },
          { tool: 'compare_page_offers', arguments: {}, result: compared },
        ],
        terminal,
      }).reason,
      'unexpected argument summarize_price_history.show_chart',
    );
    assert.equal(
      grade({ tool: 'get_visible_products', arguments: { load_more: true }, result: { ok: true } }).reason,
      'invalid value get_visible_products.load_more',
    );
  });

  it('starts an empty evidence ledger of its own, and leaves 11.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v12.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V12_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v12.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v12),
        datasetVersion: DATASET_V12_VERSION,
      }),
      [],
    );
    assert.equal(v11.datasetVersion, '11.0.0');
    assert.equal(before.get('home-001').allowed_args.compare_page_offers.offset, undefined);
    /* 11.0.0 keeps the selector 12.0.0 no longer publishes. */
    const showing = [...before.values()].find(item => item.allowed_args.show_offer);
    assert.deepEqual(Object.keys(showing.allowed_args.show_offer).sort(), [
      'merchant_id',
      'merchant_name',
      'offer_ref',
    ]);
    assert.deepEqual(Object.keys(after.get(showing.id).allowed_args.show_offer).sort(), [
      'merchant_name',
      'offer_ref',
    ]);
  });
});

/** A listing with one brand filter applied, as the page shows it once the tab has moved there. */
async function createListing() {
  const adapter = createDemoAdapter();
  await adapter.execute('search_bestprice', { query: 'phone' });
  await adapter.execute('apply_listing_filter', { filter: 'brand', value: 'Samsung' });
  return adapter;
}
