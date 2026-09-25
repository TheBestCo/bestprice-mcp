import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInteractionsPayload, validatePayloadEnvelope } from '../examples/gemini-interactions.mjs';

const EXPECTED_TOOLS = ['get_shopping_decision', 'search_products', 'compare_offers', 'get_price_history'];

describe('Gemini Interactions MCP envelope', () => {
  it('keeps the auto allowlist on all four public BestPrice tools', () => {
    const payload = buildInteractionsPayload('Recommend a laptop under €700 in Greece.');
    assert.equal(validatePayloadEnvelope(payload), true);
    assert.deepEqual(payload.tools[0].allowed_tools[0].tools, EXPECTED_TOOLS);
  });

  it('rejects an allowlist that silently drops one public tool', () => {
    const payload = buildInteractionsPayload();
    payload.tools[0].allowed_tools[0].tools = EXPECTED_TOOLS.slice(1);
    assert.throws(() => validatePayloadEnvelope(payload), /Allowed tools must match exactly/u);
  });
});
