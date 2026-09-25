import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { argumentRules, serializeDataset } from '../evals/dataset-v3.js';
import { V9_PATH } from '../evals/dataset-v9.js';
import { V10_PATH } from '../evals/dataset-v10.js';
import { CONTRACT_1_9_REV7_ARGUMENT_RULES, V11_PATH } from '../evals/dataset-v11.js';
import {
  caseArgumentRules,
  DATASET_V12_CONTRACT,
  DATASET_V12_VERSION,
  deriveDatasetV12,
  READ_ONLY_UNLESS,
  V12_PATH,
} from '../evals/dataset-v12.js';
import { runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
const V2_PATH = fileURLToPath(new URL('../evals/natural-language-cases.v2.json', import.meta.url));

describe('dataset 12.0.0', () => {
  const v11 = read(V11_PATH);
  const v12 = read(V12_PATH);
  const before = byId(v11);
  const after = byId(v12);

  it('is exactly what the generator derives from 11.0.0 and revision 2026-09-25.12', () => {
    assert.equal(readFileSync(V12_PATH, 'utf8'), serializeDataset(deriveDatasetV12(v11)));
    assert.equal(v12.datasetVersion, DATASET_V12_VERSION);
    assert.equal(WEBMCP_CONTRACT_VERSION, DATASET_V12_CONTRACT);
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
        assert.deepEqual(
          rules,
          caseArgumentRules(TOOL_DEFINITIONS[tool], item.expected_tools),
          `${id}.${tool}`,
        );
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
      if (!changed.has(tool)) assert.deepEqual(argumentRules(TOOL_DEFINITIONS[tool]), rules, tool);
    }
    /* What changed, by name. */
    const rulesOf = tool => argumentRules(TOOL_DEFINITIONS[tool]);
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
    /* Each tool that acts only when asked is not marked read-only; its acting argument is named. */
    for (const [tool, flag] of Object.entries(READ_ONLY_UNLESS)) {
      assert.equal(TOOL_DEFINITIONS[tool].annotations.readOnlyHint, false, tool);
      assert.deepEqual(rulesOf(tool)[flag], { type: 'boolean' }, tool);
    }
  });

  it('only requires result properties a success of the published contract carries', () => {
    for (const item of v12.cases) {
      for (const [tool, properties] of Object.entries(item.required_result_properties ?? {})) {
        const success = TOOL_DEFINITIONS[tool].outputSchema.oneOf.find(
          branch => branch.properties.ok.const === true,
        );
        for (const property of properties) {
          assert.ok(Object.hasOwn(success.properties, property), `${item.id}: ${tool}.${property}`);
        }
      }
    }
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

  it('is what the deterministic demo passes, with no refusal it did not have before', async () => {
    const run = async path => {
      const summary = await runEvaluation({ mode: 'demo', runs: 1, dryRun: true, casesFile: path });
      const outcome = value =>
        summary.records
          .filter(record => record.outcome === value)
          .map(record => record.caseId)
          .sort();
      return { summary, refused: outcome('refused'), failed: outcome('failed') };
    };
    const current = await run(V12_PATH);
    assert.equal(current.summary.casesCount, 47);
    assert.deepEqual(current.failed, []);
    assert.equal(current.summary.blockedTrials, 0);
    assert.equal(current.summary.safetyViolations, 0);
    /* The refusals are the page refusing what those cases test, the same six on every graded set. */
    assert.deepEqual(current.refused, [
      'listing-004',
      'listing-007',
      'listing-011',
      'neg-001',
      'neg-009',
      'product-006',
    ]);
    for (const path of [V2_PATH, V9_PATH, V10_PATH, V11_PATH])
      assert.deepEqual((await run(path)).refused, current.refused);
    assert.equal(current.summary.passedTrials, 41);
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
