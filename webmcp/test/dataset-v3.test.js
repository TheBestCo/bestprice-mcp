import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  argumentRules,
  CONTRACT_1_6_ARGUMENT_RULES,
  CONTRACT_1_6_READ_ONLY_TOOLS,
  deriveDatasetV3,
  readOnlyTools,
  serializeDataset,
  V2_PATH,
  V3_PATH,
} from '../evals/dataset-v3.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { createTools } from '../src/contracts.js';

const v2 = JSON.parse(readFileSync(V2_PATH, 'utf8'));
const v3 = JSON.parse(readFileSync(V3_PATH, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Done' };
/* Results carry the properties the 2.0.0 cases require, so a verdict is about the chain and arguments. */
const RESULT_PROPERTIES = {
  compare_page_offers: { source: 'page', product_id: '1', compared: 1, offers: [] },
  show_offer: { action: 'focused_offer', offer: {} },
};
const ok = (tool, args = {}) => ({ tool, arguments: args, result: { ok: true, ...RESULT_PROPERTIES[tool] } });

describe('dataset 3.0.0', () => {
  it('is exactly its derivation from 2.0.0 and the published contract', () => {
    assert.equal(readFileSync(V3_PATH, 'utf8'), serializeDataset(deriveDatasetV3(v2)));
  });

  it('keeps every prompt, chain and criterion of 2.0.0', () => {
    const old = byId(v2);
    assert.deepEqual([...byId(v3).keys()], [...old.keys()]);
    for (const item of v3.cases) {
      const before = old.get(item.id);
      for (const field of [
        'prompt_el',
        'prompt_en',
        'expected_tools',
        'sequence_mode',
        'required_result_properties',
        'deterministic_criteria',
        'group',
        'page',
      ]) {
        assert.deepEqual(item[field], before[field], `${item.id}.${field}`);
      }
      assert.doesNotMatch(item.starting_url, /\(| /u, `${item.id} starts on a real URL`);
    }
  });

  it('allows every argument contract 1.6 accepts, and nothing else', () => {
    for (const item of v3.cases) {
      for (const [tool, rules] of Object.entries(item.allowed_args)) {
        assert.deepEqual(rules, CONTRACT_1_6_ARGUMENT_RULES[tool], `${item.id}.${tool}`);
      }
    }
    const offers = byId(v3).get('product-011').allowed_args.show_offer;
    assert.ok(offers.offer_ref, 'the reference 2.0.0 rejected');
    assert.ok(byId(v3).get('product-005').allowed_args.get_product_specifications.fact);
  });

  /* The frozen datasets grade against 1.6. What contracts 1.7 to 1.9 published since is named here,
   * so the gap is a decision on record (a dataset that admits it is the next version) and never drift. */
  it('names exactly the arguments and tools published after contract 1.6', () => {
    const published = new Map(
      ['home', 'listing', 'product']
        .flatMap(page => createTools({ page, execute: () => {} }))
        .map(tool => [tool.name, argumentRules(tool)]),
    );
    const since = [];
    const newTools = [];
    const changed = [];
    const removed = [];
    for (const [tool, rules] of published) {
      const frozen = CONTRACT_1_6_ARGUMENT_RULES[tool];
      if (!frozen) {
        newTools.push(tool);
        continue;
      }
      for (const [name, rule] of Object.entries(frozen)) {
        if (!(name in rules)) removed.push(`${tool}.${name}`);
        else if (JSON.stringify(rules[name]) !== JSON.stringify(rule)) changed.push(`${tool}.${name}`);
      }
      for (const name of Object.keys(rules)) if (!(name in frozen)) since.push(`${tool}.${name}`);
    }
    assert.deepEqual(newTools.sort(), ['get_product_details', 'get_shopping_decision']);
    /* Registration revision 2026-09-25.12: up to 12 offers a call, and show_offer's merchant_id no
     * longer published (the page still takes it). Everything else 1.6 published is unchanged. */
    assert.deepEqual(changed, ['compare_page_offers.limit']);
    assert.equal(published.get('compare_page_offers').limit.maximum, 12);
    assert.deepEqual(removed, ['show_offer.merchant_id']);
    assert.deepEqual(since.sort(), [
      'clear_listing_filters.filter',
      'clear_listing_filters.value',
      'compare_page_offers.include_all_stores',
      'compare_page_offers.offset',
      'compare_page_offers.product_id',
      'get_listing_filters.group',
      'get_listing_filters.offset',
      'get_product_specifications.offset',
      'get_visible_products.load_more',
      'get_visible_products.offset',
      'search_bestprice.deals_only',
      'search_bestprice.in_stock_only',
      'search_bestprice.limit',
      'search_bestprice.max_price_eur',
      'search_bestprice.min_price_eur',
      'search_bestprice.navigate',
      'search_bestprice.sort',
      'summarize_price_history.show_chart',
    ]);
  });

  it('admits exactly the read-only tools of contract 1.6 as extras', () => {
    assert.deepEqual(CONTRACT_1_6_READ_ONLY_TOOLS, [
      'compare_page_offers',
      'get_listing_filters',
      'get_listing_sort_options',
      'get_page_product',
      'get_product_specifications',
      'get_visible_products',
      'summarize_price_history',
    ]);
    for (const item of v3.cases)
      assert.deepEqual(item.extra_calls_allowed, [...CONTRACT_1_6_READ_ONLY_TOOLS]);
    /* Contract 1.8 published one more read-only tool; admitting it is a later version. */
    assert.deepEqual(
      readOnlyTools().filter(name => !CONTRACT_1_6_READ_ONLY_TOOLS.includes(name)),
      /* get_product_details was read-only in 1.9 as first published, until it gained `navigate`. */
      ['get_shopping_decision'],
    );
    /* Revision 2026-09-25.12: two of 1.6's reads act when asked (load_more, show_chart). */
    assert.deepEqual(
      CONTRACT_1_6_READ_ONLY_TOOLS.filter(name => !readOnlyTools().includes(name)),
      ['get_visible_products', 'summarize_price_history'],
    );
  });

  it('is a valid, empty evidence ledger of its own', () => {
    const ledger = JSON.parse(readFileSync(new URL('../evals/runs.v3.json', import.meta.url), 'utf8'));
    assert.equal(ledger.casesRef, 'natural-language-cases.v3.json');
    assert.deepEqual(
      validateEvidenceFile(ledger, { caseDigests: caseDigestIndex(v3), datasetVersion: '3.0.0' }),
      [],
    );
  });
});

describe('grading with admitted extra reads', () => {
  const v3Case = id => byId(v3).get(id);
  const v2Case = id => byId(v2).get(id);

  it('passes a journey that read more than the chain needed, where 2.0.0 failed it', () => {
    const steps = [ok('get_page_product'), ok('compare_page_offers', { limit: 4 })];
    assert.equal(gradeJourney(v2Case('product-002'), { steps, terminal }).outcome, 'failed');
    const graded = gradeJourney(v3Case('product-002'), { steps, terminal });
    assert.equal(graded.outcome, 'passed');
    assert.match(graded.reason, /1 admitted extra read/u);
  });

  it('accepts the arguments the contract accepts', () => {
    const steps = [
      ok('compare_page_offers', { limit: 4 }),
      ok('show_offer', { offer_ref: 'offer-ref-1234' }),
    ];
    assert.equal(gradeJourney(v2Case('product-011'), { steps, terminal }).outcome, 'failed');
    assert.equal(gradeJourney(v3Case('product-011'), { steps, terminal }).outcome, 'passed');
  });

  it('still fails an extra action, a repeated action and an invalid argument on an extra read', () => {
    const product = v3Case('product-002');
    assert.equal(
      gradeJourney(product, {
        steps: [ok('compare_page_offers'), ok('show_offer', { merchant_name: 'Store' })],
        terminal,
      }).outcome,
      'failed',
    );
    const listing = v3Case('listing-008');
    assert.equal(
      gradeJourney(listing, { steps: [ok('clear_listing_filters'), ok('clear_listing_filters')], terminal })
        .outcome,
      'failed',
    );
    assert.equal(
      gradeJourney(product, {
        steps: [ok('get_visible_products', { limit: 99 }), ok('compare_page_offers')],
        terminal,
      }).outcome,
      'failed',
    );
  });

  it('matches an ordered chain through reads placed anywhere around it', () => {
    const multi = v3Case('multi-005');
    const steps = [
      ok('get_visible_products'),
      ok('get_listing_filters'),
      ok('get_page_product'),
      ok('get_visible_products'),
    ];
    assert.equal(gradeJourney(multi, { steps, terminal }).outcome, 'passed');
    /* One call of three with a terminal is the agent ending the task early: `failed`, not an
     * unfinished journey (grader rule changed 2026-09-18; see journey.js). */
    assert.equal(gradeJourney(multi, { steps: [ok('get_visible_products')], terminal }).outcome, 'failed');
  });

  it('does not let a refused extra read fail the run, and does not let a read stand in for a refusal', () => {
    const product = v3Case('product-002');
    const refusedRead = {
      tool: 'get_product_specifications',
      arguments: { section: 'Nope' },
      result: { ok: false, error: 'No specifications matched.' },
    };
    assert.equal(
      gradeJourney(product, { steps: [refusedRead, ok('compare_page_offers')], terminal }).outcome,
      'passed',
    );
    const noToolRefusal = v3.cases.find(item => item.expected_tools.length === 0);
    assert.equal(
      gradeJourney(noToolRefusal, {
        steps: [ok('get_page_product')],
        terminal: { type: 'refusal', text: 'I cannot do that.' },
      }).outcome,
      /* The grader's existing meaning: a no-tool case answered with a refusal passes; `refused` is
       * reserved for a page that refused a call. */
      'passed',
    );
    assert.equal(
      gradeJourney(noToolRefusal, { steps: [ok('get_page_product')], terminal }).outcome,
      'failed',
    );
  });
});
