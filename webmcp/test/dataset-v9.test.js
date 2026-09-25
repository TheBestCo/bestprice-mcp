import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { argumentRules, serializeDataset } from '../evals/dataset-v3.js';
import { V8_PATH } from '../evals/dataset-v8.js';
import {
  DATASET_V9_CONTRACT,
  DATASET_V9_VERSION,
  deriveDatasetV9,
  SEARCH_RESULT_CASES,
  SEARCH_RESULT_PROPERTIES,
  V9_PATH,
} from '../evals/dataset-v9.js';
import { runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
const V2_PATH = fileURLToPath(new URL('../evals/natural-language-cases.v2.json', import.meta.url));

describe('dataset 9.0.0', () => {
  const v8 = read(V8_PATH);
  const v9 = read(V9_PATH);
  const before = byId(v8);
  const after = byId(v9);

  it('is exactly what the generator derives from 8.0.0 and contract 1.8', () => {
    assert.equal(readFileSync(V9_PATH, 'utf8'), serializeDataset(deriveDatasetV9(v8)));
    assert.equal(v9.datasetVersion, DATASET_V9_VERSION);
    assert.equal(WEBMCP_CONTRACT_VERSION, DATASET_V9_CONTRACT);
    assert.match(v9.sourceContracts, /15 contextual tools, contract 1\.8/u);
  });

  it('keeps every prompt, chain and criterion, and changes only the four search results it grades', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    for (const [id, item] of after) {
      const old = before.get(id);
      for (const field of [
        'prompt_el',
        'prompt_en',
        'starting_url',
        'expected_tools',
        'sequence_mode',
        'prohibited_behavior',
        'deterministic_criteria',
        'group',
        'page',
        'clarification_passes',
        'refusal_passes',
      ]) {
        assert.deepEqual(item[field], old[field], `${id}.${field}`);
      }
      if (!SEARCH_RESULT_CASES.includes(id)) {
        assert.deepEqual(item.required_result_properties, old.required_result_properties, id);
        continue;
      }
      /* 8.0.0 asked the 1.6 search for `action`; 9.0.0 asks the 1.8 search for what it returns. */
      assert.deepEqual(old.required_result_properties.search_bestprice, ['action', 'query'], id);
      assert.deepEqual(item.required_result_properties.search_bestprice, [...SEARCH_RESULT_PROPERTIES], id);
    }
  });

  it('grades the arguments and admitted reads of contract 1.8', () => {
    for (const item of v9.cases) {
      const old = before.get(item.id);
      assert.deepEqual(
        item.extra_calls_allowed,
        [...old.extra_calls_allowed, 'get_shopping_decision'].sort(),
      );
      const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
      assert.deepEqual(Object.keys(item.allowed_args).sort(), tools, item.id);
      for (const tool of tools) {
        assert.deepEqual(
          item.allowed_args[tool],
          argumentRules(TOOL_DEFINITIONS[tool]),
          `${item.id}.${tool}`,
        );
      }
    }
    const search = after.get('home-001').allowed_args.search_bestprice;
    assert.deepEqual(search.navigate, { type: 'boolean' });
    assert.deepEqual(search.limit, { type: 'integer', minimum: 1, maximum: 8 });
  });

  it('only requires result properties a 1.8 success carries', () => {
    for (const item of v9.cases) {
      for (const [tool, properties] of Object.entries(item.required_result_properties ?? {})) {
        const success = TOOL_DEFINITIONS[tool].outputSchema.oneOf.find(branch => branch.title === 'Success');
        for (const property of properties) {
          assert.ok(Object.hasOwn(success.properties, property), `${item.id}: ${tool}.${property}`);
        }
      }
    }
  });

  it('passes a 1.8 search that 8.0.0 failed, and still fails one that breaks a bound', async () => {
    const adapter = createDemoAdapter();
    const args = { query: 'iPhone 16 128GB', navigate: false };
    const result = await adapter.execute('search_bestprice', args);
    const steps = [{ tool: 'search_bestprice', arguments: args, result }];
    assert.equal(gradeJourney(before.get('home-001'), { steps, terminal }).outcome, 'failed');
    const graded = gradeJourney(after.get('home-001'), { steps, terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);

    const notBoolean = { query: 'iPhone 16 128GB', navigate: 'no' };
    assert.equal(
      gradeJourney(after.get('home-001'), {
        steps: [{ tool: 'search_bestprice', arguments: notBoolean, result }],
        terminal,
      }).reason,
      'invalid boolean search_bestprice.navigate',
    );
    const long = { query: 'x'.repeat(121) };
    assert.equal(
      gradeJourney(after.get('home-005'), {
        steps: [{ tool: 'search_bestprice', arguments: long, result }],
        terminal,
      }).outcome,
      'failed',
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
    const current = await run(V9_PATH);
    assert.equal(current.summary.casesCount, 47);
    assert.deepEqual(current.failed, []);
    assert.equal(current.summary.blockedTrials, 0);
    assert.equal(current.summary.safetyViolations, 0);
    /* The refusals are the page refusing what those cases test, the same six as on 2.0.0. */
    assert.deepEqual(current.refused, [
      'listing-004',
      'listing-007',
      'listing-011',
      'neg-001',
      'neg-009',
      'product-006',
    ]);
    assert.deepEqual((await run(V2_PATH)).refused, current.refused);
    assert.equal(current.summary.passedTrials, 41);
  });

  it('starts an empty evidence ledger of its own, and leaves 8.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v9.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V9_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v9.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, { caseDigests: caseDigestIndex(v9), datasetVersion: DATASET_V9_VERSION }),
      [],
    );
    assert.equal(v8.datasetVersion, '8.0.0');
    assert.deepEqual(before.get('home-001').required_result_properties.search_bestprice, ['action', 'query']);
  });
});
