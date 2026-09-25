import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { argumentRules, serializeDataset } from '../evals/dataset-v3.js';
import { CONTRACT_1_8_ARGUMENT_RULES, V9_PATH } from '../evals/dataset-v9.js';
import {
  DATASET_V10_CONTRACT,
  DATASET_V10_VERSION,
  deriveDatasetV10,
  V10_PATH,
} from '../evals/dataset-v10.js';
import { runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { PAGE_TOOL_NAMES, TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
const V2_PATH = fileURLToPath(new URL('../evals/natural-language-cases.v2.json', import.meta.url));

describe('dataset 10.0.0', () => {
  const v9 = read(V9_PATH);
  const v10 = read(V10_PATH);
  const before = byId(v9);
  const after = byId(v10);

  it('is exactly what the generator derives from 9.0.0 and contract 1.9', () => {
    assert.equal(readFileSync(V10_PATH, 'utf8'), serializeDataset(deriveDatasetV10(v9)));
    assert.equal(v10.datasetVersion, DATASET_V10_VERSION);
    assert.equal(WEBMCP_CONTRACT_VERSION, DATASET_V10_CONTRACT);
    assert.match(v10.sourceContracts, /16 contextual tools, contract 1\.9/u);
  });

  it('changes only the argument rules and admitted reads, and 1.9 changed no argument of a 1.8 tool', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    for (const [id, item] of after) {
      const { allowed_args: args, extra_calls_allowed: extras, ...definition } = item;
      const { allowed_args: oldArgs, extra_calls_allowed: oldExtras, ...oldDefinition } = before.get(id);
      assert.deepEqual(definition, oldDefinition, id);
      assert.deepEqual(extras, [...oldExtras, 'get_product_details'].sort(), id);
      assert.deepEqual(
        Object.keys(args).sort(),
        [...new Set([...item.expected_tools, ...extras])].sort(),
        id,
      );
      for (const [tool, rules] of Object.entries(args)) {
        assert.deepEqual(rules, argumentRules(TOOL_DEFINITIONS[tool]), `${id}.${tool}`);
        if (tool in oldArgs) assert.deepEqual(rules, oldArgs[tool], `${id}.${tool} is 9.0.0's rule`);
      }
    }
    for (const [tool, rules] of Object.entries(CONTRACT_1_8_ARGUMENT_RULES)) {
      assert.deepEqual(argumentRules(TOOL_DEFINITIONS[tool]), rules, tool);
    }
  });

  it('only requires result properties a 1.9 success carries', () => {
    for (const item of v10.cases) {
      for (const [tool, properties] of Object.entries(item.required_result_properties ?? {})) {
        const success = TOOL_DEFINITIONS[tool].outputSchema.oneOf.find(branch => branch.title === 'Success');
        for (const property of properties) {
          assert.ok(Object.hasOwn(success.properties, property), `${item.id}: ${tool}.${property}`);
        }
      }
    }
  });

  it('admits checking a product before opening it, and grades the include list', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const listed = await adapter.execute('get_visible_products', {});
    const [first] = listed.products;
    const details = await adapter.execute('get_product_details', {
      product_id: first.product_id,
      include: ['offers'],
    });
    const opened = await adapter.execute('open_visible_product', { product_id: first.product_id });
    /* listing-003: read the list, open the first product. Reading that product first is what
     * get_product_details is for, and an extra read 9.0.0 does not admit. */
    const steps = include => [
      { tool: 'get_visible_products', arguments: {}, result: listed },
      { tool: 'get_product_details', arguments: { product_id: first.product_id, include }, result: details },
      { tool: 'open_visible_product', arguments: { product_id: first.product_id }, result: opened },
    ];
    assert.equal(
      gradeJourney(before.get('listing-003'), { steps: steps(['offers']), terminal }).outcome,
      'failed',
    );
    const graded = gradeJourney(after.get('listing-003'), { steps: steps(['offers']), terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);
    assert.match(graded.reason, /1 admitted extra read/u);
    for (const include of [[], ['offers', 'reviews'], 'offers', ['offers', 'offers', 'offers', 'offers']]) {
      assert.equal(
        gradeJourney(after.get('listing-003'), { steps: steps(include), terminal }).reason,
        'invalid list get_product_details.include',
        JSON.stringify(include),
      );
    }
    /* The page registers it everywhere but the item page, as the storefront does. */
    assert.deepEqual(
      Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes('get_product_details')),
      ['home', 'listing', 'site'],
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
    const current = await run(V10_PATH);
    assert.equal(current.summary.casesCount, 47);
    assert.deepEqual(current.failed, []);
    assert.equal(current.summary.blockedTrials, 0);
    assert.equal(current.summary.safetyViolations, 0);
    /* The refusals are the page refusing what those cases test, the same six as on 2.0.0 and 9.0.0. */
    assert.deepEqual(current.refused, [
      'listing-004',
      'listing-007',
      'listing-011',
      'neg-001',
      'neg-009',
      'product-006',
    ]);
    assert.deepEqual((await run(V2_PATH)).refused, current.refused);
    assert.deepEqual((await run(V9_PATH)).refused, current.refused);
    assert.equal(current.summary.passedTrials, 41);
  });

  it('starts an empty evidence ledger of its own, and leaves 9.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v10.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V10_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v10.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v10),
        datasetVersion: DATASET_V10_VERSION,
      }),
      [],
    );
    assert.equal(v9.datasetVersion, '9.0.0');
    assert.ok(!before.get('home-001').extra_calls_allowed.includes('get_product_details'));
  });
});
