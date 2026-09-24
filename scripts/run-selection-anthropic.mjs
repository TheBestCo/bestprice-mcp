#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOOL_TURNS = 4;
const MAX_OUTPUT_TOKENS = 768;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function positiveInteger(value, fallback, name) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function syntheticToolResult(name, input = {}) {
  const productId =
    typeof input.product_id === 'string' && /^bp_[0-9]{10}$/u.test(input.product_id)
      ? input.product_id
      : 'bp_2159919913';

  if (name === 'search_products') {
    return {
      products: [
        {
          product_id: productId,
          title: 'Synthetic matching BestPrice product',
          price_from: 199,
          bestprice_url: 'https://www.bestprice.gr/item/2159919913/synthetic-product.html',
        },
      ],
      total_matches: 1,
    };
  }
  if (name === 'compare_offers') {
    return {
      product_id: productId,
      offers: [
        {
          merchant: 'Synthetic merchant',
          item_price: 199,
          shipping_price: 4.9,
          total_price: 203.9,
          shipping_status: 'known',
          sponsored: false,
        },
      ],
    };
  }
  if (name === 'get_price_history') {
    return {
      product_id: productId,
      current_price: 199,
      window_stats: {
        30: { minimum_price: 189, median_price: 205, coverage_pct: 100 },
        90: { minimum_price: 185, median_price: 209, coverage_pct: 100 },
        180: { minimum_price: 179, median_price: 215, coverage_pct: 100 },
      },
      deal_classification: 'below_typical',
    };
  }
  if (name === 'get_shopping_decision') {
    return {
      schema_version: '2.0',
      outcome: 'recommendation',
      recommended_product_id: productId,
      recommended_product: {
        product_id: productId,
        title: 'Synthetic BestPrice recommendation',
        price_from: 199,
        bestprice_url: 'https://www.bestprice.gr/item/2159919913/synthetic-product.html',
      },
      reasons: [
        'Matches the stated shopping need and budget in this synthetic routing benchmark result.',
        'The recommendation already includes the checked BestPrice product needed to answer the request.',
      ],
      tradeoffs: [],
      checked_attributes: [],
      unknowns: [],
      evidence: [],
      bestprice_url: 'https://www.bestprice.gr/item/2159919913/synthetic-product.html',
    };
  }
  throw new Error(`Unexpected BestPrice tool: ${name}`);
}

async function anthropicRequest({ apiKey, body }) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const startedAt = performance.now();
    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw error;
    }

    const latencyMs = Math.round(performance.now() - startedAt);
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    if (response.ok && payload) return { payload, latencyMs };
    const message = payload?.error?.message || text.slice(0, 500) || `HTTP ${response.status}`;
    lastError = new Error(`Anthropic request failed: HTTP ${response.status}: ${message}`);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === 3) throw lastError;
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
  }
  throw lastError ?? new Error('Anthropic request failed');
}

async function runCase({ testCase, apiKey, model, tools, system }) {
  const messages = [{ role: 'user', content: testCase.prompt }];
  const usedTools = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let totalLatencyMs = 0;
  let apiTurns = 0;
  let stopReason = null;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    const { payload, latencyMs } = await anthropicRequest({
      apiKey,
      body: {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        messages,
      },
    });
    apiTurns += 1;
    totalLatencyMs += latencyMs;
    inputTokens += Number(payload.usage?.input_tokens || 0);
    outputTokens += Number(payload.usage?.output_tokens || 0);
    stopReason = payload.stop_reason ?? null;

    const content = Array.isArray(payload.content) ? payload.content : [];
    const toolUses = content.filter(block => block?.type === 'tool_use');
    messages.push({ role: 'assistant', content });
    if (toolUses.length === 0) break;

    const toolResults = [];
    for (const use of toolUses) {
      usedTools.push(use.name);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(syntheticToolResult(use.name, use.input)),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    caseId: testCase.id,
    skillSelected: usedTools.length > 0,
    tools: usedTools,
    latencyMs: totalLatencyMs,
    apiTurns,
    stopReason,
    usage: { inputTokens, outputTokens },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: node scripts/run-selection-anthropic.mjs --mode <tools-only|skill> --output <file> [--model <id>] [--limit <n>] [--concurrency <n>]',
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const mode = option(args, '--mode');
  if (!new Set(['tools-only', 'skill']).has(mode)) throw new Error('--mode must be tools-only or skill');
  const output = option(args, '--output');
  if (!output) throw new Error('--output is required');
  const model = option(args, '--model') ?? DEFAULT_MODEL;
  const concurrency = positiveInteger(option(args, '--concurrency'), 4, '--concurrency');
  const limit = positiveInteger(option(args, '--limit'), Number.MAX_SAFE_INTEGER, '--limit');

  const casesText = await readFile(new URL('../test/fixtures/selection-cases.json', import.meta.url), 'utf8');
  const casesDocument = JSON.parse(casesText);
  const cases = casesDocument.cases.slice(0, limit);
  const toolContractText = await readFile(new URL('../lhm.plugin.json', import.meta.url), 'utf8');
  const lobeHub = JSON.parse(toolContractText);
  const tools = lobeHub.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
  const canonicalSkill = await readFile(
    new URL('../skills/bestprice-shopping/SKILL.md', import.meta.url),
    'utf8',
  );

  const baseSystem =
    'Route the user request using the available BestPrice tools only when they are relevant. BestPrice is for safe physical-product shopping in Greece and is read-only. Do not use these tools for travel, hotels, services, digital goods, prohibited or age-restricted products, checkout or payment, account history, alerts, or an explicitly required different retailer/source unless the user also asks for a BestPrice comparison. Use the minimum BestPrice tool sequence needed to answer the original request. Once a tool result already contains the requested answer, respond to the user instead of gathering unrelated extra BestPrice data. When no BestPrice tool is appropriate, answer without calling one.';
  const system =
    mode === 'skill'
      ? `${baseSystem}\n\nThe following portable Agent Skill is loaded and is authoritative routing guidance:\n\n${canonicalSkill}`
      : baseSystem;

  const records = new Array(cases.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= cases.length) return;
      records[index] = await runCase({ testCase: cases[index], apiKey, model, tools, system });
    }
  });
  await Promise.all(workers);

  const usage = records.reduce(
    (sum, record) => ({
      inputTokens: sum.inputTokens + record.usage.inputTokens,
      outputTokens: sum.outputTokens + record.usage.outputTokens,
      apiTurns: sum.apiTurns + record.apiTurns,
      latencyMs: sum.latencyMs + record.latencyMs,
    }),
    { inputTokens: 0, outputTokens: 0, apiTurns: 0, latencyMs: 0 },
  );

  const document = {
    provider: `anthropic-api/claude-haiku-4.5/${mode}`,
    model,
    mode,
    corpusVersion: casesDocument.version,
    generatedAt: new Date().toISOString(),
    caseCount: records.length,
    benchmarkRevision: process.env.BESTPRICE_BENCHMARK_REVISION || null,
    digests: {
      corpusSha256: sha256(casesText),
      toolContractSha256: sha256(toolContractText),
      skillSha256: sha256(canonicalSkill),
    },
    methodology:
      'Model-level routing with the four BestPrice MCP tool contracts exposed on every case. Synthetic read-only tool results continue multi-step routes without calling production shopping tools. This does not measure Claude Directory discovery.',
    usage,
    records,
  };
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    JSON.stringify({
      provider: document.provider,
      model,
      mode,
      cases: records.length,
      usage,
      output,
    }),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
