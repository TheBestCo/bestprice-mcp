import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertApprovedPlan,
  assertVersionDecision,
  DEPRECATION_MESSAGE,
  DEPRECATION_STATUS,
  execute,
  formatStatusInvocation,
  planDeprecations,
  RegistryPlanError,
  SERVER_NAME,
  VERSIONS_URL,
} from '../scripts/registry-deprecate-plan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CURRENT_ACTIVE = [
  ['1.2.0', 'BestPrice Shopping'],
  ['1.3.0', 'BestPrice Shopping'],
  ['1.4.0', 'BestPrice Shopping'],
  ['1.5.0', 'BestPrice Shopping'],
  ['1.5.1', 'BestPrice Shopping'],
  ['1.6.0', 'BestPrice Shopping'],
  ['1.6.1', 'BestPrice Shopping'],
  ['1.8.0', 'BestPrice Shopping'],
  ['1.8.1', 'BestPrice Shopping'],
  ['1.8.3', 'BestPrice'],
  ['1.8.4', 'BestPrice'],
  ['1.8.5', 'BestPrice'],
];

function entry(
  version,
  { isLatest = false, status = 'active', title = 'BestPrice Shopping', name = SERVER_NAME } = {},
) {
  return {
    server: { name, version, title },
    _meta: { 'io.modelcontextprotocol.registry/official': { status, isLatest } },
  };
}

function payload(records, metadata = { count: records.length }) {
  return { servers: records, metadata };
}

function currentCatalog() {
  return payload([
    ...CURRENT_ACTIVE.map(([version, title]) => entry(version, { title })),
    entry('1.9.0', { title: 'BestPrice', isLatest: true }),
    entry('1.1.0', { status: 'deprecated', title: 'BestPrice Shopping' }),
  ]);
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('the default plan is every active version except the one marked latest', () => {
  const plan = planDeprecations(currentCatalog(), '');
  assert.equal(plan.latest.version, '1.9.0');
  assert.equal(plan.latest.title, 'BestPrice');
  assert.deepEqual(
    plan.deprecate.map(record => record.version),
    CURRENT_ACTIVE.map(([version]) => version),
  );
  assert.equal(
    plan.deprecate.some(record => record.version === '1.9.0'),
    false,
  );
  assert.equal(plan.skip.length, 0);
  assert.equal(plan.message, DEPRECATION_MESSAGE);
  assert.equal(plan.source, 'active-except-latest');
});

test('an explicit list is used as given and still cannot name the latest version', () => {
  const plan = planDeprecations(currentCatalog(), '1.8.5, 1.2.0\n1.4.0');
  assert.deepEqual(
    plan.deprecate.map(record => record.version),
    ['1.2.0', '1.4.0', '1.8.5'],
  );
  assert.equal(plan.source, 'explicit');
  assert.throws(
    () => planDeprecations(currentCatalog(), '1.8.5, 1.9.0'),
    error =>
      error instanceof RegistryPlanError && /isLatest/.test(error.message) && /1\.9\.0/.test(error.message),
  );
});

test('an already deprecated explicit version is skipped and a hidden version is refused', () => {
  const catalog = payload([
    entry('1.2.0'),
    entry('1.1.0', { status: 'deprecated' }),
    entry('1.0.0', { status: 'deleted' }),
    entry('1.9.0', { isLatest: true, title: 'BestPrice' }),
  ]);
  const plan = planDeprecations(catalog, '1.1.0, 1.2.0');
  assert.deepEqual(
    plan.deprecate.map(record => record.version),
    ['1.2.0'],
  );
  assert.deepEqual(
    plan.skip.map(record => record.version),
    ['1.1.0'],
  );
  assert.throws(() => planDeprecations(catalog, '1.0.0, 1.2.0'), RegistryPlanError);
  assert.throws(() => planDeprecations(catalog, '--all-versions'), RegistryPlanError);
  assert.throws(() => planDeprecations(catalog, '1.2'), RegistryPlanError);
  assert.throws(() => planDeprecations(catalog, '1.2.0, 1.2.0'), RegistryPlanError);
  assert.throws(() => planDeprecations(catalog, '9.9.9'), RegistryPlanError);
});

test('incomplete, inconsistent, or latest-less registry payloads are refused', () => {
  const records = [entry('1.2.0'), entry('1.9.0', { isLatest: true, title: 'BestPrice' })];
  assert.throws(
    () => planDeprecations(payload(records, { count: 2, nextCursor: 'more' }), ''),
    RegistryPlanError,
  );
  assert.throws(() => planDeprecations(payload(records, { count: 1 }), ''), RegistryPlanError);
  assert.throws(() => planDeprecations(payload([entry('1.2.0'), entry('1.3.0')]), ''), RegistryPlanError);
  assert.throws(
    () =>
      planDeprecations(
        payload([entry('1.2.0', { isLatest: true }), entry('1.9.0', { isLatest: true, title: 'BestPrice' })]),
        '',
      ),
    RegistryPlanError,
  );
  assert.throws(
    () =>
      planDeprecations(
        payload([entry('1.9.0', { isLatest: true, status: 'deprecated', title: 'BestPrice' })]),
        '',
      ),
    RegistryPlanError,
  );
  assert.throws(() => planDeprecations({ servers: 'nope' }, ''), RegistryPlanError);
  assert.throws(
    () =>
      planDeprecations(
        payload([entry('1.2.0', { name: 'io.other/mcp' }), entry('1.9.0', { isLatest: true })]),
        '',
      ),
    RegistryPlanError,
  );
  const missingFlag = entry('1.2.0');
  delete missingFlag._meta['io.modelcontextprotocol.registry/official'].isLatest;
  assert.throws(
    () => planDeprecations(payload([missingFlag, entry('1.9.0', { isLatest: true })]), ''),
    RegistryPlanError,
  );
});

test('an approved plan is refused when the live latest version moved', () => {
  const catalog = currentCatalog();
  const approved = assertApprovedPlan(catalog, '1.2.0,1.8.5', '1.9.0');
  assert.deepEqual(
    approved.deprecate.map(record => record.version),
    ['1.2.0', '1.8.5'],
  );
  const moved = payload([
    ...CURRENT_ACTIVE.map(([version, title]) => entry(version, { title })),
    entry('1.9.0', { title: 'BestPrice' }),
    entry('1.10.0', { title: 'BestPrice', isLatest: true }),
  ]);
  assert.throws(() => assertApprovedPlan(moved, '1.2.0,1.8.5', '1.9.0'), RegistryPlanError);
  assert.throws(() => assertApprovedPlan(catalog, '1.9.0', '1.9.0'), RegistryPlanError);
  assert.throws(() => assertApprovedPlan(catalog, '', '1.9.0'), RegistryPlanError);
});

test('status text names one version and the fixed deprecation message', () => {
  const invocation = formatStatusInvocation('1.8.5');
  assert.equal(
    invocation,
    [
      './mcp-publisher',
      "'status'",
      "'--status'",
      `'${DEPRECATION_STATUS}'`,
      "'--message'",
      `'${DEPRECATION_MESSAGE}'`,
      `'${SERVER_NAME}'`,
      "'1.8.5'",
    ].join(' '),
  );
  assert.equal(DEPRECATION_STATUS, 'deprecated');
  assert.doesNotMatch(invocation, /all-versions|deleted/u);
  assert.throws(() => formatStatusInvocation('latest'), RegistryPlanError);
  assert.throws(() => formatStatusInvocation('--all-versions'), RegistryPlanError);
});

test('commands read the registry and write only the versions that would change', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bp-registry-plan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'output');
  const summary = path.join(directory, 'summary');
  const urls = [];
  const logs = [];
  const original = console.log;
  console.log = line => logs.push(line);
  t.after(() => {
    console.log = original;
  });
  const fetchImpl = async url => {
    urls.push(String(url));
    return jsonResponse(currentCatalog());
  };

  await execute(
    'plan',
    {
      REQUESTED_VERSIONS: '',
      DRY_RUN: 'true',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
    fetchImpl,
  );

  assert.deepEqual(urls, [VERSIONS_URL]);
  assert.equal(
    await readFile(output, 'utf8'),
    `versions=${CURRENT_ACTIVE.map(([version]) => version).join(',')}\nlatest=1.9.0\n`,
  );
  const summaryText = await readFile(summary, 'utf8');
  assert.match(summaryText, /Dry run: yes/u);
  assert.match(summaryText, /Latest left active: 1\.9\.0/u);
  assert.doesNotMatch(summaryText, /1\.9\.0 {2}BestPrice {2}active/u);
  assert.match(logs.join('\n'), /Would deprecate 12 version\(s\)/u);

  logs.length = 0;
  await execute('message', {}, fetchImpl);
  assert.deepEqual(logs, [DEPRECATION_MESSAGE]);
  assert.equal(urls.length, 1);
});

test('the last check before a status call refuses whatever is now latest', async () => {
  const fetchImpl = async url => {
    const target = String(url);
    if (target.endsWith('/latest') || target.endsWith('/1.9.0')) {
      return jsonResponse(entry('1.9.0', { isLatest: true, title: 'BestPrice' }));
    }
    if (target.endsWith('/1.8.5')) {
      return jsonResponse(entry('1.8.5', { title: 'BestPrice' }));
    }
    if (target.endsWith('/1.1.0')) {
      return jsonResponse(entry('1.1.0', { status: 'deprecated' }));
    }
    throw new Error('secret-registry-body');
  };

  assert.equal(await assertVersionDecision('1.8.5', fetchImpl, '1.9.0'), 'deprecate');
  assert.equal(await assertVersionDecision('1.1.0', fetchImpl, '1.9.0'), 'skip');
  await assert.rejects(assertVersionDecision('1.9.0', fetchImpl, '1.9.0'), RegistryPlanError);
  await assert.rejects(
    assertVersionDecision(
      '1.8.5',
      async () => {
        throw new Error('https://user:secret@registry.example/private');
      },
      '1.9.0',
    ),
    error => error instanceof RegistryPlanError && !/secret/.test(error.message),
  );
});

test('the deprecation workflow is manual and cannot publish or blanket-update versions', async () => {
  const workflow = await readFile(path.join(ROOT, '.github/workflows/deprecate-mcp-registry.yml'), 'utf8');
  const publish = await readFile(path.join(ROOT, '.github/workflows/publish-mcp-registry.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s*(push|pull_request|schedule|workflow_call):/u);
  assert.match(workflow, /dry_run:[\s\S]*default:\s*true/u);
  assert.match(workflow, /inputs\.dry_run == false/u);
  assert.match(workflow, /environment: mcp-registry/u);
  assert.match(workflow, /MCP_PUBLISHER_VERSION: v1\.8\.1/u);
  assert.match(
    workflow,
    /login dns \\\n\s+--domain bestprice\.gr \\\n\s+--private-key "\$MCP_REGISTRY_PRIVATE_KEY"/u,
  );
  assert.match(workflow, /node scripts\/registry-deprecate-plan\.mjs plan/u);
  assert.match(workflow, /node scripts\/registry-deprecate-plan\.mjs assert-version/u);
  const statusCall = workflow.slice(workflow.indexOf('./mcp-publisher status'));
  assert.match(statusCall, /mcp-publisher status \\\n\s+--status deprecated \\\n/u);
  assert.match(statusCall, /--message "\$message" \\\n\s+gr\.bestprice\/mcp \\\n\s+"\$version"/u);
  assert.equal((workflow.match(/--status deprecated/gu) ?? []).length, 1);
  assert.doesNotMatch(workflow, /all-versions|deleted|mcp-publisher publish/u);
  assert.match(publish, /mcp-publisher publish server\.json/u);
  assert.doesNotMatch(publish, /mcp-publisher status|deprecated/u);
});
