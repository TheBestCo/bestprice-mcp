/*
 * What a native browser peer reports, read into bounded evidence.
 *
 * The peer is operator-supplied, so nothing it says is trusted by shape alone: every field is
 * normalized to a closed vocabulary, bounded, and dropped when it does not fit. Three kinds of
 * evidence live here (audit pass 8):
 *
 * - transitions (F02): a browser session, a document, a URL and an invocation are different
 *   identities. A same-URL reload is a new document; a pushState is a new URL in the same document.
 * - policy interventions (F04): a navigation the peer refused is recorded against the invocation that
 *   caused it, by class only — never the merchant URL, a signed link, or shopper text.
 * - the served implementation (F08): digests of what the storefront actually served during the run,
 *   so the evidence names the deployed code it exercised instead of this repository's copy of it.
 */
import { canonicalJson, sha256 } from './run-evidence.js';

export const TRANSITION_KINDS = Object.freeze(['none', 'same_document', 'new_document']);
export const PAYLOAD_STATUSES = Object.freeze(['returned', 'lost_to_navigation', 'error', 'missing']);
const POLICY_FRAMES = Object.freeze(['main', 'subframe', 'new_target']);
const POLICY_DESTINATIONS = Object.freeze(['external_origin', 'bestprice_non_browsing_path', 'invalid_url']);
const MAX_POLICY_EVENTS = 8;
const MAX_SCRIPTS = 64;
const DIGEST = /^[0-9a-f]{64}$/u;
const REVISION = /^[0-9a-f]{7,40}$/u;
const SHORT_ID = /^[A-Za-z0-9._:-]{1,80}$/u;
const RELEASE = /^[A-Za-z0-9._:+-]{1,80}$/u;

const httpsUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

/* `/item/2159919913/…` and `/cat/806/…` are identified by their numeric segment; a slug is not
 * identity and may be renamed by a canonical redirect. Anything else is identified by its path. */
const pageIdentity = url => {
  const [, kind, id] = /^\/([a-z]+)\/(\d+)(?:\/|$)/u.exec(url.pathname) ?? [];
  return kind ? `${kind}:${id}` : `path:${url.pathname.replace(/\/+$/u, '') || '/'}`;
};

/* A search is routed by the storefront: `/search?q=iphone` lands on `/hub/25/iphone.html`,
 * `/search?q=iphone 16` on a category listing. Any listing is the page a search case asked for. */
const isListing = url => url.pathname === '/search' || /^\/(?:cat|hub)\/\d+(?:\/|$)/u.test(url.pathname);

/**
 * The URL the run continues from. The browser may land on a canonical URL for the requested page;
 * the old orchestrator kept the requested one and the peer then refused its own current page. The
 * reported URL is adopted only while it is still the page the case asked for.
 */
export function adoptStartUrl(requested, reported) {
  const from = httpsUrl(requested);
  const to = httpsUrl(reported);
  if (!from || !to || from.origin !== to.origin) return null;
  if (from.pathname === '/search' && isListing(to)) return to.href;
  return pageIdentity(from) === pageIdentity(to) ? to.href : null;
}

export function transitionEvidence(value) {
  if (!value || typeof value !== 'object' || !TRANSITION_KINDS.includes(value.kind)) return null;
  const url = candidate => httpsUrl(candidate)?.href ?? null;
  const id = candidate => (typeof candidate === 'string' && SHORT_ID.test(candidate) ? candidate : null);
  return {
    kind: value.kind,
    fromUrl: url(value.fromUrl),
    toUrl: url(value.toUrl),
    fromDocument: id(value.fromDocument),
    toDocument: id(value.toDocument),
  };
}

export function policyEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      event =>
        event &&
        typeof event === 'object' &&
        event.kind === 'navigation_blocked' &&
        POLICY_FRAMES.includes(event.frame) &&
        POLICY_DESTINATIONS.includes(event.destination),
    )
    .slice(0, MAX_POLICY_EVENTS)
    .map(event => ({ kind: event.kind, frame: event.frame, destination: event.destination }));
}

/** One executed call, as a step records it. Nothing is inferred: an absent payload stays absent. */
export function stepEvidence(execution) {
  const result =
    execution?.payload && typeof execution.payload === 'object' && !Array.isArray(execution.payload)
      ? execution.payload
      : null;
  const declared = PAYLOAD_STATUSES.includes(execution?.payloadStatus) ? execution.payloadStatus : null;
  const transition = transitionEvidence(execution?.transition);
  return {
    invocationId:
      typeof execution?.invocationId === 'string' && SHORT_ID.test(execution.invocationId)
        ? execution.invocationId
        : null,
    result,
    payloadStatus: declared ?? (result ? 'returned' : 'missing'),
    transition,
    navigatedTo: transition && transition.kind !== 'none' ? transition.toUrl : null,
    policy: policyEvidence(execution?.policy),
    error: typeof execution?.error === 'string' ? execution.error.slice(0, 200) : null,
  };
}

/**
 * The served-implementation receipt. Its digest names the storefront release the browser was
 * served (`window.APP.release`, the same identity Sentry reports), the discovery manifest it
 * published and the gateway revision behind it — one identity for every page a journey visits,
 * which is why script digests are kept as detail rather than hashed in: they differ by page.
 *
 * `complete` is false when any part could not be read, or when the release changed during the run
 * (a deploy landed mid-journey). An incomplete receipt is diagnostic, never release evidence.
 */
export function servedReceipt(served, { releasesSeen = [] } = {}) {
  if (!served || typeof served !== 'object') return null;
  const origin = httpsUrl(served.origin)?.origin ?? null;
  const release = value => (typeof value === 'string' && RELEASE.test(value) ? value : null);
  const storefrontRelease = release(served.storefrontRelease);
  const discovery =
    served.discovery && typeof served.discovery === 'object'
      ? {
          url: httpsUrl(served.discovery.url)?.href ?? null,
          sha256: DIGEST.test(String(served.discovery.sha256)) ? served.discovery.sha256 : null,
        }
      : null;
  const gatewayRevision =
    typeof served.gatewayRevision === 'string' && REVISION.test(served.gatewayRevision)
      ? served.gatewayRevision
      : null;
  const scripts = (Array.isArray(served.scripts) ? served.scripts : [])
    .map(entry => {
      const url = httpsUrl(entry?.url);
      return {
        url: url ? `${url.origin}${url.pathname}` : null,
        sha256: typeof entry?.sha256 === 'string' && DIGEST.test(entry.sha256) ? entry.sha256 : null,
      };
    })
    .filter(entry => entry.url)
    .sort((left, right) => left.url.localeCompare(right.url))
    .slice(0, MAX_SCRIPTS);
  const identity = { origin, storefrontRelease, discovery, gatewayRevision };
  const changedDuringRun = releasesSeen.some(seen => release(seen) !== storefrontRelease);
  const complete =
    Boolean(origin && storefrontRelease && gatewayRevision && discovery?.url && discovery.sha256) &&
    !changedDuringRun;
  return {
    ...identity,
    scripts,
    ...(changedDuringRun ? { changedDuringRun: true } : {}),
    complete,
    digest: sha256(canonicalJson(identity)),
  };
}
