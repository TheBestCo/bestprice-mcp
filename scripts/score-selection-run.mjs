#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import { assertCompleteSelectionRun, scoreSelectionRun } from '../src/selection-score.js';

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function parseRun(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { provider: null, records: parsed };
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
      return { provider: parsed.provider ?? null, records: parsed.records };
    }
    throw new TypeError('JSON input must be an array or an object with a records array');
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }

  const records = text
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
  return { provider: null, records };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: node scripts/score-selection-run.mjs --input <run.json|run.jsonl> [--cases <cases.json>] [--provider <name>] [--strict]',
    );
    return;
  }

  const inputPath = option(args, '--input');
  if (!inputPath) throw new Error('--input is required');

  const casesPath = option(args, '--cases');
  const casesText = await readFile(
    casesPath ?? new URL('../test/fixtures/selection-cases.json', import.meta.url),
    'utf8',
  );
  const casesDocument = JSON.parse(casesText);
  const cases = Array.isArray(casesDocument) ? casesDocument : casesDocument.cases;
  const run = parseRun(await readFile(inputPath, 'utf8'));
  const score = scoreSelectionRun(cases, run.records);
  if (args.includes('--strict')) assertCompleteSelectionRun(score);

  console.log(
    JSON.stringify(
      {
        provider: option(args, '--provider') ?? run.provider,
        score,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
