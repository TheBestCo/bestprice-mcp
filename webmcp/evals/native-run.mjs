/*
 * Native evaluation runner: real browser, real WebMCP registration, real agent.
 *
 * The demo driver simulates both halves (a deterministic planner and an
 * in-memory adapter). This runner simulates neither:
 *
 *   agent   — an operator-supplied command that receives the task prompt, the current
 *             page and the tool list the page actually registered, and answers with one
 *             tool call OR a terminal answer/refusal
 *   browser — an operator-supplied command that executes a call in a real browser through
 *             the browser's own WebMCP implementation
 *             (`document.modelContext.executeTool`), e.g.
 *             `node /Users/gp/www/bestprice.gr/tools/scripts/webmcp-native-runner.mjs`
 *
 * Neither half is inferred here. If either command is missing, the browser reports a
 * non-browser identity, or the agent does not answer with a call or a terminal, the run
 * refuses — it never falls back to a simulation, because a native record that was partly
 * inferred is exactly the evidence this project forbids. An infrastructure failure (the
 * browser could not be probed, the agent command failed) is recorded as `blocked`, not
 * dressed up as a model failure and not silently dropped.
 *
 * Grading is done by `journey.js`, on ONE transcript:
 *
 * - a case that requires an ordered chain of tools plus a final answer is graded as a
 *   journey, so a first-step-only trace is `blocked` — the defect round 4 found in the
 *   committed multi-001 evidence, where one `search_bestprice` call was labelled `passed`;
 * - navigation is a transition, not a verdict: it is recorded and the loop continues;
 * - a terminal (`answer`, `refusal` or `clarification`) is required for any pass.
 *
 * Usage:
 *   node webmcp/evals/native-run.mjs \
 *     --agent-command 'my-agent-cli --json' \
 *     --browser-command 'node /Users/gp/www/bestprice.gr/tools/scripts/webmcp-native-runner.mjs' \
 *     --agent-name 'Model Context Tool Inspector' --agent-model 'gpt-5.2' \
 *     [--language el] [--max-steps 8] [--cases home-001,multi-001] [--dry-run]
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
import { gradeJourney } from './journey.js';
import { browserFamily, cohortKey, releaseScope } from './release-policy.js';
import {
  canonicalJson,
  caseDigest,
  DEFAULT_ARTIFACT_ROOT,
  implementationFingerprint,
  NATIVE_EVIDENCE_LAYER,
  RUN_LANGUAGES,
  sha256,
} from './run-evidence.js';

const EVAL_DIR = fileURLToPath(new URL('./', import.meta.url));
const NATIVE_LEDGER_PATH = join(EVAL_DIR, 'runs.v2.json');
const CASES_PATH = join(EVAL_DIR, 'natural-language-cases.v2.json');
const DATASET_VERSION = '2.0.0';
const SHELL_TIMEOUT_MS = 180_000;
/* A journey budget, not a target: a case that needs more is `blocked` with that reason, and the
 * budget is reported in the artifact. Without a bound, a two-command loop can spin forever. */
const DEFAULT_MAX_STEPS = 8;

/* Accepts both `--flag value` and `--flag=value`: a command that contains spaces is only safely
 * quotable in the second form, and the usage above writes it that way. */
const parseArgs = argv => {
  const options = { dryRun: false, cases: null, language: 'el', maxSteps: DEFAULT_MAX_STEPS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!token.startsWith('--')) throw new Error(`unexpected argument ${token}`);
    const separator = token.indexOf('=');
    const name = separator === -1 ? token.slice(2) : token.slice(2, separator);
    const inline = separator === -1 ? undefined : token.slice(separator + 1);
    const key = name.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    options[key] = inline ?? argv[++index];
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

/* Judging is deliberately narrow and mechanical, and it lives in `journey.js` so every layer grades
 * the same way. Nothing here introduces a second opinion: the runner only collects the transcript. */

/** The case's required result properties that no successful step returned. */
const requiredPropertyGaps = (definition, steps) => {
  const missing = [];
  for (const [tool, properties] of Object.entries(definition.required_result_properties ?? {})) {
    const step = steps.find(entry => entry.tool === tool && entry.result && entry.error === null);
    if (!step) {
      missing.push(`${tool} ran and returned a result`);
      continue;
    }
    for (const property of properties) {
      if (!(property in step.result)) missing.push(`${tool}.${property}`);
    }
  }
  return missing;
};

/** The terminal an agent answer declares, or null when it declares none. */
const readAnswerTerminal = answer => {
  const terminal =
    answer?.terminal ?? (typeof answer?.answer === 'string' ? { type: 'answer', text: answer.answer } : null);
  if (!terminal || typeof terminal !== 'object') return null;
  const type = terminal.type ?? 'answer';
  const text = typeof terminal.text === 'string' ? terminal.text : '';
  if (!['answer', 'refusal', 'clarification'].includes(type) || text.trim() === '') return null;
  return { type, text: text.trim() };
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
  if (!RUN_LANGUAGES.includes(options.language))
    throw new Error(
      `--language must be one of ${RUN_LANGUAGES.join(', ')}: a run in one language is not evidence about another`,
    );
  const maxSteps = Number.parseInt(options.maxSteps, 10);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('--max-steps must be a positive integer');

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
    let pageUrl = resolveUrl(definition);
    let browserProbe = null;
    let blockedReason = null;
    try {
      browserProbe = await runCommand(options.browserCommand, { url: pageUrl, calls: [] });
    } catch (error) {
      /* An infrastructure failure is not a model verdict: record it as `blocked` with the reason,
       * so a broken harness is never reported as a shopper-facing failure (or as a pass). */
      blockedReason = `the browser could not be probed: ${error.message}`;
    }
    const registeredTools = Array.isArray(browserProbe?.tools) ? browserProbe.tools : [];
    if (
      !blockedReason &&
      (!browserProbe?.ok || registeredTools.some(tool => typeof tool !== 'object' || !tool.inputSchema))
    ) {
      blockedReason = 'the browser did not provide actual registered tool descriptors';
    }
    if (!blockedReason && browserProbe?.persistentSession !== true) {
      blockedReason =
        'this browser adapter does not preserve a session across journey steps; native release evidence is unavailable';
    }

    /* 2. The agent drives the task: one call per turn until it answers, refuses or asks. Each turn
     * gets the task once, the current page, the real tool list and the transcript so far. */
    const steps = [];
    let terminal = null;
    let agentAnswer = null;
    if (!blockedReason) {
      for (let step = 1; step <= maxSteps; step += 1) {
        try {
          agentAnswer = await runCommand(options.agentCommand, {
            caseId: definition.id,
            step,
            language: options.language,
            prompt: options.language === 'en' ? definition.prompt_en : definition.prompt_el,
            url: pageUrl,
            tools: registeredTools,
            transcript: steps.map(entry => ({
              step: entry.step,
              tool: entry.tool,
              arguments: entry.arguments,
              result: entry.result,
            })),
          });
        } catch (error) {
          blockedReason = `the agent command failed at step ${step}: ${error.message}`;
          break;
        }
        if (typeof agentAnswer?.tool === 'undefined') {
          blockedReason = 'the agent command did not answer with {"tool": …, "arguments": …} or a terminal';
          break;
        }

        terminal = readAnswerTerminal(agentAnswer);
        if (!agentAnswer.tool) {
          /* No tool this turn: the agent ended the task, which is where the terminal comes from. */
          if (!terminal) {
            blockedReason = 'the agent ended the task without a terminal answer, refusal or clarification';
          }
          break;
        }

        let browserRun;
        try {
          browserRun = await runCommand(options.browserCommand, {
            url: pageUrl,
            calls: [{ tool: agentAnswer.tool, arguments: agentAnswer.arguments || {} }],
          });
        } catch (error) {
          blockedReason = `the browser could not run ${agentAnswer.tool}: ${error.message}`;
          break;
        }
        if (!browserRun?.ok) {
          blockedReason = `the browser could not run ${agentAnswer.tool}: ${browserRun?.error ?? 'no reason given'}`;
          break;
        }
        const execution = (browserRun.results || [])[0] || {};
        steps.push({
          step,
          pageUrl,
          tool: agentAnswer.tool,
          arguments: agentAnswer.arguments || {},
          result: execution.payload ?? null,
          navigatedTo: execution.navigated ? execution.url : null,
          error: execution.error ?? null,
        });
        /* A navigation is a transition: the loop continues against the destination the browser
         * reports, and the destination is recorded on the step. */
        if (execution.navigated && typeof execution.url === 'string' && execution.url !== '') {
          pageUrl = execution.url;
        }
        if (terminal) break;
      }
    }
    if (!terminal && !blockedReason) {
      blockedReason = `the journey did not finish within ${maxSteps} steps`;
    }

    /* 3. One transcript, one verdict — from the same grader every other layer uses. The case's
     * required result properties are checked here, on the transcript, because a journey that ran the
     * right tools and returned nothing usable did not answer the shopper. */
    const missingProperties = requiredPropertyGaps(definition, steps);
    const graded = blockedReason
      ? { outcome: 'blocked', reason: blockedReason, sequence: null, complete: false, terminal: null }
      : gradeJourney(definition, { steps, terminal });
    const verdict =
      graded.outcome === 'passed' && missingProperties.length > 0
        ? {
            ...graded,
            outcome: 'failed',
            complete: false,
            reason: `the result is missing ${missingProperties.join(', ')}`,
          }
        : graded;

    /* A refusal never opened a browser page, so the browser identity comes from the probe the run
     * always makes first. */
    const browserIdentity = browserProbe?.browser
      ? `${browserProbe.browser} ${browserProbe.browserVersion ?? '0'}`
      : 'Chromium 0';

    const date = startedAt.slice(0, 10);
    const runId = `run-${date}-${definition.id}-${sha256(`${revision}:${startedAt}:${definition.id}`).slice(0, 8)}`;
    const cohort = cohortKey(releaseScope({ revision, fingerprint, datasetVersion: DATASET_VERSION }), {
      language: options.language,
      model: options.agentModel,
      browser: browserFamily(browserIdentity),
    });
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
          language: options.language,
          implementationRevision: revision,
          implementationFingerprint: fingerprint,
          caseDigest: caseDigest(caseDefinition),
          startedAt,
          date,
          outcome: verdict.outcome,
          prompt: options.language === 'en' ? definition.prompt_en : definition.prompt_el,
          /* The whole transcript, not the first call: a journey verdict has to be reproducible from
           * the artifact, including the steps that were not taken. */
          steps,
          terminal: verdict.terminal ?? terminal,
          expectedTools: definition.expected_tools ?? [],
          sequenceMode: definition.sequence_mode ?? null,
          sequence: verdict.sequence ?? null,
          maxSteps,
          registeredTools,
          pageUrl: resolveUrl(definition),
          reason: verdict.reason,
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
      language: options.language,
      cohort,
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
      `${verdict.outcome.toUpperCase().padEnd(7)} ${definition.id}  ${steps.map(entry => entry.tool).join(' → ') || '(no tool)'}  ${verdict.reason}`,
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
