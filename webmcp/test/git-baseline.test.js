/**
 * The trusted baseline must be found however the caller spells the path.
 *
 * The custody-v2 boundary exempts records already published at the merge base, and it can only do
 * that if the baseline is actually read. `git show <rev>:<path>` resolves from the repository root,
 * so an absolute filesystem path resolves to nothing and the baseline silently becomes "none" —
 * which turned the gate's own default invocation into 705 false "new record" failures on
 * 2026-09-19. These tests pin the path handling, because the failure mode is silence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { gitPathFor, readTrustedBaseline } from '../evals/git-baseline.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LEDGER = join(REPO_ROOT, 'webmcp/evals/runs.v8.json');
const RELATIVE_LEDGER = 'webmcp/evals/runs.v8.json';

describe('the trusted baseline resolves the path the caller actually has', () => {
  it('converts an absolute path inside the repository to a repository-relative one', () => {
    assert.equal(gitPathFor(LEDGER), RELATIVE_LEDGER);
    assert.equal(gitPathFor(RELATIVE_LEDGER), RELATIVE_LEDGER, 'a relative path is left alone');
  });

  it('leaves a path outside the repository unresolved rather than inventing one', () => {
    assert.equal(gitPathFor('/etc/hosts'), '/etc/hosts');
  });

  it('reads the same baseline bytes from the absolute and the relative path', () => {
    const absolute = readTrustedBaseline(LEDGER);
    const relative = readTrustedBaseline(RELATIVE_LEDGER);
    assert.ok(absolute, 'a baseline revision resolves inside a git checkout');
    assert.ok(absolute.text, 'the committed ledger exists at the baseline revision');
    assert.equal(absolute.revision, relative.revision);
    assert.equal(absolute.text, relative.text);
    /* The point of the boundary: the baseline is a real published ledger, not an empty read. */
    const parsed = JSON.parse(absolute.text);
    assert.ok(Array.isArray(parsed.runs) && parsed.runs.length > 0, 'the baseline holds records');
    assert.equal(
      absolute.text,
      readFileSync(LEDGER, 'utf8'),
      'the working ledger is the published one, so no record is "new" for the wrong reason',
    );
  });
});
