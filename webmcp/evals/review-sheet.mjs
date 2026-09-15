/*
 * A worksheet for the independent task review — never a review.
 *
 * releaseReady needs every scored pass or refusal reviewed by an identified person other than the
 * actor, bound to the exact transcript by `reviewDigest`. Doing that from raw artifacts is slow
 * enough that it does not happen. This writes, for the runs of one ledger that need a review:
 *
 * - `<out>/reviews.template.json`, keyed by run id, with the digest filled in and every judgement
 *   left null. A null is not an approval: qualifyTask refuses anything but explicit `true`, a named
 *   reviewer and a written rationale.
 * - `<out>/reviews.md`, one readable section per run: the task, the case's criteria and
 *   prohibitions, every call with its arguments and a bounded view of its result, the terminal,
 *   and the served build.
 *
 *   node webmcp/evals/review-sheet.mjs --runs=webmcp/evals/runs.v3.json --out=/tmp/review
 *   # a reviewer fills the template, then:
 *   node webmcp/evals/run-evidence.js --strict --task-reviews=/tmp/review/reviews.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gradeJourney, readTerminal } from './journey.js';
import { DEFAULT_ARTIFACT_ROOT, resolveEvidencePath } from './run-evidence.js';
import { reviewDigest } from './task-review.js';

const RESULT_CHARS = 1200;

const bounded = value => {
  const text = JSON.stringify(value ?? null, null, 2);
  return text.length > RESULT_CHARS
    ? `${text.slice(0, RESULT_CHARS)}\n… (${text.length - RESULT_CHARS} more characters in the artifact)`
    : text;
};

export function buildReviewSheet(
  ledger,
  dataset,
  { artifactRoot = DEFAULT_ARTIFACT_ROOT, readArtifact } = {},
) {
  const definitions = new Map(dataset.cases.map(item => [item.id, item]));
  const load =
    readArtifact ?? (path => JSON.parse(readFileSync(resolveEvidencePath(artifactRoot, path), 'utf8')));
  const template = {};
  const sections = [];
  for (const run of ledger.runs ?? []) {
    const definition = definitions.get(run.caseId);
    if (!definition) continue;
    const execution = load(run.evidence).executions?.find(entry => entry.runId === run.runId);
    if (!execution) continue;
    const graded = gradeJourney(definition, execution);
    if (!['passed', 'refused'].includes(graded.outcome)) continue;
    template[run.runId] = {
      digest: reviewDigest(definition, execution),
      reviewer: null,
      taskSatisfied: null,
      grounded: null,
      ...(graded.outcome === 'refused' ? { refusalReasonCorrect: null } : {}),
      rationale: null,
    };
    const terminal = readTerminal(execution);
    sections.push(
      [
        `## ${run.runId}`,
        '',
        `**Case** ${definition.id} (${definition.group}) · **structural outcome** ${graded.outcome} · **served build** ${execution.servedImplementation?.digest?.slice(0, 12) ?? 'none'}`,
        '',
        `**Task (${execution.language ?? run.language ?? 'el'})** ${execution.prompt}`,
        '',
        `**Pass criterion** ${definition.deterministic_criteria}`,
        '',
        `**Prohibited** ${(definition.prohibited_behavior ?? []).join('; ') || '—'}`,
        '',
        ...(execution.steps ?? []).flatMap(step => [
          `### Step ${step.step}: \`${step.tool}\` ${JSON.stringify(step.arguments ?? {})}`,
          step.transition && step.transition.kind !== 'none'
            ? `Transition: ${step.transition.kind} → ${step.transition.toUrl}`
            : '',
          '```json',
          bounded(step.result ?? { payloadStatus: step.payloadStatus, error: step.error }),
          '```',
        ]),
        `**Terminal (${terminal?.type ?? 'none'})**`,
        '',
        terminal?.text ?? '—',
        '',
      ]
        .filter(line => line !== '')
        .join('\n\n'),
    );
  }
  return {
    template,
    markdown: `# Independent task review\n\n${sections.length} runs need a review.\n\n${sections.join('\n\n---\n\n')}\n`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/u, '').split('=')));
  const runsPath = args.runs ?? fileURLToPath(new URL('./runs.v3.json', import.meta.url));
  const ledger = JSON.parse(readFileSync(runsPath, 'utf8'));
  const dataset = JSON.parse(
    readFileSync(args.cases ?? fileURLToPath(new URL(`./${ledger.casesRef}`, import.meta.url)), 'utf8'),
  );
  if (!args.out) throw new Error('--out=<directory> is required');
  const { template, markdown } = buildReviewSheet(ledger, dataset);
  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'reviews.template.json'), `${JSON.stringify(template, null, 2)}\n`);
  writeFileSync(join(args.out, 'reviews.md'), markdown);
  console.log(`${Object.keys(template).length} runs need a review → ${args.out}`);
}
