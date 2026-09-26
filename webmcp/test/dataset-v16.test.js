import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { serializeDataset } from '../evals/dataset-v3.js';
import { CONTRACT_2_2_ARGUMENT_RULES, V15_PATH } from '../evals/dataset-v15.js';
import {
  CONTRACT_2_5_ADDED_READS,
  caseArgumentRules,
  DATASET_V16_ALSO_GRADES,
  DATASET_V16_CONTRACT,
  DATASET_V16_VERSION,
  deriveDatasetV16,
  V16_PATH,
} from '../evals/dataset-v16.js';
import { CURRENT_CASES_PATH, runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { PAGE_TOOL_NAMES, TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';
import { unaccountedRequirements } from './helpers/contract-history.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
/* The product page's shopper actions (contracts 2.3 and 2.4): actions, never admitted as extras. */
const SHOPPER_ACTIONS = [
  'add_to_shopping_list',
  'remove_from_shopping_list',
  'add_to_comparison',
  'remove_from_comparison',
  'open_price_alert',
];

describe('dataset 16.0.0', () => {
  const v15 = read(V15_PATH);
  const v16 = read(V16_PATH);
  const before = byId(v15);
  const after = byId(v16);

  it('is exactly what the generator derives from 15.0.0 and contract 2.6', () => {
    assert.equal(readFileSync(V16_PATH, 'utf8'), serializeDataset(deriveDatasetV16(v15)));
    assert.equal(v16.datasetVersion, DATASET_V16_VERSION);
    /* Contract 2.8 changed no argument rule: 16.0.0 grades it as it is. */
    assert.ok([DATASET_V16_CONTRACT, ...DATASET_V16_ALSO_GRADES].includes(WEBMCP_CONTRACT_VERSION));
    assert.deepEqual(DATASET_V16_ALSO_GRADES, ['2.8']);
    assert.match(v16.sourceContracts, /22 contextual tools, contract 2\.6, bestprice\.gr 762f0a4bc7/u);
    assert.equal(CURRENT_CASES_PATH, V16_PATH, 'the deterministic driver runs the current dataset');
  });

  it('changes only admitted reads and argument rules: the list and comparison reads, the Brain’s inputs', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const changedRules = new Set();
    for (const [id, item] of after) {
      const { allowed_args: args, extra_calls_allowed: extras, ...definition } = item;
      const { allowed_args: oldArgs, extra_calls_allowed: oldExtras, ...oldDefinition } = before.get(id);
      assert.deepEqual(definition, oldDefinition, id);
      assert.deepEqual(extras, [...new Set([...oldExtras, ...CONTRACT_2_5_ADDED_READS])].sort(), id);
      for (const tool of SHOPPER_ACTIONS) assert.equal(tool in args, false, `${id} admits ${tool}`);
      for (const [tool, rules] of Object.entries(args)) {
        assert.deepEqual(rules, caseArgumentRules(tool, item.expected_tools), `${id}.${tool}`);
        if (tool in oldArgs && JSON.stringify(rules) !== JSON.stringify(oldArgs[tool]))
          changedRules.add(tool);
      }
    }
    /* Only the Shopping Brain's rules changed, by its two structured inputs. */
    assert.deepEqual([...changedRules], ['get_shopping_decision']);
    const decision = after.get('home-001').allowed_args.get_shopping_decision;
    assert.deepEqual(Object.keys(decision), ['message', 'max_price_eur', 'must_have', 'postal_code']);
    assert.deepEqual(decision.must_have, {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 40 },
    });
    for (const [tool, rules] of Object.entries(CONTRACT_2_2_ARGUMENT_RULES)) {
      if (tool !== 'get_shopping_decision') assert.deepEqual(caseArgumentRules(tool, [tool]), rules, tool);
    }
    /* The added reads are reads: the list on every page, the comparisons on the product page. */
    for (const tool of CONTRACT_2_5_ADDED_READS) {
      assert.equal(TOOL_DEFINITIONS[tool].annotations.readOnlyHint, true, tool);
    }
    assert.deepEqual(
      Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes('get_shopping_list')),
      ['home', 'listing', 'product', 'site'],
    );
  });

  it('only requires result properties a success of the published contract carries', () => {
    assert.deepEqual(unaccountedRequirements(v16, TOOL_DEFINITIONS), []);
    for (const item of v16.cases) {
      for (const tool of Object.keys(item.required_result_properties)) {
        assert.ok(TOOL_DEFINITIONS[tool], `${item.id}: ${tool}`);
      }
    }
  });

  it('admits reading the shopper’s list and comparisons on the way, and a budget given as an input', async () => {
    const adapter = createDemoAdapter();
    adapter.setPage('product');
    const list = await adapter.execute('get_shopping_list', {});
    const comparisons = await adapter.execute('get_comparison', {});
    const offers = await adapter.execute('compare_page_offers', {});
    /* product-010: the offers, with both reads before them. 15.0.0 did not admit them. */
    const steps = [
      { tool: 'get_shopping_list', arguments: {}, result: list },
      { tool: 'get_comparison', arguments: {}, result: comparisons },
      { tool: 'compare_page_offers', arguments: {}, result: offers },
    ];
    const graded = gradeJourney(after.get('product-010'), { steps, terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);
    assert.match(graded.reason, /2 admitted extra reads/u);
    assert.equal(gradeJourney(before.get('product-010'), { steps, terminal }).outcome, 'failed');
    /* An action on the way is not a read: adding to the list fails the case. */
    const added = await adapter.execute('add_to_shopping_list', {});
    assert.equal(
      gradeJourney(after.get('product-010'), {
        steps: [{ tool: 'add_to_shopping_list', arguments: {}, result: added }, steps[2]],
        terminal,
      }).outcome,
      'failed',
    );
    /* A structured budget is an argument the Brain now takes. */
    const decision = await adapter.execute('get_shopping_decision', {
      message: 'κινητό',
      max_price_eur: 750,
    });
    const decided = [
      {
        tool: 'get_shopping_decision',
        arguments: { message: 'κινητό', max_price_eur: 750 },
        result: decision,
      },
      steps[2],
    ];
    assert.equal(gradeJourney(after.get('product-010'), { steps: decided, terminal }).outcome, 'passed');
    assert.equal(
      gradeJourney(before.get('product-010'), { steps: decided, terminal }).reason,
      'unexpected argument get_shopping_decision.max_price_eur',
    );
  });

  it('is what the deterministic demo passes, as 15.0.0 still is', async () => {
    const run = async path => {
      const summary = await runEvaluation({ mode: 'demo', runs: 1, dryRun: true, casesFile: path });
      const outcome = value =>
        summary.records
          .filter(record => record.outcome === value)
          .map(record => record.caseId)
          .sort();
      return { summary, refused: outcome('refused'), failed: outcome('failed') };
    };
    const current = await run(V16_PATH);
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
    /* No chain changed, so the frozen 15.0.0 passes the 2.6 demo too. */
    const frozen = await run(V15_PATH);
    assert.deepEqual([frozen.failed, frozen.summary.passedTrials], [[], 42]);
  });

  it('starts an empty evidence ledger of its own, and leaves 15.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v16.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V16_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v16.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v16),
        datasetVersion: DATASET_V16_VERSION,
      }),
      [],
    );
    assert.equal(v15.datasetVersion, '15.0.0');
    assert.equal(before.get('home-001').extra_calls_allowed.includes('get_shopping_list'), false);
  });
});
