import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSession } from '../evals/browser-session.js';
import { adjudicateRecord } from '../evals/journey.js';
import { auditRunEvidence } from '../evals/run-evidence.js';
import { qualifyTask, reviewDigest } from '../evals/task-review.js';

const definition = { id: 'sample', expected_tools: ['read'], sequence_mode: 'ordered' };
const execution = {
  runId: 'r1',
  agent: 'actor',
  steps: [{ tool: 'read', result: { ok: true, price: 12 } }],
  terminal: { type: 'answer', text: '12 euros' },
};
test('modern artifacts are regraded from all steps, including failures', () => {
  assert.equal(adjudicateRecord({ runId: 'r1' }, { executions: [execution] }, definition).outcome, 'passed');
  const broken = structuredClone(execution);
  broken.steps[0].result.ok = false;
  assert.equal(adjudicateRecord({ runId: 'r1' }, { executions: [broken] }, definition).outcome, 'failed');
});
test('tool success is not a grounded final answer; reviews are independent and immutable', () => {
  assert.equal(qualifyTask(definition, execution).qualified, false);
  const review = {
    digest: reviewDigest(definition, execution),
    reviewer: 'reviewer',
    taskSatisfied: true,
    grounded: true,
    rationale: 'The final price matches the observed price.',
  };
  assert.equal(qualifyTask(definition, execution, review).qualified, true);
  assert.equal(qualifyTask(definition, execution, { ...review, reviewer: 'actor' }).qualified, false);
  assert.equal(
    qualifyTask(definition, { ...execution, terminal: { type: 'answer', text: 'Free' } }, review).qualified,
    false,
  );
});
test('non-strict empty evidence cannot authorize a release', () => {
  const result = auditRunEvidence(
    { runs: [], datasetVersion: '2.0.0' },
    { datasetVersion: '2.0.0', cases: [definition] },
  );
  assert.equal(result.releaseReady, false);
});
test('browser peer preserves process state across requests', async () => {
  const code =
    'let n=0;require("readline").createInterface({input:process.stdin}).on("line",()=>console.log(JSON.stringify({n:++n})))';
  const peer = browserSession(`node -e '${code}'`);
  try {
    assert.equal((await peer.request({})).n, 1);
    assert.equal((await peer.request({})).n, 2);
  } finally {
    await peer.close();
  }
});
