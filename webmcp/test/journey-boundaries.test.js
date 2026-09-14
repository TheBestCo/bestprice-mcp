import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradeJourney } from '../evals/journey.js';
import { caseTargetVerdict } from '../evals/release-policy.js';

const definition = { id: 'probe', expected_tools: ['show_offer'], sequence_mode: 'ordered' };
const terminal = { type: 'answer', text: 'Done' };
const step = { tool: 'show_offer', args: {}, result: { ok: true } };

test('every sequence mode requires its complete tool set', () => {
  for (const sequence_mode of ['ordered', 'unordered', 'any_of']) {
    assert.equal(gradeJourney({ ...definition, sequence_mode }, { steps: [], terminal }).outcome, 'blocked');
  }
  assert.equal(
    gradeJourney(
      { ...definition, sequence_mode: 'unordered', expected_tools: ['show_offer', 'get_page_product'] },
      { steps: [step], terminal },
    ).outcome,
    'blocked',
  );
});
test('a named invocation without execution evidence cannot pass', () => {
  for (const result of [undefined, null, [], {}, { ok: 'true' }]) {
    assert.equal(gradeJourney(definition, { steps: [{ ...step, result }], terminal }).outcome, 'blocked');
  }
});
test('shared grading enforces result properties and bounded integers', () => {
  const bounded = {
    ...definition,
    allowed_args: { show_offer: { limit: { type: 'integer', minimum: 1, maximum: 4 } } },
    required_result_properties: { show_offer: ['offer'] },
  };
  assert.equal(gradeJourney(bounded, { steps: [step], terminal }).outcome, 'failed');
  for (const limit of [0, 5, 1.5, '2']) {
    assert.equal(
      gradeJourney(bounded, {
        steps: [{ ...step, args: { limit }, result: { ok: true, offer: {} } }],
        terminal,
      }).outcome,
      'failed',
    );
  }
});
test('correct refusal earns credit only with an explicit correctness verdict', () => {
  const refusalCase = { ...definition, id: 'product-006' };
  assert.equal(gradeJourney(refusalCase, { steps: [step], terminal }).outcome, 'failed');
  const correct = gradeJourney(refusalCase, {
    steps: [{ ...step, result: { ok: false } }],
    terminal: { type: 'refusal', text: 'Unavailable' },
  });
  const options = { minimumSamples: 5, targetPassRate: 0.95 };
  assert.equal(caseTargetVerdict(Array(5).fill(correct), options).meetsTarget, true);
  assert.equal(caseTargetVerdict(Array(5).fill({ outcome: 'refused' }), options).meetsTarget, false);
  const sparse = caseTargetVerdict(
    [...Array(5).fill({ outcome: 'passed' }), ...Array(95).fill({ outcome: 'blocked' })],
    options,
  );
  assert.equal(sparse.qualityMeetsTarget, true);
  assert.equal(sparse.completionRate, 0.05);
  assert.equal(sparse.meetsTarget, false);
});
