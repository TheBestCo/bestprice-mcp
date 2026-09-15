import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReviewSheet } from '../evals/review-sheet.mjs';
import { qualifyTask, reviewDigest } from '../evals/task-review.js';

const definition = {
  id: 'sample',
  group: 'product',
  expected_tools: ['read'],
  sequence_mode: 'ordered',
  deterministic_criteria: 'PASS when the price is reported.',
  prohibited_behavior: ['inventing a price'],
};
const passed = {
  runId: 'run-pass',
  agent: 'actor',
  prompt: 'What does it cost?',
  steps: [{ step: 1, tool: 'read', arguments: {}, result: { ok: true, price: 12 } }],
  terminal: { type: 'answer', text: '12 euros' },
  servedImplementation: { digest: 'a'.repeat(64) },
};
const unfinished = { ...passed, runId: 'run-blocked', terminal: null };
const ledger = {
  runs: [
    { runId: 'run-pass', caseId: 'sample', evidence: 'p' },
    { runId: 'run-blocked', caseId: 'sample', evidence: 'b' },
  ],
};
const readArtifact = path => ({ executions: [path === 'p' ? passed : unfinished] });

test('lists only runs that need a review, bound to their digest, with every judgement blank', () => {
  const { template, markdown } = buildReviewSheet(ledger, { cases: [definition] }, { readArtifact });
  assert.deepEqual(Object.keys(template), ['run-pass']);
  assert.deepEqual(template['run-pass'], {
    digest: reviewDigest(definition, passed),
    reviewer: null,
    taskSatisfied: null,
    grounded: null,
    rationale: null,
  });
  assert.match(markdown, /What does it cost\?/u);
  assert.match(markdown, /inventing a price/u);
  assert.match(markdown, /"price": 12/u);
  assert.doesNotMatch(markdown, /run-blocked/u);
});

test('an unfilled template qualifies nothing', () => {
  const { template } = buildReviewSheet(ledger, { cases: [definition] }, { readArtifact });
  assert.equal(qualifyTask(definition, passed, template['run-pass']).qualified, false);
  const filled = {
    ...template['run-pass'],
    reviewer: 'A. Reviewer',
    taskSatisfied: true,
    grounded: true,
    rationale: 'Matches the returned price.',
  };
  assert.equal(qualifyTask(definition, passed, filled).qualified, true);
});
