/**
 * Plan which gr.bestprice/mcp versions to mark deprecated in the official MCP registry.
 *
 * This module only reads the public registry API and decides. It does not log in and it does
 * not change status. The manual deprecate-mcp-registry workflow is what calls mcp-publisher,
 * one explicit version at a time, after this plan refuses the version marked isLatest.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SERVER_NAME = 'gr.bestprice/mcp';
export const DEPRECATION_MESSAGE = 'Superseded by the latest version; see gr.bestprice/mcp latest.';
export const DEPRECATION_STATUS = 'deprecated';
export const VERSIONS_URL =
  'https://registry.modelcontextprotocol.io/v0.1/servers/gr.bestprice%2Fmcp/versions';

const OFFICIAL_META = 'io.modelcontextprotocol.registry/official';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const STATUSES = new Set(['active', 'deprecated', 'deleted']);

export class RegistryPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryPlanError';
  }
}

export function parseRequestedVersions(input) {
  const text = String(input ?? '').trim();
  if (text === '') return [];
  const versions = text.split(/[\s,]+/u).filter(Boolean);
  const seen = new Set();
  for (const version of versions) {
    if (!VERSION_PATTERN.test(version)) {
      throw new RegistryPlanError(
        `Refusing "${version}". Versions must be dotted numbers such as 1.8.5, named one at a time.`,
      );
    }
    if (seen.has(version)) {
      throw new RegistryPlanError(`Version ${version} is listed more than once.`);
    }
    seen.add(version);
  }
  return versions;
}

function readRecord(entry) {
  const server = entry?.server;
  const version = server?.version;
  if (server?.name !== SERVER_NAME) {
    throw new RegistryPlanError(
      `Registry response included "${server?.name ?? 'an unnamed server'}", not ${SERVER_NAME}.`,
    );
  }
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new RegistryPlanError('Registry returned a version that is not a dotted number.');
  }
  const meta = entry?._meta?.[OFFICIAL_META];
  if (!meta || typeof meta !== 'object') {
    throw new RegistryPlanError(`Version ${version} is missing official registry metadata.`);
  }
  if (typeof meta.isLatest !== 'boolean' || !STATUSES.has(meta.status)) {
    throw new RegistryPlanError(`Version ${version} is missing a boolean isLatest or a known status.`);
  }
  return {
    version,
    status: meta.status,
    isLatest: meta.isLatest,
    title: typeof server.title === 'string' ? server.title : '',
  };
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function readRegistryVersions(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.servers)) {
    throw new RegistryPlanError('Registry response did not include a servers array.');
  }
  if (payload.metadata?.nextCursor) {
    throw new RegistryPlanError(
      'Registry response was paginated. Refusing to deprecate from a partial version list.',
    );
  }
  if (typeof payload.metadata?.count === 'number' && payload.metadata.count !== payload.servers.length) {
    throw new RegistryPlanError('Registry page count did not match the servers array.');
  }

  const records = new Map();
  let latest = null;
  for (const entry of payload.servers) {
    const record = readRecord(entry);
    if (records.has(record.version)) {
      throw new RegistryPlanError(`Registry returned ${record.version} more than once.`);
    }
    records.set(record.version, record);
    if (record.isLatest) {
      if (latest) {
        throw new RegistryPlanError(
          `More than one version is marked latest (${latest.version} and ${record.version}).`,
        );
      }
      latest = record;
    }
  }
  if (!latest) {
    throw new RegistryPlanError('Registry response did not mark a latest version. Refusing to continue.');
  }
  if (latest.status !== 'active') {
    throw new RegistryPlanError(
      `Latest version ${latest.version} is ${latest.status}. ` +
        'Refusing to change other versions while it is not active.',
    );
  }
  return { records, latest };
}

function refuseLatest(record, latest) {
  if (record.isLatest || record.version === latest.version) {
    throw new RegistryPlanError(
      `Refusing to change ${record.version} because the registry marks it isLatest.`,
    );
  }
}

function classifyRequested(records, latest, requested) {
  const deprecate = [];
  const skip = [];
  for (const version of requested) {
    const record = records.get(version);
    if (!record) {
      throw new RegistryPlanError(`Version ${version} is not in the registry response.`);
    }
    refuseLatest(record, latest);
    if (record.status === 'deleted') {
      throw new RegistryPlanError(
        `Refusing to change ${version} because its registry status is ${record.status}.`,
      );
    }
    if (record.status === 'deprecated') {
      skip.push(record);
      continue;
    }
    if (record.status !== 'active') {
      throw new RegistryPlanError(`Version ${version} has unexpected status ${record.status}.`);
    }
    deprecate.push(record);
  }
  return { deprecate, skip };
}

export function planDeprecations(payload, requestedInput) {
  const { records, latest } = readRegistryVersions(payload);
  const requested = parseRequestedVersions(requestedInput);
  const selected =
    requested.length === 0
      ? {
          source: 'active-except-latest',
          deprecate: [...records.values()].filter(record => record.status === 'active' && !record.isLatest),
          skip: [],
        }
      : {
          source: 'explicit',
          ...classifyRequested(records, latest, requested),
        };

  const deprecate = [...selected.deprecate].sort((left, right) =>
    compareVersions(left.version, right.version),
  );
  const skip = [...selected.skip].sort((left, right) => compareVersions(left.version, right.version));
  if (deprecate.some(record => record.isLatest || record.version === latest.version)) {
    throw new RegistryPlanError('Refusing a plan that includes the latest version.');
  }

  return {
    server: SERVER_NAME,
    message: DEPRECATION_MESSAGE,
    source: selected.source,
    latest: { version: latest.version, status: latest.status, title: latest.title },
    deprecate: deprecate.map(({ version, status, title }) => ({ version, status, title })),
    skip: skip.map(({ version, status, title }) => ({ version, status, title })),
  };
}

export function assertApprovedPlan(payload, approvedVersions, approvedLatest) {
  const requested = parseRequestedVersions(approvedVersions);
  if (requested.length === 0) {
    throw new RegistryPlanError('No approved versions were provided.');
  }
  if (typeof approvedLatest !== 'string' || !VERSION_PATTERN.test(approvedLatest)) {
    throw new RegistryPlanError('Approved latest version is not a dotted number.');
  }
  const { latest } = readRegistryVersions(payload);
  if (latest.version !== approvedLatest) {
    throw new RegistryPlanError(
      `Latest changed from ${approvedLatest} to ${latest.version}. Refusing to continue.`,
    );
  }
  const plan = planDeprecations(payload, requested.join(','));
  if (plan.latest.version !== approvedLatest) {
    throw new RegistryPlanError(`Refusing to change ${plan.latest.version} because it is latest.`);
  }
  return plan;
}

function quoteArg(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function formatStatusInvocation(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new RegistryPlanError(`Refusing to describe a status change for "${version}".`);
  }
  const args = [
    'status',
    '--status',
    DEPRECATION_STATUS,
    '--message',
    DEPRECATION_MESSAGE,
    SERVER_NAME,
    version,
  ];
  if (args.includes('--all-versions') || args[2] !== DEPRECATION_STATUS) {
    throw new RegistryPlanError('Refusing to describe a forbidden status change.');
  }
  return `./mcp-publisher ${args.map(quoteArg).join(' ')}`;
}

export function renderPlan(plan, { dryRun }) {
  const lines = [
    `Dry run: ${dryRun ? 'yes' : 'no'}`,
    `Server: ${plan.server}`,
    `Selection: ${plan.source}`,
    `Latest left active: ${plan.latest.version} (${plan.latest.status}, ${plan.latest.title || 'untitled'})`,
    `Message: ${plan.message}`,
  ];
  if (plan.skip.length > 0) {
    lines.push('Already deprecated, left unchanged:');
    for (const record of plan.skip) {
      lines.push(`  ${record.version}  ${record.title || 'untitled'}`);
    }
  }
  if (plan.deprecate.length === 0) {
    lines.push('No versions to deprecate.');
    return lines.join('\n');
  }
  lines.push(
    dryRun
      ? `Would deprecate ${plan.deprecate.length} version(s), each by an explicit version:`
      : `Deprecate ${plan.deprecate.length} version(s), each by an explicit version:`,
  );
  for (const record of plan.deprecate) {
    if (record.version === plan.latest.version) {
      throw new RegistryPlanError('Refusing to describe a change to the latest version.');
    }
    lines.push(`  ${record.version}  ${record.title || 'untitled'}  ${record.status}`);
    lines.push(`  ${formatStatusInvocation(record.version)}`);
  }
  return lines.join('\n');
}

function writeOutput(env, name, value) {
  if (!env.GITHUB_OUTPUT) return;
  if (/[\r\n]/u.test(value)) {
    throw new RegistryPlanError(`Refusing to write ${name} because it is not a single line.`);
  }
  appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function writeSummary(env, text) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new RegistryPlanError('Registry request failed before a response was received.');
  }
  if (!response?.ok) {
    throw new RegistryPlanError(`Registry request failed with HTTP ${response?.status ?? 'unknown'}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new RegistryPlanError('Registry response was not JSON.');
  }
}

function versionUrl(version) {
  return `${VERSIONS_URL}/${encodeURIComponent(version)}`;
}

export async function assertVersionDecision(version, fetchImpl, approvedLatest) {
  const requested = parseRequestedVersions(version);
  if (requested.length !== 1) {
    throw new RegistryPlanError('A single dotted version is required.');
  }
  const [only] = requested;
  if (approvedLatest && only === approvedLatest) {
    throw new RegistryPlanError(`Refusing to change ${only} because the registry marks it isLatest.`);
  }
  const [current, latestPayload] = await Promise.all([
    fetchJson(versionUrl(only), fetchImpl),
    fetchJson(versionUrl('latest'), fetchImpl),
  ]);
  const payload = {
    servers:
      current?.server?.version === latestPayload?.server?.version
        ? [latestPayload]
        : [current, latestPayload],
  };
  const { records, latest } = readRegistryVersions(payload);
  const record = records.get(only);
  if (!record) {
    throw new RegistryPlanError(`Version ${only} is not in the registry response.`);
  }
  refuseLatest(record, latest);
  if (record.status === 'deleted') {
    throw new RegistryPlanError(
      `Refusing to change ${only} because its registry status is ${record.status}.`,
    );
  }
  if (record.status === 'deprecated') return 'skip';
  if (record.status !== 'active') {
    throw new RegistryPlanError(`Version ${only} has unexpected status ${record.status}.`);
  }
  return 'deprecate';
}

export async function execute(command, env, fetchImpl = globalThis.fetch) {
  if (command === 'message') {
    console.log(DEPRECATION_MESSAGE);
    return;
  }
  if (command === 'plan') {
    const payload = await fetchJson(VERSIONS_URL, fetchImpl);
    const plan = planDeprecations(payload, env.REQUESTED_VERSIONS ?? '');
    const dryRun = env.DRY_RUN !== 'false';
    const text = renderPlan(plan, { dryRun });
    console.log(text);
    writeSummary(env, text);
    writeOutput(env, 'versions', plan.deprecate.map(record => record.version).join(','));
    writeOutput(env, 'latest', plan.latest.version);
    return;
  }
  if (command === 'assert') {
    const payload = await fetchJson(VERSIONS_URL, fetchImpl);
    const plan = assertApprovedPlan(payload, env.APPROVED_VERSIONS ?? '', env.APPROVED_LATEST ?? '');
    console.log(renderPlan(plan, { dryRun: false }));
    return;
  }
  if (command === 'assert-version') {
    const decision = await assertVersionDecision(env.VERSION ?? '', fetchImpl, env.APPROVED_LATEST ?? '');
    console.log(decision);
    return;
  }
  throw new RegistryPlanError(`Unknown registry plan command "${command}".`);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  try {
    await execute(process.argv[2] ?? 'plan', process.env);
  } catch (error) {
    console.error(error instanceof RegistryPlanError ? error.message : 'Registry deprecation plan failed.');
    process.exitCode = 1;
  }
}
