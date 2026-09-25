import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const data = JSON.parse(readFileSync(new URL('fixtures/selection-cases.json', import.meta.url), 'utf8'));
const cases = data.cases;
const tools = new Set(['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history']);

describe('cross-provider selection corpus', () => {
  it('is large, bilingual, unique, and mostly unbranded', () => {
    assert.ok(cases.length >= 180);
    assert.equal(new Set(cases.map(testCase => testCase.id)).size, cases.length);
    for (const language of ['el', 'en']) {
      assert.ok(cases.filter(testCase => testCase.language === language).length >= 90, language);
    }
    const positives = cases.filter(testCase => testCase.expectedSkill);
    const negatives = cases.filter(testCase => !testCase.expectedSkill);
    assert.ok(positives.length >= 140);
    assert.ok(negatives.length >= 40);
    const unbranded = positives.filter(testCase => !/bestprice/iu.test(testCase.prompt));
    assert.ok(unbranded.length / positives.length >= 0.9, 'at least 90% of positive cases must be unbranded');
  });

  it('covers every public tool route and keeps negatives tool-free', () => {
    const counts = Object.fromEntries([...tools].map(tool => [tool, 0]));
    for (const testCase of cases) {
      assert.ok(['direct', 'indirect', 'negative'].includes(testCase.kind), testCase.id);
      assert.ok(['el', 'en'].includes(testCase.language), testCase.id);
      assert.equal(typeof testCase.prompt, 'string', testCase.id);
      assert.ok(testCase.prompt.length >= 12, testCase.id);
      for (const tool of testCase.expectedTools) {
        assert.ok(tools.has(tool), `${testCase.id}: unknown tool ${tool}`);
        counts[tool] += 1;
      }
      if (!testCase.expectedSkill) assert.deepEqual(testCase.expectedTools, [], testCase.id);
    }
    for (const [tool, count] of Object.entries(counts)) assert.ok(count >= 10, `${tool}: ${count}`);
  });

  it('contains strong out-of-scope and explicit-other-source negatives', () => {
    const negatives = cases
      .filter(testCase => !testCase.expectedSkill)
      .map(testCase => testCase.prompt)
      .join('\n');
    for (const concept of [
      'flight',
      'πτήση',
      'hotel',
      'ξενοδοχείο',
      'plumber',
      'υδραυλικό',
      'Netflix',
      'e-book',
      'whiskey',
      'ουίσκι',
      'vape',
      'casino',
      'καζίνο',
      'Skroutz',
      'Amazon',
    ]) {
      assert.match(negatives, new RegExp(concept, 'iu'), concept);
    }
  });
});
