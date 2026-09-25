import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V13_PATH } from '../evals/dataset-v13.js';
import {
  CONTRACT_2_1_ADDED_READS,
  CONTRACT_2_1_REMOVED_PROPERTIES,
  caseArgumentRules,
  DATASET_V14_CONTRACT,
  DATASET_V14_VERSION,
  deriveDatasetV14,
  READ_ONLY_UNLESS,
  V14_PATH,
} from '../evals/dataset-v14.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { TOOL_DEFINITIONS, TOOL_NAMES } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
/* The cases whose search step became open_search_results: the chain used the listing it moved to. */
const OPENED_SEARCHES = ['multi-001', 'multi-002'];
/* The cases whose required result properties named something 2.1 took out of a success. */
const CHANGED_REQUIREMENTS = [
  'home-001',
  'home-002',
  'home-005',
  'listing-006',
  'listing-008',
  'listing-010',
  'listing-012',
];

describe('dataset 14.0.0', () => {
  const v13 = read(V13_PATH);
  const v14 = read(V14_PATH);
  const before = byId(v13);
  const after = byId(v14);

  it('is exactly what the generator derives from 13.0.0 and contract 2.1', () => {
    assert.equal(readFileSync(V14_PATH, 'utf8'), serializeDataset(deriveDatasetV14(v13)));
    assert.equal(v14.datasetVersion, DATASET_V14_VERSION);
    assert.equal(DATASET_V14_CONTRACT, '2.1');
    assert.match(
      v14.sourceContracts,
      /15 contextual tools, contract 2\.1, storefront revision 2026-09-25\.14/u,
    );
  });

  it('opens the search results where the chain used them, and changes nothing else in a chain', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const opened = [];
    for (const [id, item] of after) {
      const old = before.get(id);
      if (JSON.stringify(item.expected_tools) !== JSON.stringify(old.expected_tools)) opened.push(id);
      for (const key of ['group', 'page', 'prompt_el', 'prompt_en', 'starting_url', 'sequence_mode']) {
        assert.deepEqual(item[key], old[key], `${id}.${key}`);
      }
      for (const tool of [...item.expected_tools, ...item.extra_calls_allowed]) {
        assert.ok(TOOL_NAMES.includes(tool), `${id} names ${tool}`);
      }
    }
    assert.deepEqual(opened, OPENED_SEARCHES);
    assert.deepEqual(after.get('multi-001').expected_tools, [
      'open_search_results',
      'get_visible_products',
      'open_product',
      'get_page_product',
    ]);
    assert.deepEqual(after.get('multi-002').expected_tools, [
      'open_search_results',
      'apply_listing_filter',
      'apply_listing_sort',
      'get_visible_products',
    ]);
    /* A search that answers the question stays a read. */
    for (const id of ['home-001', 'home-002', 'home-005', 'listing-012', 'multi-006']) {
      assert.deepEqual(after.get(id).expected_tools, ['search_bestprice'], id);
    }
  });

  it('requires only what a 2.1 success carries, and admits search as a read', () => {
    const changed = [];
    for (const [id, item] of after) {
      if (
        JSON.stringify(item.required_result_properties) !==
        JSON.stringify(before.get(id).required_result_properties)
      ) {
        changed.push(id);
      }
      for (const [tool, properties] of Object.entries(item.required_result_properties)) {
        const success = TOOL_DEFINITIONS[tool].outputSchema.oneOf.find(
          branch => branch.properties.ok.const === true,
        );
        for (const property of properties) {
          assert.ok(Object.hasOwn(success.properties, property), `${id}: ${tool}.${property}`);
          assert.equal(CONTRACT_2_1_REMOVED_PROPERTIES[tool]?.includes(property) ?? false, false);
        }
      }
      assert.deepEqual(
        item.extra_calls_allowed,
        [...new Set([...before.get(id).extra_calls_allowed, ...CONTRACT_2_1_ADDED_READS])].sort(),
        id,
      );
      for (const [tool, rules] of Object.entries(item.allowed_args)) {
        assert.deepEqual(rules, caseArgumentRules(tool, item.expected_tools), `${id}.${tool}`);
      }
    }
    assert.deepEqual(changed.sort(), CHANGED_REQUIREMENTS);
    assert.deepEqual(after.get('home-001').required_result_properties, {
      search_bestprice: ['query', 'results_url', 'results_kind', 'products'],
    });
    assert.deepEqual(after.get('listing-006').required_result_properties, {
      apply_listing_filter: ['outcome'],
    });
    /* No navigate on search, no load_more on the read; show_chart is the one acting argument left. */
    const rules = after.get('home-001').allowed_args;
    assert.equal('navigate' in rules.search_bestprice, false);
    assert.equal('load_more' in rules.get_visible_products, false);
    assert.deepEqual(Object.keys(READ_ONLY_UNLESS), ['summarize_price_history']);
    assert.equal(TOOL_DEFINITIONS.search_bestprice.annotations.readOnlyHint, true);
    /* What 2.1 adds to the admitted reads is a read. */
    for (const tool of CONTRACT_2_1_ADDED_READS) {
      assert.equal(TOOL_DEFINITIONS[tool].annotations.readOnlyHint, true, tool);
    }
    assert.equal(after.get('neg-001').expects_refusal, false);
    assert.match(after.get('neg-001').deterministic_criteria, /get_page_product there reads its price/u);
  });

  it('passes a search read and an opened search, and fails the 2.0 search that moved the tab', async () => {
    const adapter = createDemoAdapter();
    /* home-001: the read answers the question; 13.0.0 required `navigated`, which 2.1 does not return. */
    const result = await adapter.execute('search_bestprice', { query: 'iPhone 16 128GB' });
    const steps = [{ tool: 'search_bestprice', arguments: { query: 'iPhone 16 128GB' }, result }];
    const graded = gradeJourney(after.get('home-001'), { steps, terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);
    assert.equal(
      gradeJourney(before.get('home-001'), { steps, terminal }).reason,
      'missing result property search_bestprice.navigated',
    );
    /* 2.0's navigate is no longer an argument the published schema takes. */
    assert.equal(
      gradeJourney(after.get('home-001'), {
        steps: [{ tool: 'search_bestprice', arguments: { query: 'iPhone 16', navigate: true }, result }],
        terminal,
      }).reason,
      'unexpected argument search_bestprice.navigate',
    );

    /* multi-001: open the results, read them, open the first, read it. A search read before is an
     * admitted extra read. */
    /* Contract 2.2 removed the query input: the 2.1 receipt is written out as the page returned it. */
    const shown = { ok: true, outcome: 'confirmed', query: 'iPhone 16', results_url: result.results_url };
    await adapter.execute('open_search_results', {
      results_url: 'https://www.bestprice.gr/search?q=iPhone%2016',
    });
    const listed = await adapter.execute('get_visible_products', {});
    const [first] = listed.products;
    const opened = await adapter.execute('open_product', { product_id: first.product_id });
    const facts = await adapter.execute('get_page_product', {});
    const chain = [
      { tool: 'search_bestprice', arguments: { query: 'iPhone 16' }, result },
      { tool: 'open_search_results', arguments: { query: 'iPhone 16' }, result: shown },
      { tool: 'get_visible_products', arguments: {}, result: listed },
      { tool: 'open_product', arguments: { product_id: first.product_id }, result: opened },
      { tool: 'get_page_product', arguments: {}, result: facts },
    ];
    const multi = gradeJourney(after.get('multi-001'), { steps: chain, terminal });
    assert.equal(multi.outcome, 'passed', multi.reason);
    assert.match(multi.reason, /1 admitted extra read/u);
    assert.equal(
      gradeJourney(before.get('multi-001'), { steps: chain.slice(1), terminal }).outcome,
      'failed',
    );
  });

  it('starts an empty evidence ledger of its own, and leaves 13.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v14.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V14_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v14.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v14),
        datasetVersion: DATASET_V14_VERSION,
      }),
      [],
    );
    assert.equal(v13.datasetVersion, '13.0.0');
    assert.deepEqual(before.get('home-001').required_result_properties.search_bestprice.at(-1), 'navigated');
  });
});
