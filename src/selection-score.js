const PUBLIC_TOOLS = new Set([
  'get_shopping_decision',
  'search_products',
  'compare_offers',
  'get_price_history',
]);

function ratio(passed, total) {
  return {
    passed,
    total,
    rate: total === 0 ? null : passed / total,
  };
}

function sameSequence(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nearestRank(values, percentile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index];
}

function optionalBooleanMetric(observations, key) {
  const eligible = observations.filter(({ record }) => typeof record[key] === 'boolean');
  return ratio(eligible.filter(({ record }) => record[key]).length, eligible.length);
}

function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError('Selection cases must be a non-empty array');
  }
  const ids = new Set();
  for (const testCase of cases) {
    if (!testCase || typeof testCase !== 'object') throw new TypeError('Selection case must be an object');
    if (typeof testCase.id !== 'string' || testCase.id.length === 0) {
      throw new TypeError('Selection case id must be a non-empty string');
    }
    if (ids.has(testCase.id)) throw new TypeError(`Duplicate selection case id: ${testCase.id}`);
    ids.add(testCase.id);
    if (typeof testCase.expectedSkill !== 'boolean') {
      throw new TypeError(`${testCase.id}: expectedSkill must be boolean`);
    }
    if (!Array.isArray(testCase.expectedTools)) {
      throw new TypeError(`${testCase.id}: expectedTools must be an array`);
    }
    for (const tool of testCase.expectedTools) {
      if (!PUBLIC_TOOLS.has(tool)) throw new TypeError(`${testCase.id}: unknown expected tool ${tool}`);
    }
  }
  return new Map(cases.map(testCase => [testCase.id, testCase]));
}

function validateRecords(records, caseMap) {
  if (!Array.isArray(records)) throw new TypeError('Selection run records must be an array');
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object') throw new TypeError('Selection record must be an object');
    if (typeof record.caseId !== 'string' || !caseMap.has(record.caseId)) {
      throw new TypeError(`Unknown selection case: ${String(record.caseId)}`);
    }
    if (ids.has(record.caseId)) throw new TypeError(`Duplicate selection result: ${record.caseId}`);
    ids.add(record.caseId);
    if (typeof record.skillSelected !== 'boolean') {
      throw new TypeError(`${record.caseId}: skillSelected must be boolean`);
    }
    if (!Array.isArray(record.tools)) throw new TypeError(`${record.caseId}: tools must be an array`);
    for (const tool of record.tools) {
      if (!PUBLIC_TOOLS.has(tool)) throw new TypeError(`${record.caseId}: unknown BestPrice tool ${tool}`);
    }
    for (const key of ['argumentsAccurate', 'zeroResultRecovered', 'answerCompleted', 'evidencePreserved']) {
      if (record[key] !== undefined && typeof record[key] !== 'boolean') {
        throw new TypeError(`${record.caseId}: ${key} must be boolean when provided`);
      }
    }
    if (record.latencyMs !== undefined && (!Number.isFinite(record.latencyMs) || record.latencyMs < 0)) {
      throw new TypeError(`${record.caseId}: latencyMs must be a non-negative finite number`);
    }
  }
}

export function scoreSelectionRun(cases, records) {
  const caseMap = validateCases(cases);
  validateRecords(records, caseMap);

  const observations = records.map(record => ({ record, testCase: caseMap.get(record.caseId) }));
  const positive = observations.filter(({ testCase }) => testCase.expectedSkill);
  const negative = observations.filter(({ testCase }) => !testCase.expectedSkill);
  const exactRoutes = observations.filter(({ record, testCase }) =>
    sameSequence(record.tools, testCase.expectedTools),
  );
  const positiveExactRoutes = positive.filter(({ record, testCase }) =>
    sameSequence(record.tools, testCase.expectedTools),
  );
  const latencies = observations
    .map(({ record }) => record.latencyMs)
    .filter(value => Number.isFinite(value));

  const observedIds = new Set(records.map(record => record.caseId));
  const missingCaseIds = cases.map(testCase => testCase.id).filter(caseId => !observedIds.has(caseId));

  return {
    coverage: {
      observed: records.length,
      total: cases.length,
      rate: records.length / cases.length,
      missingCaseIds,
    },
    activation: {
      accuracy: ratio(
        observations.filter(({ record, testCase }) => record.skillSelected === testCase.expectedSkill).length,
        observations.length,
      ),
      recall: ratio(positive.filter(({ record }) => record.skillSelected).length, positive.length),
      falseActivationRate: ratio(
        negative.filter(({ record }) => record.skillSelected).length,
        negative.length,
      ),
    },
    routing: {
      exactSequenceAccuracy: ratio(exactRoutes.length, observations.length),
      positiveExactSequenceAccuracy: ratio(positiveExactRoutes.length, positive.length),
      negativeToolLeakRate: ratio(
        negative.filter(({ record }) => record.tools.length > 0).length,
        negative.length,
      ),
    },
    quality: {
      argumentsAccuracy: optionalBooleanMetric(observations, 'argumentsAccurate'),
      zeroResultRecovery: optionalBooleanMetric(observations, 'zeroResultRecovered'),
      answerCompletion: optionalBooleanMetric(observations, 'answerCompleted'),
      evidencePreservation: optionalBooleanMetric(observations, 'evidencePreserved'),
    },
    latency: {
      count: latencies.length,
      p50Ms: nearestRank(latencies, 50),
      p95Ms: nearestRank(latencies, 95),
      maxMs: latencies.length === 0 ? null : Math.max(...latencies),
    },
  };
}

export function assertCompleteSelectionRun(score) {
  if (score.coverage.missingCaseIds.length > 0) {
    throw new Error(
      `Selection run is incomplete: missing ${score.coverage.missingCaseIds.length} case(s): ${score.coverage.missingCaseIds.join(', ')}`,
    );
  }
  return score;
}
