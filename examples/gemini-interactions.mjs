#!/usr/bin/env node
/**
 * Google Gemini Interactions API Demonstration & Verification Script for BestPrice MCP.
 *
 * Demonstrates remote MCP registration and invocation over Streamable HTTP with
 * the official Google Gen AI Interactions API (Deep Research agent).
 *
 * Usage:
 *   node examples/gemini-interactions.mjs [--verify-envelope] ["Optional custom shopping prompt"]
 */

import { argv, env, exitCode } from 'node:process';

const DEFAULT_PROMPT =
  'Βρες τιμές για Sony WH-1000XM5 στην Ελλάδα και σύγκρινε διαθέσιμες προσφορές και ιστορικό τιμής.';

export function buildInteractionsPayload(input = DEFAULT_PROMPT) {
  return {
    agent: 'deep-research-preview-04-2026',
    input,
    background: true,
    store: true,
    tools: [
      {
        type: 'mcp_server',
        name: 'bestprice',
        url: 'https://mcp.bestprice.gr/mcp',
        allowed_tools: [
          {
            mode: 'auto',
            tools: ['search_products', 'compare_offers', 'get_price_history'],
          },
        ],
      },
    ],
  };
}

export function validatePayloadEnvelope(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a non-null object');
  }
  if (typeof payload.input !== 'string' || payload.input.length === 0) {
    throw new Error('Payload input must be a non-empty string');
  }
  const tool = payload.tools?.[0];
  if (!tool || tool.type !== 'mcp_server' || tool.url !== 'https://mcp.bestprice.gr/mcp') {
    throw new Error('Tools must declare remote mcp_server pointing to https://mcp.bestprice.gr/mcp');
  }
  const allowed = tool.allowed_tools?.[0]?.tools;
  const expected = ['search_products', 'compare_offers', 'get_price_history'];
  if (!Array.isArray(allowed) || allowed.length !== expected.length || !expected.every(t => allowed.includes(t))) {
    throw new Error(`Allowed tools must match exactly [${expected.join(', ')}]`);
  }
  return true;
}

async function run() {
  const args = argv.slice(2);
  const verifyOnly = args.includes('--verify-envelope');
  const userPrompt = args.find(arg => !arg.startsWith('--')) || DEFAULT_PROMPT;

  const payload = buildInteractionsPayload(userPrompt);
  validatePayloadEnvelope(payload);

  if (verifyOnly) {
    console.log('✓ Google Gemini Interactions API payload envelope validated successfully:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('Notice: GEMINI_API_KEY is not set in environment.');
    console.log('Offline envelope verification passed.');
    console.log('Target endpoint: https://mcp.bestprice.gr/mcp');
    console.log('Tools allowed: search_products, compare_offers, get_price_history');
    console.log('To run live against Gemini, set GEMINI_API_KEY and re-run.');
    return;
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  console.log(`Submitting prompt to Gemini Interactions API: "${userPrompt}"`);

  try {
    const started = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await started.json();
    if (!started.ok || !data?.id) {
      console.error(`Gemini request failed (${started.status}):`, data?.error?.message || data);
      exitCode = 1;
      return;
    }

    console.log(`Interaction accepted. ID: ${data.id}`);
  } catch (err) {
    console.error('Network or API error communicating with Gemini:', err.message);
    exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
