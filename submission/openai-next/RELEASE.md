# BestPrice 1.3.0 release candidate

This directory is the next package, not the currently published 1.2.0 source in
`submission/openai`. Keep the published source unchanged until the new version
has actually been reviewed and published.

The candidate adds deal checking, editable exact-product baskets, separately
authorized saved comparisons and fixed-product delivered-budget watches. The
server remains authoritative about what is actually advertised. Saved tools
require `comparisons:manage`; existing Events grants never gain that permission
through refresh. The package declares mixed authentication with CIMD. Account
linking must display the requested scopes accurately.

The account screens and first-party comparison handoff are implemented in
BestPrice.gr. The backend stores encrypted requirements and checked snapshots,
retains an immutable baseline, rejects conflicting updates and expires records
after 180 days. Recheck does not verify unresolved sizes or requirements.

Before submitting, record actual production tool inventory, real published-app
use, saved-comparison linking/reopen/delete, supported-host subscription/cancel
and callback qualification. Corporate notice alignment remains distinct from
implementation facts disclosed in consent. Do not report a test fixture as a
production callback, or infer publication from a package upload.

Screenshots containing an identifiable model work through ChatGPT's visible-text
extraction. The server does not ingest the original image. General compatibility
verdicts are not advertised. The package must not promise those as implemented.

Build the review archive with `node scripts/package-openai-next.mjs`. The command
writes the ZIP and a SHA-256/source-file receipt to `/tmp`; credentials and this
release note are excluded. OpenAI submission and publication are receiving
states to verify separately.

The November 3 portal download verified that the current listing uses package
name `app-6a8d8ed6e2bc8191b3caaf7214f3c981`, despite its newer listing ID.
The candidate preserves that downloaded package identity. See the exact
[identity receipt](../evidence/published-package-identity-2026-11-03.json).

The candidate was uploaded to the existing plugin as draft
`appsub_6aea2de53a088191a4df87d30b438621`. Its skill checks passed; no
blocking metadata finding remained. A receiving download matches all seven
source files byte for byte. The non-blocking brand-name finding is retained
in the [draft receipt](../evidence/openai-1.3-draft-2026-11-03.json). No new
policy attestations were accepted and the draft has not been submitted.
