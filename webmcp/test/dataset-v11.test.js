import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { argumentRules, serializeDataset } from '../evals/dataset-v3.js';
import { V9_PATH } from '../evals/dataset-v9.js';
import { CONTRACT_1_9_ARGUMENT_RULES, V10_PATH } from '../evals/dataset-v10.js';
import {
  DATASET_V11_CONTRACT,
  DATASET_V11_VERSION,
  deriveDatasetV11,
  READ_ONLY_WHEN_NOT_NAVIGATING,
  V11_PATH,
} from '../evals/dataset-v11.js';
import { runEvaluation } from '../evals/driver.js';
import { gradeJourney } from '../evals/journey.js';
import { caseDigestIndex, validateEvidenceFile } from '../evals/run-evidence.js';
import { PAGE_TOOL_NAMES, TOOL_DEFINITIONS, WEBMCP_CONTRACT_VERSION } from '../src/contracts.js';
import { createDemoAdapter } from '../src/demo-adapter.js';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const byId = dataset => new Map(dataset.cases.map(item => [item.id, item]));
const terminal = { type: 'answer', text: 'Η απάντηση του πράκτορα.' };
const V2_PATH = fileURLToPath(new URL('../evals/natural-language-cases.v2.json', import.meta.url));

describe('dataset 11.0.0', () => {
  const v10 = read(V10_PATH);
  const v11 = read(V11_PATH);
  const before = byId(v10);
  const after = byId(v11);

  it('is exactly what the generator derives from 10.0.0 and the revised contract 1.9', () => {
    assert.equal(readFileSync(V11_PATH, 'utf8'), serializeDataset(deriveDatasetV11(v10)));
    assert.equal(v11.datasetVersion, DATASET_V11_VERSION);
    assert.equal(WEBMCP_CONTRACT_VERSION, DATASET_V11_CONTRACT);
    assert.match(
      v11.sourceContracts,
      /16 contextual tools, contract 1\.9, storefront revision 2026-09-25\.7/u,
    );
  });

  it('changes only argument rules: the search constraints, one id form, and a details read that stays a read', () => {
    assert.deepEqual([...after.keys()], [...before.keys()]);
    const changed = new Set();
    for (const [id, item] of after) {
      const { allowed_args: args, ...definition } = item;
      const { allowed_args: oldArgs, ...oldDefinition } = before.get(id);
      assert.deepEqual(definition, oldDefinition, id);
      assert.deepEqual(Object.keys(args).sort(), Object.keys(oldArgs).sort(), id);
      for (const [tool, rules] of Object.entries(args)) {
        const expected = argumentRules(TOOL_DEFINITIONS[tool]);
        const flag = READ_ONLY_WHEN_NOT_NAVIGATING[tool];
        if (flag && !item.expected_tools.includes(tool))
          expected[flag] = { ...expected[flag], enum: [false] };
        assert.deepEqual(rules, expected, `${id}.${tool}`);
        if (JSON.stringify(rules) !== JSON.stringify(oldArgs[tool])) changed.add(tool);
      }
    }
    assert.deepEqual([...changed].sort(), ['compare_page_offers', 'get_product_details', 'search_bestprice']);
    /* Every other tool's rules are 1.9's as first published. */
    for (const [tool, rules] of Object.entries(CONTRACT_1_9_ARGUMENT_RULES)) {
      if (!changed.has(tool)) assert.deepEqual(argumentRules(TOOL_DEFINITIONS[tool]), rules, tool);
    }
  });

  it('only requires result properties a success of the published contract carries', () => {
    for (const item of v11.cases) {
      for (const [tool, properties] of Object.entries(item.required_result_properties ?? {})) {
        const success = TOOL_DEFINITIONS[tool].outputSchema.oneOf.find(branch => branch.title === 'Success');
        for (const property of properties) {
          assert.ok(Object.hasOwn(success.properties, property), `${item.id}: ${tool}.${property}`);
        }
      }
    }
  });

  it('passes a constrained search that 10.0.0 failed, and fails a bound it breaks', async () => {
    const adapter = createDemoAdapter();
    const args = { query: 'iPhone 16 128GB', max_price_eur: 900, sort: 'price_asc', navigate: false };
    const result = await adapter.execute('search_bestprice', args);
    const steps = call => [{ tool: 'search_bestprice', arguments: call, result }];
    assert.equal(
      gradeJourney(before.get('home-001'), { steps: steps(args), terminal }).reason,
      'unexpected argument search_bestprice.max_price_eur',
    );
    const graded = gradeJourney(after.get('home-001'), { steps: steps(args), terminal });
    assert.equal(graded.outcome, 'passed', graded.reason);
    for (const [call, reason] of [
      [{ ...args, max_price_eur: -5 }, 'invalid number search_bestprice.max_price_eur'],
      [{ ...args, max_price_eur: '900' }, 'invalid number search_bestprice.max_price_eur'],
      [{ ...args, sort: 'cheapest' }, 'invalid value search_bestprice.sort'],
      [{ ...args, deals_only: 'yes' }, 'invalid boolean search_bestprice.deals_only'],
    ]) {
      assert.equal(gradeJourney(after.get('home-001'), { steps: steps(call), terminal }).reason, reason);
    }
  });

  it('admits reading a product before opening it, but not a details call that moves the tab', async () => {
    const adapter = createDemoAdapter();
    await adapter.execute('search_bestprice', { query: 'phone' });
    const listed = await adapter.execute('get_visible_products', {});
    const [first] = listed.products;
    const details = await adapter.execute('get_product_details', { product_id: first.product_id });
    const opened = await adapter.execute('open_visible_product', { product_id: first.product_id });
    const steps = detailsArgs => [
      { tool: 'get_visible_products', arguments: {}, result: listed },
      { tool: 'get_product_details', arguments: detailsArgs, result: details },
      { tool: 'open_visible_product', arguments: { product_id: first.product_id }, result: opened },
    ];
    const graded = gradeJourney(after.get('listing-003'), {
      steps: steps({ product_id: first.product_id, navigate: false }),
      terminal,
    });
    assert.equal(graded.outcome, 'passed', graded.reason);
    assert.match(graded.reason, /1 admitted extra read/u);
    /* The extra call that moves the tab is an action, and an extra action fails. */
    assert.equal(
      gradeJourney(after.get('listing-003'), {
        steps: steps({ product_id: first.product_id, navigate: true }),
        terminal,
      }).reason,
      'invalid value get_product_details.navigate',
    );
    /* One product id form: the MCP server's bp_<id> is not the page tools' id. */
    assert.equal(
      gradeJourney(after.get('listing-003'), {
        steps: steps({ product_id: `bp_${first.product_id}` }),
        terminal,
      }).reason,
      'invalid string get_product_details.product_id',
    );
    assert.deepEqual(
      Object.keys(PAGE_TOOL_NAMES).filter(page => PAGE_TOOL_NAMES[page].includes('get_product_details')),
      /* Every page since the 2026-09-25.8 revision; admitted as a read wherever a case starts. */
      ['home', 'listing', 'product', 'site'],
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
    const current = await run(V11_PATH);
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
    for (const path of [V2_PATH, V9_PATH, V10_PATH])
      assert.deepEqual((await run(path)).refused, current.refused);
    assert.equal(current.summary.passedTrials, 41);
  });

  it('starts an empty evidence ledger of its own, and leaves 10.0.0 frozen', () => {
    const ledger = read(fileURLToPath(new URL('../evals/runs.v11.json', import.meta.url)));
    assert.equal(ledger.datasetVersion, DATASET_V11_VERSION);
    assert.equal(ledger.casesRef, 'natural-language-cases.v11.json');
    assert.deepEqual(ledger.runs, []);
    assert.deepEqual(
      validateEvidenceFile(ledger, {
        caseDigests: caseDigestIndex(v11),
        datasetVersion: DATASET_V11_VERSION,
      }),
      [],
    );
    assert.equal(v10.datasetVersion, '10.0.0');
    assert.equal(before.get('home-001').allowed_args.search_bestprice.sort, undefined);
  });
});
