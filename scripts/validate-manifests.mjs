/**
 * Strict parse of every skill frontmatter block and directory manifest.
 * YAML 1.2 rejects a plain scalar that contains ": " (the awesome-copilot failure mode).
 * Duplicate keys are errors. JSON is parsed as YAML 1.2 so the same rule applies.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

const SKIP_DIRS = new Set(['node_modules', '.git', 'evals']);
const WALK_DOT_DIRS = new Set(['.github', '.claude-plugin', '.codex-plugin', '.cursor-plugin', '.agents']);

/** @param {string} root absolute repository root */
export function manifestFiles(root) {
  /** @type {string[]} */
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') && !WALK_DOT_DIRS.has(entry.name)) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (relative(root, path) === 'webmcp/evals' || relative(root, path).startsWith('webmcp/evals/'))
          continue;
        walk(path);
        continue;
      }
      if (isManifest(root, path)) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

function isManifest(root, path) {
  const rel = relative(root, path).split('\\').join('/');
  const base = rel.slice(rel.lastIndexOf('/') + 1);
  if (base === 'package-lock.json') return false;
  if (base === 'SKILL.md') return true;
  if (
    base === 'plugin.json' ||
    base === 'marketplace.json' ||
    base === 'server.json' ||
    base === 'smithery.yaml'
  )
    return true;
  if (base.endsWith('.plugin.json')) return true;
  if (rel === '.mcp.json' || rel === 'mcp.json') return true;
  if (
    /^(gemini-extension|qwen-extension|glama|opencode|package|biome)\.json$/u.test(base) &&
    !rel.includes('/')
  )
    return true;
  if (rel.startsWith('distribution/') && /\.(json|ya?ml)$/u.test(base)) return true;
  if (
    rel.startsWith('submission/') &&
    !rel.startsWith('submission/evidence/') &&
    /\.(json|ya?ml)$/u.test(base)
  )
    return true;
  if (rel.startsWith('.github/') && /\.(json|ya?ml)$/u.test(base)) return true;
  if (rel.startsWith('examples/') && /\.ya?ml$/u.test(base)) return true;
  return false;
}

/** @param {string} text @param {string} label */
export function parseStrict(text, label) {
  const doc = parseDocument(text, { strict: true, uniqueKeys: true });
  if (doc.errors.length > 0) {
    throw new Error(`${label}: ${doc.errors.map(error => error.message).join('; ')}`);
  }
  return doc.toJS({ maxAliasCount: 0 });
}

/** @param {string} text @param {string} label */
export function parseSkillFrontmatter(text, label) {
  const normalized = text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
  if (!normalized.startsWith('---\n')) throw new Error(`${label}: missing opening frontmatter`);
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) throw new Error(`${label}: missing closing frontmatter`);
  const raw = normalized.slice(4, end);
  const data = parseStrict(raw, label);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label}: frontmatter must be a mapping`);
  }
  if (typeof data.name !== 'string' || data.name.length === 0) {
    throw new Error(`${label}: frontmatter name must be a string`);
  }
  if (typeof data.description !== 'string' || data.description.length === 0) {
    throw new Error(`${label}: frontmatter description must be a string`);
  }
  return data;
}

/** @param {URL | string} rootUrl */
export function validateRepository(rootUrl) {
  const root = typeof rootUrl === 'string' ? rootUrl : decodeURIComponent(rootUrl.pathname);
  /** @type {string[]} */
  const errors = [];
  for (const path of manifestFiles(root)) {
    const rel = relative(root, path);
    let text;
    try {
      text = readFileSync(path, 'utf8');
      if (path.endsWith('SKILL.md')) parseSkillFrontmatter(text, rel);
      else if (/\.ya?ml$/u.test(path) || path.endsWith('.json')) parseStrict(text, rel);
      else errors.push(`${rel}: not a recognized manifest`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length === 0 && manifestFiles(root).filter(path => path.endsWith('SKILL.md')).length < 4) {
    errors.push('expected at least four SKILL.md files');
  }
  return errors;
}

const executed = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executed) {
  const root = new URL('..', import.meta.url);
  const errors = validateRepository(decodeURIComponent(root.pathname));
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  const directory = decodeURIComponent(root.pathname);
  console.log(`manifests: ok (${manifestFiles(directory).length} files)`);
}
