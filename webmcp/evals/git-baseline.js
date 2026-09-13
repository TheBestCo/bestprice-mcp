/**
 * A trusted baseline is what git already published, never the working tree.
 *
 * Evidence that is validated against itself proves nothing: whoever edits a record can re-run the
 * validator on the edited file. The reference is the copy the merged branch already carries, read
 * straight out of git at the merge base (`git show <base>:<path>`), so a working ledger that drops,
 * reorders or rewrites a published record is compared against something the author cannot reach.
 *
 * Everything here degrades to `null` instead of throwing: a missing repository, ref or path is a
 * fact the caller reports, not a crash inside a validator.
 */

import { execFileSync } from 'node:child_process';

const GIT_TIMEOUT_MS = 10_000;

/* The branch this checkout will be merged into, most specific first. */
const BASELINE_REFS = Object.freeze(['origin/main', 'origin/HEAD', 'HEAD']);

/** Runs git and returns stdout, or null when the command fails (no repo, no ref, no path). */
export function gitOutput(args, { cwd } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
}

/** The commit this checkout must not contradict: the merge base with the branch it merges into. */
export function resolveBaselineRevision({ cwd, refs = BASELINE_REFS } = {}) {
  for (const ref of refs) {
    const merged = gitOutput(['merge-base', 'HEAD', ref], { cwd })?.trim();
    if (merged) return { revision: merged, ref };
  }
  const head = gitOutput(['rev-parse', 'HEAD'], { cwd })?.trim();
  return head ? { revision: head, ref: 'HEAD' } : null;
}

/**
 * The committed copy of `relativePath` at the merge base.
 *
 * `text` is null when the path did not exist yet (a new file has no baseline to contradict).
 */
export function readTrustedBaseline(relativePath, { cwd, refs } = {}) {
  const resolved = resolveBaselineRevision({ cwd, refs });
  if (!resolved) return null;
  const text = gitOutput(['show', `${resolved.revision}:${relativePath}`], { cwd });
  return { ...resolved, path: relativePath, text: text ?? null };
}

/** The revision currently checked out, so a record can be bound to the implementation it names. */
export function currentRevision({ cwd } = {}) {
  return gitOutput(['rev-parse', 'HEAD'], { cwd })?.trim() || null;
}
