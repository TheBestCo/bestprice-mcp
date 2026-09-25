import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { serializeDataset } from '../evals/dataset-v3.js';
import { V14_PATH } from '../evals/dataset-v14.js';
import {
  caseArgumentRules,
  DATASET_V15_CONTRACT,
  DATASET_V15_VERSION,
  deriveDatasetV15,
  V15_PATH,
} from '../evals/dataset-v15.js';
import { CURRENT_CASES_PATH, DETERMINISTIC_PLANS, runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';
import { unaccountedRequirements } from './helpers/contract-history.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
/* The cases that open search results: since 2.2 they search first, and open the results_url it returned. */
const SEARCHED_FIRST = ['multi-001', 'multi-002'];

describe('dataset 15.0.0', () => {
  const v14 = read(V14_PATH);
  const v15 = read(V15_PATH);
  const before = byId(v14);
  const after = byId(v15);

  it('is exactly what the generator derives from 14.0.0 and contract 2.2', () => {
    assert.equal(readFileSync(V15_PATH, 'utf8'), serializeDataset(deriveDatasetV15(v14)));
    assert.equal(v15.datasetVersion, DATASET_V15_VERSION);
    assert.equal(WEBMCP_CONTRACT_VERSION, DATASET_V15_CONTRACT);
    assert.match(v15.sourceContracts, /15 contextual tools, contract 2\.2, bestprice\.gr 8d040a161a/u);
    assert.equal(CURRENT_CASES_PATH, V15_PATH, 'the deterministic driver runs the current dataset');
  });

  it('searches before it opens search results, and changes nothing else', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const changed = [];
    for (const [id, item] of after) {
      const old = before.get(id);
      for (const key of ['group', 'page', 'prompt_el', 'prompt_en', 'starting_url', 'sequence_mode']) {
        assert.deepEqual(item[key], old[key], `${id}.${key}`);
      }
      assert.deepEqual(item.required_result_properties, old.required_result_properties, id);
      assert.deepEqual(item.extra_calls_allowed, old.extra_calls_allowed, id);
      for (const [tool, rules] of Object.entries(item.allowed_args)) {
        assert.deepEqual(rules, caseArgumentRules(tool, item.expected_tools), `${id}.${tool}`);
      }
      if (JSON.stringify(item.expected_tools) !== JSON.stringify(old.expected_tools)) changed.push(id);
      /* Every results page a chain opens is one a search in it returned. */
      const opens = item.expected_tools.indexOf('open_search_results');
      if (opens !== -1) assert.equal(item.expected_tools[opens - 1], 'search_bestprice', id);
    }
    assert.deepEqual(changed, SEARCHED_FIRST);
    for (const id of SEARCHED_FIRST) {
      assert.deepEqual(
        after.get(id).expected_tools,
        ['search_bestprice', ...before.get(id).expected_tools],
        id,
      );
      assert.deepEqual(after.get(id).allowed_args.open_search_results, {
        results_url: { type: 'string', minLength: 1, maxLength: 2048 },
      });
      assert.match(after.get(id).deterministic_criteria, /opens the results_url the search returned/u);
    }
  });

  it('only requires result properties a success of the published contract carries', () => {
    assert.deepEqual(unaccountedRequirements(v15, TOOL_DEFINITIONS), []);
    for (const item of v15.cases) {
      for (const tool of Object.keys(item.required_result_properties)) {
        assert.ok(TOOL_DEFINITIONS[tool], `${item.id}: ${tool}`);
      }
    }
  });

  it('passes opening the results_url a search returned, and fails opening results by query', async () => {
    const adapter = createDemoAdapter();
    const search = await adapter.execute('search_bestprice', { query: 'iPhone 16' });
    const shown = await adapter.execute('open_search_results', { results_url: search.results_url });
    const listed = await adapter.execute('get_visible_products', {});
    const [first] = listed.products;
    const opened = await adapter.execute('open_product', { product_id: first.product_id });
    const facts = await adapter.execute('get_page_product', {});
    const chain = openArgs => [
      { tool: 'search_bestprice', arguments: { query: 'iPhone 16' }, result: search },
      { tool: 'open_search_results', arguments: openArgs, result: shown },
      { tool: 'get_visible_products', arguments: {}, result: listed },
      { tool: 'open_product', arguments: { product_id: first.product_id }, result: opened },
      { tool: 'get_page_product', arguments: {}, result: facts },
    ];
    const graded = gradeJourney(after.get('multi-001'), {
      steps: chain({ results_url: search.results_url }),
      terminal,
    });
    assert.equal(graded.outcome, 'passed', graded.reason);
    /* 2.1's query is no longer an argument; skipping the search leaves the chain unfinished. */
    assert.equal(
      gradeJourney(after.get('multi-001'), { steps: chain({ query: 'iPhone 16' }), terminal }).reason,
      'unexpected argument open_search_results.query',
    );
    assert.equal(
      gradeJourney(after.get('multi-001'), {
        steps: chain({ results_url: search.results_url }).slice(1),
        terminal,
      }).outcome,
      'failed',
    );
    /* The driver's scripted plans open exactly the address the demo's search returns. */
    for (const [id, query] of [
      ['multi-001', 'iPhone 16'],
      ['multi-002', 'κινητά'],
    ]) {
      const plan = DETERMINISTIC_PLANS[id];
      assert.deepEqual(plan[0], { tool: 'search_bestprice', args: { query } });
      const returned = (await createDemoAdapter().execute('search_bestprice', { query })).results_url;
      assert.deepEqual(plan[1], { tool: 'open_search_results', args: { results_url: returned } });
    }
  });

  it('is what the deterministic demo passes, and 14.0.0 fails only the cases 15.0.0 changed', async () => {
    const run = async path => {
      const summary = await runEvaluation({ mode: 'demo', runs: 1, dryRun: true, casesFile: path });
      const outcome = value =>
        summary.records
          .filter(record => record.outcome === value)
          .map(record => record.caseId)
          .sort();
      return { summary, refused: outcome('refused'), failed: outcome('failed') };
    };
    const current = await run(V15_PATH);
    assert.equal(current.summary.casesCount, 47);
    assert.deepEqual(current.failed, []);
    assert.equal(current.summary.blockedTrials, 0);
    assert.equal(current.summary.safetyViolations, 0);
    assert.deepEqual(current.refused, [
      'listing-004',
      'listing-007',
      'listing-011',
      'neg-009',
      'product-006',
    ]);
    assert.equal(current.summary.passedTrials, 42);
    /* The frozen 14.0.0 grades 2.1's open_search_results { query }: on the 2.2 demo exactly the two
     * cases whose chain opens search results fail. */
    const frozen = await run(V14_PATH);
    assert.deepEqual(frozen.failed, SEARCHED_FIRST);
  });

  it('starts an empty evidence ledger of its own, and leaves 14.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v15.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V15_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v15.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v15),
        datasetVersion: DATASET_V15_VERSION,
      }),
      [],
    );
    assert.equal(v14.datasetVersion, '14.0.0');
    assert.equal(before.get('multi-001').expected_tools[0], 'open_search_results');
  });
});
