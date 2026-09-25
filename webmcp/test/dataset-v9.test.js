import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serializeDataset } from '../evals/dataset-v3.js';
import { V8_PATH } from '../evals/dataset-v8.js';
import {
  CONTRACT_1_8_ADDED_READS,
  CONTRACT_1_8_ARGUMENT_RULES,
  DATASET_V9_CONTRACT,
  DATASET_V9_VERSION,
  deriveDatasetV9,
  SEARCH_RESULT_CASES,
  SEARCH_RESULT_PROPERTIES,
  V9_PATH,
} from '../evals/dataset-v9.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };

describe('dataset 9.0.0', () => {
  const v8 = read(V8_PATH);
  const v9 = read(V9_PATH);
  const before = byId(v8);
  const after = byId(v9);

  it('is exactly what the generator derives from 8.0.0 and contract 1.8', () => {
    assert.equal(readFileSync(V9_PATH, 'utf8'), serializeDataset(deriveDatasetV9(v8)));
    assert.equal(v9.datasetVersion, DATASET_V9_VERSION);
    assert.equal(DATASET_V9_CONTRACT, '1.8');
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

  it('grades the arguments and admitted reads of contract 1.8, as recorded', () => {
    assert.equal(Object.keys(CONTRACT_1_8_ARGUMENT_RULES).length, 15);
    for (const item of v9.cases) {
      const old = before.get(item.id);
      assert.deepEqual(
        item.extra_calls_allowed,
        [...old.extra_calls_allowed, ...CONTRACT_1_8_ADDED_READS].sort(),
      );
      const tools = [...new Set([...item.expected_tools, ...item.extra_calls_allowed])].sort();
      assert.deepEqual(Object.keys(item.allowed_args).sort(), tools, item.id);
      for (const tool of tools) {
        assert.deepEqual(item.allowed_args[tool], CONTRACT_1_8_ARGUMENT_RULES[tool], `${item.id}.${tool}`);
      }
    }
    const search = after.get('home-001').allowed_args.search_bestprice;
    assert.deepEqual(search.navigate, { type: 'boolean' });
    assert.deepEqual(search.limit, { type: 'integer', minimum: 1, maximum: 8 });
  });

  it('passes a 1.8 search that 8.0.0 failed, and still fails one that breaks a bound', async () => {
    const adapter = createDemoAdapter();
    const args = { query: 'iPhone 16 128GB', navigate: false };
    /* Contract 2.1's search reads only and carries no `navigated`; the 1.8 result this set grades did. */
    const result = { ...(await adapter.execute('search_bestprice', args)), navigated: false };
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
