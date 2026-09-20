/** Opt-in wrapper around the existing public canary. No retries or altered transport semantics. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NETWORK_CODES = new Map([
  ['ENOTFOUND', 'DNS_NOT_FOUND'],
  ['EAI_AGAIN', 'DNS_TEMPORARILY_UNAVAILABLE'],
  ['ECONNRESET', 'CONNECTION_RESET'],
  ['ECONNREFUSED', 'CONNECTION_REFUSED'],
  ['ETIMEDOUT', 'NETWORK_TIMEOUT'],
  ['EPIPE', 'BROKEN_PIPE'],
  ['UND_ERR_SOCKET', 'REMOTE_SOCKET_CLOSED'],
  ['UND_ERR_CONNECT_TIMEOUT', 'CONNECT_TIMEOUT'],
  ['UND_ERR_HEADERS_TIMEOUT', 'HEADERS_TIMEOUT'],
  ['UND_ERR_BODY_TIMEOUT', 'BODY_TIMEOUT'],
  ['UND_ERR_ABORTED', 'REQUEST_ABORTED'],
  ['ABORT_ERR', 'REQUEST_ABORTED'],
  ['CERT_HAS_EXPIRED', 'TLS_CERTIFICATE_EXPIRED'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_VERIFICATION_FAILED'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS_VERIFICATION_FAILED'],
]);

/** No messages, stack traces, URLs, addresses, headers, or arbitrary codes enter the report. */
export function networkFailureCategory(error) {
  const seen = new Set();
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    try {
      const known = NETWORK_CODES.get(current.code);
      if (known) return known;
      if (current.name === 'AbortError') return 'REQUEST_ABORTED';
      if (current.name === 'TimeoutError') return 'NETWORK_TIMEOUT';
      current = current.cause;
    } catch {
      break;
    }
  }
  return 'UNCLASSIFIED_FETCH_FAILURE';
}

/** Preserve requests, successes, and original rejection identity; observing never retries. */
export async function runDiagnosedSmoke({ run, fetchImpl = globalThis.fetch, expectedRevision } = {}) {
  const transportFailures = [];
  let transportFailureCount = 0;
  const report = await run({
    expectedRevision,
    fetchImpl: async (...args) => {
      try {
        return await fetchImpl(...args);
      } catch (error) {
        transportFailureCount += 1;
        if (transportFailures.length < 16) transportFailures.push(networkFailureCategory(error));
        throw error;
      }
    },
  });
  return { ...report, transportFailureCount, transportFailures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/public-diagnose.mjs OUTPUT.json [EXPECTED_REVISION]');
  const { runPublicSmoke } = await import('./public-smoke.mjs');
  const report = await runDiagnosedSmoke({ run: runPublicSmoke, expectedRevision: process.argv[3] });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
