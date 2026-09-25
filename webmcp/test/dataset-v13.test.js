import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V12_PATH } from '../evals/dataset-v12.js';
import {
  CONTRACT_2_0_SUCCESSORS,
  caseArgumentRules,
  DATASET_V13_CONTRACT,
  DATASET_V13_VERSION,
  deriveDatasetV13,
  READ_ONLY_UNLESS,
  V13_PATH,
} from '../evals/dataset-v13.js';
import { gradeJourney, isRefusalCase } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { PAGE_TOOL_NAMES, TOOL_DEFINITIONS, TOOL_NAMES } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';
import { unaccountedRequirements } from './helpers/contract-history.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
const REMOVED = Object.keys(CONTRACT_2_0_SUCCESSORS);
/* The cases whose chain named a tool contract 2.0 removed. */
const CHANGED_CHAINS = [
  'listing-003',
  'listing-004',
  'listing-009',
  'multi-001',
  'multi-003',
  'multi-004',
  'neg-001',
  'product-009',
];
const GROUP_PAGES = { homepage: 'home', listing: 'listing', product: 'product' };

describe('dataset 13.0.0', () => {
  const v12 = read(V12_PATH);
  const v13 = read(V13_PATH);
  const before = byId(v12);
  const after = byId(v13);

  it('is exactly what the generator derives from 12.0.0 and contract 2.0', () => {
    assert.equal(readFileSync(V13_PATH, 'utf8'), serializeDataset(deriveDatasetV13(v12)));
    assert.equal(v13.datasetVersion, DATASET_V13_VERSION);
    assert.equal(DATASET_V13_CONTRACT, '2.0');
    assert.match(
      v13.sourceContracts,
      /13 contextual tools, contract 2\.0, storefront revision 2026-09-25\.13/u,
    );
  });

  it('names no removed tool anywhere, and only tools the starting page registers', () => {
    assert.deepEqual(REMOVED.sort(), [
      'get_listing_sort_options',
      'get_product_details',
      'open_visible_product',
      'show_price_history',
    ]);
    for (const item of v13.cases) {
      const named = [
        ...item.expected_tools,
        ...item.extra_calls_allowed,
        ...Object.keys(item.allowed_args),
        ...Object.keys(item.required_result_properties),
      ];
      for (const tool of named) assert.ok(TOOL_NAMES.includes(tool), `${item.id} names ${tool}`);
      const text = JSON.stringify([item.prohibited_behavior, item.deterministic_criteria]);
      for (const tool of REMOVED) assert.equal(text.includes(tool), false, `${item.id} words name ${tool}`);
      if (item.group in GROUP_PAGES && item.sequence_mode === 'ordered' && item.expected_tools.length) {
        const exposed = PAGE_TOOL_NAMES[GROUP_PAGES[item.group]];
        assert.ok(
          exposed.includes(item.expected_tools[0]),
          `${item.id} starts with ${item.expected_tools[0]}`,
        );
      }
    }
  });

  it('replaces each removed tool by its successor, and changes nothing else but the words that named it', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const changed = [];
    for (const [id, item] of after) {
      const old = before.get(id);
      const successor = tool => CONTRACT_2_0_SUCCESSORS[tool]?.tool ?? tool;
      assert.deepEqual(item.expected_tools, old.expected_tools.map(successor), id);
      if (JSON.stringify(item.expected_tools) !== JSON.stringify(old.expected_tools)) changed.push(id);
      assert.deepEqual(
        item.extra_calls_allowed,
        old.extra_calls_allowed.filter(tool => !REMOVED.includes(tool)),
        id,
      );
      for (const key of ['group', 'page', 'prompt_el', 'prompt_en', 'starting_url', 'sequence_mode']) {
        assert.deepEqual(item[key], old[key], `${id}.${key}`);
      }
      for (const [tool, rules] of Object.entries(item.allowed_args)) {
        assert.deepEqual(rules, caseArgumentRules(tool, item.expected_tools), `${id}.${tool}`);
      }
    }
    assert.deepEqual(changed.sort(), CHANGED_CHAINS);
    /* The required result properties of the removed tools, as their successors return them. */
    assert.deepEqual(after.get('listing-003').required_result_properties, {
      open_product: ['outcome', 'product_id'],
    });
    assert.deepEqual(after.get('listing-009').required_result_properties, {
      get_listing_filters: ['source', 'sort_options'],
    });
    assert.deepEqual(after.get('product-009').required_result_properties, {
      summarize_price_history: ['chart', 'product_id'],
    });
    /* Where a successor is expected, its acting argument is open; where it is an extra read, it reads. */
    assert.deepEqual(after.get('product-009').allowed_args.summarize_price_history.show_chart, {
      type: 'boolean',
    });
    assert.deepEqual(after.get('product-001').allowed_args.summarize_price_history.show_chart, {
      type: 'boolean',
      enum: [false],
    });
    assert.deepEqual(Object.keys(READ_ONLY_UNLESS), ['get_visible_products', 'summarize_price_history']);
  });

  it('grades neg-001 as open_product succeeding, and keeps every other refusal case', () => {
    assert.equal(after.get('neg-001').expects_refusal, false);
    assert.equal(isRefusalCase(after.get('neg-001')), false);
    assert.equal(isRefusalCase(before.get('neg-001')), true, '12.0.0 still grades the 1.x refusal');
    assert.deepEqual(
      v13.cases.filter(item => item.expects_refusal !== undefined).map(item => item.id),
      ['neg-001'],
    );
    assert.deepEqual(
      v13.cases.filter(item => isRefusalCase(item) && item.expected_tools.length).map(item => item.id),
      ['listing-004', 'listing-007', 'listing-011', 'product-006', 'neg-009'],
    );
  });

  it('only requires result properties a success of the published contract carries, or that later contracts removed', () => {
    /* Frozen: a requirement is either still in a success of the published contract, or recorded as
     * taken out since (test/helpers/contract-history.js). */
    assert.deepEqual(unaccountedRequirements(v13, TOOL_DEFINITIONS), []);
  });

  it('passes opening a product by id and charting with the summary, which 12.0.0 fails', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const listed = await adapter.execute('get_visible_products', {});
    const [first] = listed.products;
    const opened = await adapter.execute('open_product', { product_id: first.product_id });
    const steps = [
      { tool: 'get_visible_products', arguments: {}, result: listed },
      { tool: 'open_product', arguments: { product_id: first.product_id }, result: opened },
    ];
    const graded = gradeJourney(after.get('listing-003'), { steps, terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);
    assert.equal(gradeJourney(before.get('listing-003'), { steps, terminal }).outcome, 'failed');

    const chart = await adapter.execute('summarize_price_history', { show_chart: true });
    const charting = [{ tool: 'summarize_price_history', arguments: { show_chart: true }, result: chart }];
    const shown = gradeJourney(after.get('product-009'), { steps: charting, terminal });
    assert.equal(shown.outcome, 'passed', shown.reason);
    /* Without show_chart there is no `chart`: the summary alone does not open it. */
    const summary = await adapter.execute('summarize_price_history', {});
    assert.equal(
      gradeJourney(after.get('product-009'), {
        steps: [{ tool: 'summarize_price_history', arguments: {}, result: summary }],
        terminal,
      }).reason,
      'missing result property summarize_price_history.chart',
    );
    /* An extra call that opens the chart is an action where the case does not expect it. */
    const compared = await adapter.execute('compare_page_offers', {});
    assert.equal(
      gradeJourney(after.get('product-010'), {
        steps: [
          { tool: 'summarize_price_history', arguments: { show_chart: true }, result: chart },
          { tool: 'compare_page_offers', arguments: {}, result: compared },
        ],
        terminal,
      }).reason,
      'invalid value summarize_price_history.show_chart',
    );
  });

  it('starts an empty evidence ledger of its own, and leaves 12.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v13.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V13_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v13.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v13),
        datasetVersion: DATASET_V13_VERSION,
      }),
      [],
    );
    assert.equal(v12.datasetVersion, '12.0.0');
    assert.deepEqual(before.get('listing-003').expected_tools, [
      'get_visible_products',
      'open_visible_product',
    ]);
  });
});
