import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../lhm.plugin.json');
const reviewed = read('./fixtures/public-tool-inputs.json');

test('LobeHub inputs match the captured public gateway contract, including nested defaults', () => {
  assert.match(reviewed.gateway_revision, /^[0-9a-f]{40}$/u);
  assert.deepEqual(
    manifest.tools.map(({ name, inputSchema }) => ({ name, inputSchema })),
    reviewed.tools,
  );
  const decision = manifest.tools.find(t => t.name === 'get_shopping_decision').inputSchema;
  assert.deepEqual(decision.anyOf[0].required, ['message']);
  assert.equal(decision.anyOf[0].properties.history, undefined);
  assert.equal(decision.anyOf[0].additionalProperties, false);
  assert.deepEqual(decision.anyOf[1].properties, {});
  assert.equal(
    manifest.tools.find(t => t.name === 'search_products').inputSchema.properties.query.maxLength,
    400,
  );
});
