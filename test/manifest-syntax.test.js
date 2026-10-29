import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSkillFrontmatter, validateRepository } from '../scripts/validate-manifests.mjs';

describe('strict manifest parsing', () => {
  it('parses every skill frontmatter block and directory manifest', () => {
    const errors = validateRepository(new URL('..', import.meta.url));
    assert.deepEqual(errors, [], errors.join('\n'));
  });

  it('rejects the unquoted colon-space that broke awesome-copilot intake', () => {
    assert.throws(
      () =>
        parseSkillFrontmatter(
          '---\nname: bestprice-shopping\ndescription: Use BestPrice: what to buy\n---\n',
          'fixture',
        ),
      /Nested mappings are not allowed/u,
    );
  });
});
