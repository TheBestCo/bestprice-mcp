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
 * A real run appends to runs.v3.json (runs.v2.json with --dataset=v2) and writes artifacts/, so
 * `node webmcp/evals/run-evidence.js --strict` validates it like any other
 * release evidence. `--dry-run` judges and prints without writing anything.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserSession } from './browser-session.js';
import { currentRevision } from './git-baseline.js';
import { blockedNavigationAttempt, gradeJourney } from './journey.js';
import { appendToLedger } from './ledger-append.js';
import { adoptStartUrl, policyEvidence, servedReceipt, stepEvidence } from './native-evidence.js';
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
/* Dataset 3.0.0 is current (see dataset-v3.js); `--dataset=v2` still runs the frozen 2.0.0 cases
 * into their own ledger. A run's dataset version is read from the file, never assumed. */
const DATASETS = Object.freeze({
  v2: { cases: join(EVAL_DIR, 'natural-language-cases.v2.json'), ledger: join(EVAL_DIR, 'runs.v2.json') },
  v3: { cases: join(EVAL_DIR, 'natural-language-cases.v3.json'), ledger: join(EVAL_DIR, 'runs.v3.json') },
  /* 3.0.0 with two unanswerable case definitions corrected; see dataset-v4.js. 3.0.0 stays frozen
   * with its 2,961 runs, because a published definition is never rewritten. */
  v4: { cases: join(EVAL_DIR, 'natural-language-cases.v4.json'), ledger: join(EVAL_DIR, 'runs.v4.json') },
});
const SHELL_TIMEOUT_MS = 180_000;
/* A journey budget, not a target: a case that needs more is `blocked` with that reason, and the
 * budget is reported in the artifact. Without a bound, a two-command loop can spin forever. */
/* Eight was too few for the shape a case can legitimately need. «Show me all the specifications» on
 * a product with seven sections costs one overview call, one per section and a terminal — nine at
 * the floor — so product-004 exhausted the budget doing exactly what the case asks and was recorded
 * `blocked`, which is "we don't know" rather than a verdict. Measured 2026-09-16: at 12 it passes
 * 4 of 4, graded against the same criteria. Raising it does not flatter the numbers, because
 * blocked runs are excluded from the fraction while pass and fail both count — a bigger budget
 * turns unknowns into verdicts, in whichever direction the run earns. It is not licence to loop:
 * the actor no longer re-issues a call it already holds. */
const DEFAULT_MAX_STEPS = 12;

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
        reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(-600) || 'no stderr'}`));
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

  const selectedDataset = DATASETS[options.dataset ?? 'v4'];
  if (!selectedDataset) throw new Error(`--dataset must be one of ${Object.keys(DATASETS).join(', ')}`);
  const dataset = JSON.parse(readFileSync(selectedDataset.cases, 'utf8'));
  const DATASET_VERSION = dataset.datasetVersion;
  const selected = options.cases
    ? new Set(
        String(options.cases)
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      )
    : null;
  /* `--shard=2/4` runs every fourth case starting from the second, so parallel processes cover the
   * dataset once each and a collection fits between two deploys of the build it is measuring. */
  const shard = options.shard ? /^([1-9]\d*)\/([1-9]\d*)$/u.exec(String(options.shard)) : null;
  if (options.shard && (!shard || Number(shard[1]) > Number(shard[2]))) {
    throw new Error('--shard must be i/n with 1 <= i <= n');
  }
  const cases = dataset.cases
    .filter(definition => !selected || selected.has(definition.id))
    .filter((_, index) => !shard || index % Number(shard[2]) === Number(shard[1]) - 1);
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
  const ledgerPath = options.runs || selectedDataset.ledger;
  const artifactRoot = options.artifactsDir || DEFAULT_ARTIFACT_ROOT;
  if (!options.dryRun) mkdirSync(artifactRoot, { recursive: true });
  const knownRunIds = new Set(
    options.dryRun
      ? []
      : (JSON.parse(readFileSync(ledgerPath, 'utf8')).runs || []).map(record => record.runId),
  );
  const appended = [];

  for (const definition of cases) {
    let session = browserSession(options.browserCommand);
    const startedAt = new Date().toISOString();
    const caseDefinition = { ...definition };
    delete caseDefinition.runs;

    /* 1. The browser registers the tools the page actually exposes. */
    const requestedUrl = resolveUrl(definition);
    let pageUrl = requestedUrl;
    let documentId = null;
    let browserProbe = null;
    let blockedReason = null;
    /* A probe makes no call, so a failed one is safe to repeat once, in a fresh browser: a page that
     * took too long to register once is an infrastructure hiccup, not a verdict. Actions are never
     * retried. The artifact records how many probes it took. */
    let probeAttempts = 0;
    for (; probeAttempts < 2; ) {
      probeAttempts += 1;
      blockedReason = null;
      try {
        browserProbe = await session.request({ url: pageUrl, calls: [] });
        if (browserProbe?.ok) break;
      } catch (error) {
        /* An infrastructure failure is not a model verdict: record it as `blocked` with the reason,
         * so a broken harness is never reported as a shopper-facing failure (or as a pass). */
        browserProbe = null;
        blockedReason = `the browser could not be probed: ${error.message}`;
      }
      if (probeAttempts < 2) {
        await session.close();
        session = browserSession(options.browserCommand);
      }
    }
    let registeredTools = Array.isArray(browserProbe?.tools) ? browserProbe.tools : [];
    if (
      !blockedReason &&
      (!browserProbe?.ok || registeredTools.some(tool => typeof tool !== 'object' || !tool.inputSchema))
    ) {
      blockedReason = `the browser did not provide actual registered tool descriptors${
        typeof browserProbe?.error === 'string' ? `: ${browserProbe.error.slice(0, 200)}` : ''
      }`;
    }
    if (!blockedReason && browserProbe?.persistentSession !== true) {
      blockedReason =
        'this browser adapter does not preserve a session across journey steps; native release evidence is unavailable';
    }
    /* The browser may have landed on the canonical URL of the requested page. The run continues from
     * where the browser is — the peer refuses any other URL — as long as it is still that page. */
    if (!blockedReason) {
      const adopted = adoptStartUrl(requestedUrl, browserProbe.url);
      if (!adopted) blockedReason = 'the browser landed on a page other than the case start page';
      else pageUrl = adopted;
    }
    if (!blockedReason) {
      documentId = typeof browserProbe.documentId === 'string' ? browserProbe.documentId : null;
      if (!documentId) {
        blockedReason =
          'this browser adapter does not report document identity, so a reload cannot be told from a read';
      }
    }
    const startUrl = pageUrl;
    /* The release every later reply reports; a deploy that lands mid-journey makes the receipt
     * incomplete rather than silently describing half the run. */
    const releasesSeen = [];
    const browserPolicy = policyEvidence(browserProbe?.policy);

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
            /* The actor also learns when a call's page navigated away before it could answer, so a
             * lost result is not mistaken for an empty one. Grading data is never included. */
            transcript: steps.map(entry => ({
              step: entry.step,
              tool: entry.tool,
              arguments: entry.arguments,
              result: entry.result,
              payloadStatus: entry.payloadStatus,
              navigatedTo: entry.navigatedTo,
              error: entry.error,
            })),
          });
        } catch (error) {
          blockedReason = `the agent command failed at step ${step}: ${error.message}`;
          break;
        }
        terminal = readAnswerTerminal(agentAnswer);
        if (typeof agentAnswer?.tool === 'undefined' && !terminal) {
          blockedReason = 'the agent command did not answer with {"tool": …, "arguments": …} or a terminal';
          break;
        }

        if (!agentAnswer.tool) {
          /* No tool this turn: the agent ended the task, which is where the terminal comes from. */
          if (!terminal) {
            blockedReason = 'the agent ended the task without a terminal answer, refusal or clarification';
          }
          break;
        }

        let browserRun;
        try {
          browserRun = await session.request({
            url: pageUrl,
            documentId,
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
        if (browserRun.sessionId !== browserProbe.sessionId || !browserRun.persistentSession) {
          blockedReason = 'browser session identity changed during the journey';
          break;
        }
        registeredTools = Array.isArray(browserRun.tools) ? browserRun.tools : [];
        const evidence = stepEvidence((browserRun.results || [])[0]);
        /* One request carries one call, so an intervention the peer recorded outside the invocation
         * window still happened while this call was being served. */
        const requestPolicy = policyEvidence(browserRun.policy);
        steps.push({
          step,
          pageUrl,
          documentId,
          tool: agentAnswer.tool,
          arguments: agentAnswer.arguments || {},
          ...evidence,
          policy: [...evidence.policy, ...requestPolicy].slice(0, 8),
        });
        browserPolicy.push(...requestPolicy);
        releasesSeen.push(browserRun.served?.storefrontRelease ?? null);
        /* The next call runs against the page and document the browser reports now — after a
         * navigation, a same-URL reload or a same-document route change alike. */
        const nextUrl = adoptStartUrl(browserRun.url, browserRun.url);
        if (
          !nextUrl ||
          new URL(nextUrl).origin !== new URL(startUrl).origin ||
          typeof browserRun.documentId !== 'string'
        ) {
          blockedReason = 'the browser did not report its current page and document';
          break;
        }
        pageUrl = nextUrl;
        documentId = browserRun.documentId;
        if (terminal) break;
      }
    }
    if (!terminal && !blockedReason) {
      blockedReason = `the journey did not finish within ${maxSteps} steps`;
    }
    await session.close();

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
    let runId = `run-${date}-${definition.id}-${sha256(`${revision}:${startedAt}:${definition.id}`).slice(0, 8)}`;
    while (knownRunIds.has(runId)) runId = `${runId}-${sha256(runId).slice(0, 4)}`;
    knownRunIds.add(runId);
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
          probeAttempts,
          pageUrl: requestedUrl,
          startUrl,
          /* What the storefront served during this run. The release gate requires every counted run
           * to carry one complete receipt with one digest; see run-evidence.js. */
          servedImplementation: servedReceipt(browserProbe?.served, { releasesSeen }),
          browserHost: browserProbe?.host && typeof browserProbe.host === 'object' ? browserProbe.host : null,
          browserPolicy: browserPolicy.slice(0, 16),
          ...(steps.some(blockedNavigationAttempt)
            ? {
                safetyViolation: true,
                violationReason: 'a tool attempted a navigation the browser policy blocked',
              }
            : {}),
          reason: verdict.reason,
        },
      ],
    };
    const bytes = canonicalJson(artifact);
    if (options.printArtifacts) console.log(bytes);
    if (!options.dryRun) {
      mkdirSync(artifactRoot, { recursive: true });
      writeFileSync(join(artifactRoot, `${runId}.json`), bytes);
    }

    /* The id is fixed before the artifact is written (see above), so a record and the artifact it
     * cites can never disagree about it. */
    const uniqueRunId = runId;
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
    appendToLedger(ledgerPath, appended);
    console.log(`\nappended ${appended.length} native record(s) to ${ledgerPath}`);
    console.log('validate with: node webmcp/evals/run-evidence.js --strict');
  } else {
    console.log(`\ndry run: ${appended.length} record(s) judged, nothing written`);
  }
};

await main();
