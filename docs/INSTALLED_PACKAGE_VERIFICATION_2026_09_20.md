# Installed package verification — 20 September 2026

## Scope

Source tests, a packed archive, an installed runtime, a public release, a production deployment,
and native shopper-task qualification are separate claims. This change adds an installed-package
check; it does not publish a new version, modify any runtime module, promote a storefront build,
or change the frozen WebMCP evaluation cases, prompts, ledgers, grader or thresholds.

## Reproduced gaps

The release workflow used the checkout action's shallow default even though the evidence tests
require genuine history. It also treated every nonzero `git ls-remote --exit-code` result as an
absent tag. Only exit status 2 represents absence; authentication/network failures must not
permit creation. The exact workflow shell is exercised with exit statuses 0, 2, 1, 128, 129 and
143. Original workflow: 2 passing and 6 failing controls; candidate: all 8 workflow controls pass.
The eight include full-history and installed-artifact ordering assertions, not just shell status.

The additional verifier controls exercise missing/duplicate/extra package entries, path escapes,
wrong identity, byte tampering, symlink/checkout fallback, unclean test summaries, real offline
packing, and failure receipt preservation. These controls do not claim an installed SDK run.

## Installed-package check

Run in a genuine clean checkout after the existing `npm ci` has warmed the dependency cache:

```sh
node scripts/verify-packed-release.mjs /tmp/bp-installed-package-unique-output
```

The output directory must be new and outside the checkout. The verifier fails rather than
clobbering any prior receipt or artifact. It records a negative receipt when a later phase fails.
Commands have finite time/output bounds. Errors are reported by phase, not raw npm configuration,
credentials or remote response bodies.

The verifier:

1. Records the genuine Git revision and checks source cleanliness and tracked runtime membership.
2. Creates one offline npm tarball with lifecycle scripts disabled. Its complete physical inventory
   must match the runtime, package manifest, README and LICENSE; only regular files are accepted.
3. Checks the archive integrity and every runtime file against source, then extracts it into a new
   system temporary directory outside the checkout.
4. Supplies the release's unchanged `package-lock.json` explicitly, since npm does not pack it.
   Runs `npm ci --offline --ignore-scripts --omit=dev`, with no online fallback. It verifies every
   installed production dependency version against the lock and verifies SDK resolution stays
   inside that isolated installation. Node loader overrides and inherited model secrets are not
   passed to children.
5. Copies unchanged test support into the isolated package *after* inventory and byte verification.
   Executes the existing stdio, strict UTF-8, frame-bound and stalled-startup tests there. These
   use the real installed SDK, actual child processes and loopback HTTP, not production endpoints.
   No runtime code is replaced by test support. All 63 or more tests must pass with zero failures,
   cancellations, skips or todos; a missing or duplicate summary is not a pass.
6. Rechecks runtime bytes, the source lock and source cleanliness. Only then sets `ok: true`.

Receipts contain package/lock/runtime/test-support digests, actual Node/npm versions, installed
production dependency versions and the parsed test totals. They always carry
`purpose: installed-package-diagnostic` and `qualification: false`. The exact tarball, receipt
and test output are retained as uniquely named CI artifacts for each Node 20/22 job.

## Release enforcement

The existing CI test matrix now performs this check after its unchanged full suite. The release
workflow fetches full history, distinguishes an absent tag from an unsuccessful lookup, runs the
full suite and installed check on both Node 20 and Node 22, and requires byte-identical tarballs
before attaching the verified tarball and both receipts to a new GitHub release. Existing
changelog, lint and test gates remain blocking. An existing tag is not moved or republished.

No package version changes here. `private: true` remains unchanged; no npm publish is attempted.
A GitHub Actions artifact is not evidence that an external client downloaded or installed it.
The installation check deliberately uses the release lock; it does not certify arbitrary
consumer semver resolution. Production rollout, real-model/native-browser 5 x 47 qualification,
the preregistered completion-guard diagnostic, and Shopping Brain certification remain separate.
