import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertCompleteSelectionRun, scoreSelectionRun } from '../src/selection-score.js';

const cases = [
  {
    id: 'decision',
    expectedSkill: true,
    expectedTools: ['get_shopping_decision'],
  },
  {
    id: 'offers',
    expectedSkill: true,
    expectedTools: ['search_products', 'compare_offers'],
  },
  {
    id: 'negative',
    expectedSkill: false,
    expectedTools: [],
  },
];

describe('selection benchmark scorer', () => {
  it('scores activation, routing, quality, and latency without hiding missing cases', () => {
    const score = scoreSelectionRun(cases, [
      {
        caseId: 'decision',
        skillSelected: true,
        tools: ['get_shopping_decision'],
        argumentsAccurate: true,
        answerCompleted: true,
        evidencePreserved: true,
        latencyMs: 100,
      },
      {
        caseId: 'offers',
        skillSelected: false,
        tools: [],
        argumentsAccurate: false,
        zeroResultRecovered: true,
        answerCompleted: false,
        evidencePreserved: true,
        latencyMs: 900,
      },
    ]);

    assert.deepEqual(score.coverage, {
      observed: 2,
      total: 3,
      rate: 2 / 3,
      missingCaseIds: ['negative'],
    });
    assert.deepEqual(score.activation.recall, { passed: 1, total: 2, rate: 0.5 });
    assert.deepEqual(score.routing.positiveExactSequenceAccuracy, {
      passed: 1,
      total: 2,
      rate: 0.5,
    });
    assert.deepEqual(score.quality.argumentsAccuracy, { passed: 1, total: 2, rate: 0.5 });
    assert.deepEqual(score.quality.zeroResultRecovery, { passed: 1, total: 1, rate: 1 });
    assert.deepEqual(score.latency, { count: 2, p50Ms: 100, p95Ms: 900, maxMs: 900 });
  });

  it('measures false activation and BestPrice-tool leakage on negatives', () => {
    const score = scoreSelectionRun(cases, [
      {
        caseId: 'negative',
        skillSelected: true,
        tools: ['search_products'],
      },
    ]);

    assert.deepEqual(score.activation.falseActivationRate, { passed: 1, total: 1, rate: 1 });
    assert.deepEqual(score.routing.negativeToolLeakRate, { passed: 1, total: 1, rate: 1 });
    assert.deepEqual(score.routing.exactSequenceAccuracy, { passed: 0, total: 1, rate: 0 });
  });

  it('rejects duplicate, unknown, and malformed provider evidence', () => {
    assert.throws(
      () =>
        scoreSelectionRun(cases, [
          { caseId: 'decision', skillSelected: true, tools: ['get_shopping_decision'] },
          { caseId: 'decision', skillSelected: true, tools: ['get_shopping_decision'] },
        ]),
      /Duplicate selection result/u,
    );
    assert.throws(
      () => scoreSelectionRun(cases, [{ caseId: 'missing', skillSelected: false, tools: [] }]),
      /Unknown selection case/u,
    );
    assert.throws(
      () =>
        scoreSelectionRun(cases, [
          { caseId: 'decision', skillSelected: true, tools: ['not-a-bestprice-tool'] },
        ]),
      /unknown BestPrice tool/u,
    );
  });

  it('can require a complete provider run explicitly', () => {
    const partial = scoreSelectionRun(cases, [
      { caseId: 'decision', skillSelected: true, tools: ['get_shopping_decision'] },
    ]);
    assert.throws(() => assertCompleteSelectionRun(partial), /Selection run is incomplete/u);

    const complete = scoreSelectionRun(cases, [
      { caseId: 'decision', skillSelected: true, tools: ['get_shopping_decision'] },
      { caseId: 'offers', skillSelected: true, tools: ['search_products', 'compare_offers'] },
      { caseId: 'negative', skillSelected: false, tools: [] },
    ]);
    assert.equal(assertCompleteSelectionRun(complete), complete);
  });
});
