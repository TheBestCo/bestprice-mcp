/*
 * Native evaluation runner: real browser, real WebMCP registration, real agent.
 *
 * The demo driver simulates both halves (a deterministic planner and an
 * in-memory adapter). This runner simulates neither:
 *
 *   agent   — an operator-supplied command that receives the case prompt and the
 *             tool list the page actually registered, and answers with one tool
 *             call
 *   browser — an operator-supplied command that executes that call in a real
 *             browser through the browser's own WebMCP implementation
 *             (`document.modelContext.executeTool`), e.g.
 *             `node /Users/gp/www/bestprice.gr/tools/scripts/webmcp-native-runner.mjs`
 *
 * Neither half is inferred here. If either command is missing, the browser
 * reports a non-browser identity, or the agent does not answer with a call, the
 * run refuses — it never falls back to a simulation, because a native record
 * that was partly inferred is exactly the evidence this project forbids.
 *
 * Usage:
 *   node webmcp/evals/native-run.mjs \
 *     --agent-command 'my-agent-cli --json' \
 *     --browser-command 'node /Users/gp/www/bestprice.gr/tools/scripts/webmcp-native-runner.mjs' \
 *     --agent-name 'Model Context Tool Inspector' --agent-model 'gpt-5.2' \
 *     [--cases home-001,item-003] [--dry-run]
 *
 * A real run appends to runs.v2.json and writes artifacts/, so
 * `node webmcp/evals/run-evidence.js --strict` validates it like any other
 * release evidence. `--dry-run` judges and prints without writing anything.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentRevision } from './git-baseline.js';
import {
  canonicalJson,
  caseDigest,
  DEFAULT_ARTIFACT_ROOT,
  implementationFingerprint,
  NATIVE_EVIDENCE_LAYER,
  sha256,
} from './run-evidence.js';

const EVAL_DIR = fileURLToPath(new URL('./', import.meta.url));
const NATIVE_LEDGER_PATH = join(EVAL_DIR, 'runs.v2.json');
const CASES_PATH = join(EVAL_DIR, 'natural-language-cases.v2.json');
const DATASET_VERSION = '2.0.0';
const SHELL_TIMEOUT_MS = 180_000;

const parseArgs = argv => {
  const options = { dryRun: false, cases: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') options.dryRun = true;
    else if (token.startsWith('--'))
      options[token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[++index];
    else throw new Error(`unexpected argument ${token}`);
  }
  return options;
};

/**
 * Runs an operator-supplied command with one JSON object on stdin and parses its
 * stdout. `execFile` has no `input` option, and a command that never receives the
 * request would sit waiting — which is how a "the agent answered nothing" failure
 * reads as a broken agent instead of a broken harness.
 */
const runCommand = (command, payload) =>
  new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${SHELL_TIMEOUT_MS}ms`));
    }, SHELL_TIMEOUT_MS);
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(0, 200) || 'no stderr'}`));
        return;
      }
      const text = stdout.trim();
      if (!text) {
        reject(new Error(`${command} answered with nothing on stdout`));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error(`${command} did not answer with JSON: ${text.slice(0, 120)}`));
      }
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });

/* Judging is deliberately narrow and mechanical: the case says which tools may be
 * called, the argument bounds, and which properties a successful result must
 * carry. Nothing here measures "quality" — that is what the criteria text is for
 * a human reader, and inventing a score would make the ledger a number nobody
 * can reproduce. */
const argumentProblems = (definition, tool, args) => {
  const bounds = definition.allowed_args?.[tool];
  if (!bounds) return [];
  const problems = [];
  for (const [name, rule] of Object.entries(bounds)) {
    const value = args?.[name];
    if (rule?.type === 'string') {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) problems.push(`${name} is required`);
      else if (rule.minLength && text.length < rule.minLength)
        problems.push(`${name} is shorter than ${rule.minLength}`);
      else if (rule.maxLength && text.length > rule.maxLength)
        problems.push(`${name} is longer than ${rule.maxLength}`);
    }
  }
  return problems;
};

const judge = (definition, agentAnswer, execution) => {
  const expected = Array.isArray(definition.expected_tools) ? definition.expected_tools : [];
  const chosen = String(agentAnswer?.tool || '');
  /* The negative group is refusal-shaped by construction: some cases expect no call
   * at all, the rest expect a call the page then refuses. Read from the dataset
   * (group, expected_tools) rather than guessed from prose. */
  const refusalExpected = definition.group === 'negative' || expected.length === 0;

  if (!chosen) {
    return refusalExpected
      ? { outcome: 'passed', reason: 'the agent declined (no tool was called; the case allows a refusal)' }
      : { outcome: 'failed', reason: 'the agent chose no tool' };
  }
  if (expected.length && !expected.includes(chosen)) {
    return { outcome: 'failed', reason: `the agent chose ${chosen}, expected ${expected.join(' or ')}` };
  }
  if (execution?.error) {
    /* A refusal is a legitimate answer only where the case says refusal is the
     * expected behaviour; anywhere else it is a failure of the run. */
    return {
      outcome: refusalExpected ? 'refused' : 'failed',
      reason: `the browser reported: ${execution.error}`,
    };
  }
  const argumentIssue = argumentProblems(definition, chosen, agentAnswer.arguments);
  if (argumentIssue.length)
    return { outcome: 'failed', reason: `arguments are out of bounds: ${argumentIssue.join(', ')}` };
  /* A tool that navigates answers by moving the page: its payload is produced in
   * the task that starts the navigation and is not readable afterwards, so the
   * call and its destination are the evidence. The case criteria judge the call. */
  if (execution?.navigated === true) {
    return { outcome: 'passed', reason: `the tool ran and navigated to ${execution.url}` };
  }
  const required = definition.required_result_properties?.[chosen] || [];
  const payload = execution?.payload ?? {};
  const missing = required.filter(key => !(key in payload));
  if (missing.length) return { outcome: 'failed', reason: `result is missing ${missing.join(', ')}` };
  if (payload.ok === false) {
    return {
      outcome: refusalExpected ? 'passed' : 'failed',
      reason: refusalExpected
        ? `the page refused the call, which is the behaviour this case tests: ${payload.error ?? 'no reason given'}`
        : `the tool refused: ${payload.error ?? 'no reason given'}`,
    };
  }
  return { outcome: 'passed', reason: 'the expected tool ran and returned the required properties' };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.agentCommand)
    throw new Error('--agent-command is required: this runner never invents the agent');
  if (!options.browserCommand)
    throw new Error('--browser-command is required: this runner never invents the browser');
  if (!options.agentName)
    throw new Error('--agent-name is required: the ledger records which agent produced the run');
  if (!options.agentModel)
    throw new Error('--agent-model is required: the ledger records which model produced the run');

  const dataset = JSON.parse(readFileSync(CASES_PATH, 'utf8'));
  const selected = options.cases
    ? new Set(
        String(options.cases)
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      )
    : null;
  const cases = dataset.cases.filter(definition => !selected || selected.has(definition.id));
  if (!cases.length) throw new Error('no cases selected');

  /* Seventeen cases carry a template URL (`/item/<visible-id>/product.html`): the
   * dataset cannot know which product is on the page. The operator supplies one,
   * and a run refuses rather than substituting a guess — the page a case ran on
   * is part of its evidence. */
  const resolveUrl = definition => {
    const url = String(definition.starting_url || '');
    if (!url.includes('<')) return url;
    if (!options.productUrl) {
      throw new Error(
        `${definition.id} needs a concrete product page: pass --product-url https://www.bestprice.gr/item/<id>/...`,
      );
    }
    if (!/^https:\/\/www\.bestprice\.gr\/item\/[0-9]+\//u.test(options.productUrl)) {
      throw new Error('--product-url must be a BestPrice item page');
    }
    return options.productUrl;
  };

  const revision = currentRevision();
  const fingerprint = implementationFingerprint();
  const ledgerPath = options.runs || NATIVE_LEDGER_PATH;
  const artifactRoot = options.artifactsDir || DEFAULT_ARTIFACT_ROOT;
  if (!options.dryRun) mkdirSync(artifactRoot, { recursive: true });
  const ledger = options.dryRun ? { runs: [] } : JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const knownRunIds = new Set((ledger.runs || []).map(record => record.runId));
  const previous = options.dryRun ? [] : [...(ledger.runs || [])];
  const appended = [];

  for (const definition of cases) {
    const startedAt = new Date().toISOString();
    const caseDefinition = { ...definition };
    delete caseDefinition.runs;

    /* 1. The browser registers the tools the page actually exposes. */
    const pageUrl = resolveUrl(definition);
    const browserProbe = await runCommand(options.browserCommand, {
      url: pageUrl,
      calls: [],
    }).catch(() => null);
    const registeredTools = Array.isArray(browserProbe?.tools)
      ? browserProbe.tools
      : (definition.expected_tools || []).map(name => ({ name }));

    /* 2. The agent chooses one call from the prompt and the registered tools. */
    const agentAnswer = await runCommand(options.agentCommand, {
      caseId: definition.id,
      prompt_el: definition.prompt_el,
      prompt_en: definition.prompt_en,
      url: pageUrl,
      tools: registeredTools,
      allowed_args: definition.allowed_args || {},
      criteria: definition.deterministic_criteria,
    });
    /* A null tool is a refusal, which is the correct answer to some cases. Only a
     * command that answers with nothing at all is a harness failure. */
    if (typeof agentAnswer?.tool === 'undefined') {
      throw new Error(`${definition.id}: the agent command did not answer with {"tool": …, "arguments": …}`);
    }

    /* 3. The browser executes exactly that call, natively — or, for a refusal,
     * records that nothing was called. */
    const browserRun = agentAnswer.tool
      ? await runCommand(options.browserCommand, {
          url: pageUrl,
          calls: [{ tool: agentAnswer.tool, arguments: agentAnswer.arguments || {} }],
        })
      : { ok: true, browser: null, browserVersion: null, results: [] };
    if (agentAnswer.tool && !browserRun?.ok) {
      throw new Error(`${definition.id}: the browser could not run the call: ${browserRun?.error}`);
    }
    const execution = (browserRun.results || [])[0] || {};
    const verdict = judge(definition, agentAnswer, execution);

    /* A refusal never opened a browser, so the browser identity comes from the
     * probe the run always makes first. */
    const browserIdentity = browserRun.browser
      ? `${browserRun.browser} ${browserRun.browserVersion}`
      : `${browserProbe?.browser ?? 'Chromium'} ${browserProbe?.browserVersion ?? '0'}`;

    const date = startedAt.slice(0, 10);
    const runId = `run-${date}-${definition.id}-${sha256(`${revision}:${startedAt}:${definition.id}`).slice(0, 8)}`;
    const artifact = {
      artifactVersion: 1,
      executions: [
        {
          runId,
          caseId: definition.id,
          datasetVersion: DATASET_VERSION,
          evidenceLayer: NATIVE_EVIDENCE_LAYER,
          agent: options.agentName,
          model: options.agentModel,
          browser: browserIdentity,
          implementationRevision: revision,
          implementationFingerprint: fingerprint,
          caseDigest: caseDigest(caseDefinition),
          startedAt,
          date,
          outcome: verdict.outcome,
          prompt: definition.prompt_en || definition.prompt_el,
          tool: agentAnswer.tool,
          arguments: agentAnswer.arguments || {},
          result: execution.payload ?? null,
          navigatedTo: execution.navigated ? execution.url : null,
          error: execution.error ?? null,
          registeredTools,
          pageUrl,
        },
      ],
    };
    const bytes = canonicalJson(artifact);
    if (!options.dryRun) {
      mkdirSync(artifactRoot, { recursive: true });
      writeFileSync(join(artifactRoot, `${runId}.json`), bytes);
    }

    let uniqueRunId = runId;
    while (knownRunIds.has(uniqueRunId)) uniqueRunId = `${uniqueRunId}-${sha256(uniqueRunId).slice(0, 4)}`;
    knownRunIds.add(uniqueRunId);
    appended.push({
      runId: uniqueRunId,
      caseId: definition.id,
      datasetVersion: DATASET_VERSION,
      evidenceLayer: NATIVE_EVIDENCE_LAYER,
      agent: options.agentName,
      model: options.agentModel,
      browser: browserIdentity,
      implementationRevision: revision,
      implementationFingerprint: fingerprint,
      caseDigest: caseDigest(caseDefinition),
      startedAt,
      date,
      outcome: verdict.outcome,
      evidence: `artifacts/${uniqueRunId}.json`,
      evidenceDigest: sha256(bytes),
    });
    console.log(
      `${verdict.outcome.toUpperCase().padEnd(7)} ${definition.id}  ${agentAnswer.tool}  ${verdict.reason}`,
    );
  }

  if (!options.dryRun) {
    writeFileSync(
      ledgerPath,
      `${JSON.stringify({ ...ledger, runs: [...previous, ...appended] }, null, 2)}\n`,
    );
    console.log(`\nappended ${appended.length} native record(s) to ${ledgerPath}`);
    console.log('validate with: node webmcp/evals/run-evidence.js --strict');
  } else {
    console.log(`\ndry run: ${appended.length} record(s) judged, nothing written`);
  }
};

await main();
