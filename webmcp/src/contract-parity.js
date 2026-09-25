/**
 * Contract parity: the published contract against the pages that actually register the tools.
 *
 * Round 4 found `show_offer` on the item page advertising an `offer_ref` that the agent is told to
 * prefer, while `webmcp/src/contracts.js` — and every consumer of it — declared only `merchant_id` and
 * `merchant_name` with `additionalProperties: false`. Names, counts and version strings all agreed;
 * the field did not. A schema is a set of fields, so parity has to be checked field by field, in both
 * directions, including each field's type and bounds.
 *
 * The storefront is the source of truth for what a page registers, and it lives in another repository.
 * Since contract 1.8 it keeps a tool's words and output in one place and generates a JSON copy of them:
 *
 * - `extra/mcpDiscovery/webmcp-tools.json` — each tool's title, description, page wording, output
 *   schema and (since registration revision 2026-09-25.12) input schema, written by
 *   `tools/scripts/webmcp-tools-json.mjs` from `js/modules/webmcp/tool-catalog.js`, `input-schemas.js`
 *   and `output-schemas.js` (the storefront's own test fails while it is stale). It is read as JSON;
 * - the page modules that register the tools (`STOREFRONT_SOURCES`) — each tool's annotations, which
 *   the JSON does not carry, and that each page registers the document's schemas and words by name.
 *   They are read by the reader below;
 * - `tools/scripts/mcp_discovery_json.php` — the manifest the site serves, rendered by the real PHP
 *   builder, for the tools each page type registers (`renderStorefrontPages`). The storefront's
 *   `manifest-parity.test.js` checks that manifest against what the pages register.
 *
 * Two mechanisms keep this honest without a cross-repo build step:
 *
 * - `webmcp/test/fixtures/storefront-tools.v2.json` is a committed snapshot of exactly what is read
 *   here, including the sha256 of every file it was read from and of the definitions. The parity test
 *   always runs against the snapshot, so the suite is hermetic and a missing sibling checkout cannot
 *   silently skip the check;
 * - when the sibling checkout *is* present (and contains the snapshot's source commit), the test reads
 *   it again and fails if the snapshot has drifted — which keeps the snapshot a transcription rather
 *   than a memory. `node webmcp/evals/storefront-snapshot.mjs <storefront>` regenerates it.
 *
 * `extractToolDefinitions` is a reader over the source, not an import: the storefront modules import
 * helpers through bundler aliases, DOM globals and navigation, so loading them here would neither work
 * nor prove anything about the surface a browser registers. It tokenizes the file (strings with
 * escapes, template literals with substitutions, comments, regular expressions) and reads the object
 * literals that carry both a `name` and an `inputSchema`, resolving module-scope constants — including
 * ones imported from another file it reads, such as the shared annotation sets.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { canonicalJson, sha256 } from '../evals/run-evidence.js';

/** The generated JSON copy of every tool's title, description and output schema. */
export const STOREFRONT_TOOL_DOCUMENT = 'extra/mcpDiscovery/webmcp-tools.json';

/** The modules whose object literals register the tools, with their input schemas and annotations. */
export const STOREFRONT_SOURCES = Object.freeze([
  'pages/item/webmcp/tools.js',
  'pages/search/webmcp/tools.js',
  'pages/search/webmcp/shared-tools.js',
  'js/modules/webmcp/search-tool.js',
  'js/modules/webmcp/shopping-decision-tool.js',
  /* Contract 2.0: open_product, on every page (it replaced get_product_details, and with it
   * product-details-tool.js, and open_visible_product). */
  'js/modules/webmcp/open-product-tool.js',
  /* Contract 1.9 shares input fields across tools: one product id, the search constraints. */
  'js/modules/webmcp/search-constraints.js',
  /* Revision 2026-09-25.12: every input schema's one source, which the generated document carries. */
  'js/modules/webmcp/input-schemas.js',
  'js/modules/webmcp/output-schemas.js',
]);

/** Every file the surface is read from, in the order the snapshot records their digests. */
export const STOREFRONT_FILES = Object.freeze([STOREFRONT_TOOL_DOCUMENT, ...STOREFRONT_SOURCES]);

/** The storefront's own renderer of the manifest it serves; its `webmcp.pages` lists each page's tools. */
export const STOREFRONT_PAGE_RENDERER = 'tools/scripts/mcp_discovery_json.php';

/** The storefront's page types, and the package page type each one registers the tools of. */
export const STOREFRONT_PAGE_TYPES = Object.freeze({
  home: 'home',
  search: 'listing',
  category: 'listing',
  hub: 'listing',
  product: 'product',
  /* Contract 1.9: every other public page — articles, deals, stores, brands… — registers the
   * site-wide tools. */
  site: 'site',
});

export const DEFAULT_STOREFRONT_ROOT =
  process.env.BESTPRICE_STOREFRONT_ROOT ?? join(process.cwd(), '..', 'bestprice.gr');

/* --------------------------------------------------------------------------------------------- */
/* Tokenizer                                                                                      */
/* --------------------------------------------------------------------------------------------- */

const IDENTIFIER = /^[A-Za-z_$][\w$]*/u;
const NUMBER = /^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/u;
const KNOWN_MEMBERS = Object.freeze({
  'Number.MAX_SAFE_INTEGER': Number.MAX_SAFE_INTEGER,
  'Number.MIN_SAFE_INTEGER': Number.MIN_SAFE_INTEGER,
});
const REGEX_PREFIX_TOKENS = Object.freeze([')', ']', '}']);
/* After these keywords a `/` starts a regular expression, although they are identifiers. */
const REGEX_PREFIX_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);
const OPENERS = new Set(['(', '[', '{']);
const PASS_THROUGH_CALLS = new Set(['Object.freeze', 'essential']);
const CLOSERS = new Set([')', ']', '}']);

/**
 * Splits JavaScript source into the tokens this reader needs: punctuation (with `...` as one token),
 * identifiers, string and template literals, and numbers. Comments and regular-expression literals
 * are consumed and dropped.
 */
function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '/' && startsRegex(tokens)) {
      const end = skipRegex(source, index);
      if (end === index + 1) {
        index = end;
        continue;
      }
      /* A regular expression is kept with its flags: a schema may publish its `.source` as a pattern. */
      const flags = /^[a-z]*/u.exec(source.slice(end))[0];
      tokens.push({ type: 'regex', value: { $regex: source.slice(index + 1, end - 1), $flags: flags } });
      index = end + flags.length;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = findStringEnd(source, index);
      tokens.push({ type: 'string', value: decodeEscapes(source.slice(index + 1, end)) });
      index = end + 1;
      continue;
    }
    if (char === '`') {
      const end = findTemplateEnd(source, index);
      const parts = templateParts(source.slice(index + 1, end));
      /* A template without substitutions is a string; one with substitutions is resolved later,
       * when every substitution names a constant the reader knows. */
      tokens.push(
        parts.length === 1
          ? { type: 'string', value: parts[0] }
          : { type: 'template', value: { $template: parts } },
      );
      index = end + 1;
      continue;
    }
    const identifier = IDENTIFIER.exec(source.slice(index));
    if (identifier) {
      const [name] = identifier;
      if (name === 'true' || name === 'false') {
        tokens.push({ type: 'literal', value: name === 'true' });
      } else if (name === 'null') {
        tokens.push({ type: 'literal', value: null });
      } else if (name === 'undefined') {
        tokens.push({ type: 'literal', value: undefined });
      } else {
        tokens.push({ type: 'identifier', value: name });
      }
      index += name.length;
      continue;
    }
    const number = NUMBER.exec(source.slice(index));
    if (number) {
      /* `10_000` is how the storefront writes a bound. */
      tokens.push({ type: 'literal', value: Number(number[0].replaceAll('_', '')) });
      index += number[0].length;
      continue;
    }
    if (source.startsWith('...', index)) {
      tokens.push({ type: 'punct', value: '...' });
      index += 3;
      continue;
    }
    tokens.push({ type: 'punct', value: char });
    index += 1;
  }
  return tokens;
}

/* A `/` starts a regular expression unless the previous token can end an expression. */
function startsRegex(tokens) {
  const previous = tokens.at(-1);
  if (!previous) return true;
  if (previous.type === 'identifier') return REGEX_PREFIX_KEYWORDS.has(previous.value);
  if (['literal', 'string', 'template', 'regex'].includes(previous.type)) return false;
  return !REGEX_PREFIX_TOKENS.includes(previous.value);
}

function findStringEnd(source, index) {
  const quote = source[index];
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === quote) return cursor;
    if (source[cursor] === '\n') return cursor;
  }
  return source.length - 1;
}

/* The closing backtick of a template, stepping over `${…}` substitutions, which may nest templates. */
function findTemplateEnd(source, index) {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '`') return cursor;
    if (source[cursor] === '$' && source[cursor + 1] === '{')
      cursor = findSubstitutionEnd(source, cursor + 2);
  }
  return source.length - 1;
}

/* The `}` that closes a `${` substitution whose expression starts at `index`. */
function findSubstitutionEnd(source, index) {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "'" || char === '"') cursor = findStringEnd(source, cursor);
    else if (char === '`') cursor = findTemplateEnd(source, cursor);
    else if (char === '{') depth += 1;
    else if (char === '}') {
      if (depth === 0) return cursor;
      depth -= 1;
    }
  }
  return source.length - 1;
}

/* A template body as alternating text and `{ $ref }` substitutions; one part when there are none. */
function templateParts(body) {
  const parts = [];
  let text = '';
  for (let cursor = 0; cursor < body.length; cursor += 1) {
    if (body[cursor] === '\\') {
      text += body.slice(cursor, cursor + 2);
      cursor += 1;
      continue;
    }
    if (body[cursor] === '$' && body[cursor + 1] === '{') {
      const end = findSubstitutionEnd(body, cursor + 2);
      parts.push(decodeEscapes(text), { $ref: body.slice(cursor + 2, end).trim() });
      text = '';
      cursor = end;
      continue;
    }
    text += body[cursor];
  }
  parts.push(decodeEscapes(text));
  return parts;
}

function skipRegex(source, index) {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '[') {
      while (cursor < source.length && source[cursor] !== ']') {
        if (source[cursor] === '\\') cursor += 1;
        cursor += 1;
      }
      continue;
    }
    if (source[cursor] === '/') return cursor + 1;
    if (source[cursor] === '\n') return index + 1;
  }
  return source.length;
}

function decodeEscapes(text) {
  return text.replace(/\\(u\{[0-9a-f]+\}|u[0-9a-f]{4}|x[0-9a-f]{2}|.)/giu, (_, sequence) => {
    if (sequence.startsWith('u{')) return String.fromCodePoint(Number.parseInt(sequence.slice(2, -1), 16));
    if (sequence.startsWith('u') || sequence.startsWith('x')) {
      return String.fromCodePoint(Number.parseInt(sequence.slice(1), 16));
    }
    if (sequence === 'n') return '\n';
    if (sequence === 't') return '\t';
    if (sequence === 'r') return '\r';
    return sequence;
  });
}

/* --------------------------------------------------------------------------------------------- */
/* Parser                                                                                         */
/* --------------------------------------------------------------------------------------------- */

/* Constant references an object spreads (`{ ...BASE }`), resolved once constants are known. */
const SPREADS = Symbol('spreads');
/* The catalog name a definition spreads its title and description from (`...toolText('name')`). */
const TEXT_FROM = Symbol('textFrom');
/* Only punctuation delimits: a string literal whose text is `}` or `,` must not end a value. */
const isPunct = (token, value) => token?.type === 'punct' && token.value === value;
/* A value this reader does not evaluate — a call, an arrow, an operator expression. */
const expressionHole = token => ({ $expression: String(token?.value ?? '') });
const isBoundary = (token, close) => isPunct(token, ',') || isPunct(token, close);

/** Skips to the next `,` or `close` at depth 0: the end of an expression the reader does not evaluate. */
function skipExpression(tokens, index, close) {
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    const { type, value } = tokens[cursor];
    if (type !== 'punct') continue;
    if (depth === 0 && (value === ',' || value === close)) return cursor;
    if (OPENERS.has(value)) depth += 1;
    else if (CLOSERS.has(value)) {
      depth -= 1;
      if (depth < 0) return cursor;
    }
  }
  return tokens.length;
}

/** Reads a value starting at token `index`; returns `{ value, next }` or null when it is not a literal. */
function parseValue(tokens, index) {
  const token = tokens[index];
  if (!token) return null;
  if (
    token.type === 'literal' ||
    token.type === 'string' ||
    token.type === 'template' ||
    token.type === 'regex'
  ) {
    return { value: token.value, next: index + 1 };
  }
  if (token.type === 'identifier') {
    /* `Number.MAX_SAFE_INTEGER` is how the storefront bounds a continuation offset. A member
     * expression the reader knows is its value; any other stays a named hole, never a guess. */
    let name = token.value;
    let next = index + 1;
    while (tokens[next]?.value === '.' && tokens[next + 1]?.type === 'identifier') {
      name = `${name}.${tokens[next + 1].value}`;
      next += 2;
    }
    if (Object.hasOwn(KNOWN_MEMBERS, name)) return { value: KNOWN_MEMBERS[name], next };
    /* Calls that return their one argument: `Object.freeze(<literal>)` is the literal it freezes (a
     * shared list), `essential(<text>)` the text it marks for the published output schemas. */
    if (PASS_THROUGH_CALLS.has(name) && isPunct(tokens[next], '(')) {
      const frozen = parseValue(tokens, next + 1);
      if (frozen && isPunct(tokens[frozen.next], ')')) return { value: frozen.value, next: frozen.next + 1 };
    }
    /* A bare identifier may name a constant; the caller resolves it. */
    return { value: { $ref: name }, next };
  }
  if (token.value !== '{' && token.value !== '[') return null;

  const isObject = token.value === '{';
  const close = isObject ? '}' : ']';
  const value = isObject ? {} : [];
  let cursor = index + 1;
  while (cursor < tokens.length && !isPunct(tokens[cursor], close)) {
    if (isPunct(tokens[cursor], ',')) {
      cursor += 1;
      continue;
    }
    if (isPunct(tokens[cursor], '...')) {
      const spread = parseValue(tokens, cursor + 1);
      const complete = spread && isBoundary(tokens[spread.next], close);
      if (complete && !isObject) {
        /* `[...LIST]`: the items of a list, spliced in once constants are known. */
        value.push({ $spread: spread.value });
      } else if (complete && isObject && typeof spread.value?.$ref === 'string') {
        value[SPREADS] = [...(value[SPREADS] ?? []), spread.value];
      } else if (complete && isObject && spread.value && typeof spread.value === 'object') {
        Object.assign(value, spread.value);
      } else if (isObject) {
        /* `...toolText('name')`: the storefront spreads a tool's catalog text into its definition.
         * The call is not evaluated, but the name it reads is recorded so the reader can check it. */
        const call = tokens[cursor + 1];
        if (call?.type === 'identifier' && call.value === 'toolText' && isPunct(tokens[cursor + 2], '(')) {
          value[TEXT_FROM] = tokens[cursor + 3]?.type === 'string' ? tokens[cursor + 3].value : null;
        }
      }
      cursor = complete ? spread.next : skipExpression(tokens, cursor + 1, close);
      continue;
    }
    if (!isObject) {
      const item = parseValue(tokens, cursor);
      if (item && isBoundary(tokens[item.next], close)) {
        value.push(item.value);
        cursor = item.next;
      } else {
        value.push(expressionHole(tokens[cursor]));
        cursor = skipExpression(tokens, cursor, close);
      }
      continue;
    }
    const key = tokens[cursor];
    const isKey = key.type === 'string' || key.type === 'identifier' || key.type === 'literal';
    if (!isKey || !isPunct(tokens[cursor + 1], ':')) {
      /* A shorthand property, a method, or a destructuring default: nothing the reader evaluates. */
      const next = skipExpression(tokens, cursor, close);
      cursor = next === cursor ? cursor + 1 : next;
      continue;
    }
    const item = parseValue(tokens, cursor + 2);
    if (item && isBoundary(tokens[item.next], close)) {
      if (item.value !== undefined) value[String(key.value)] = item.value;
      cursor = item.next;
    } else {
      value[String(key.value)] = expressionHole(tokens[cursor + 2]);
      cursor = skipExpression(tokens, cursor + 2, close);
    }
  }
  return { value, next: cursor + 1 };
}

/**
 * What a module declares at its top level: `const NAME = <literal>` (objects, strings and numbers are
 * all worth resolving — a hole in the extracted schema would compare as unequal to a published bound
 * that is in fact identical), which of them it exports, and the named imports it takes from others.
 */
function readModule(tokens) {
  const constants = new Map();
  const exported = new Set();
  const imports = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'punct') {
      if (OPENERS.has(token.value)) depth += 1;
      else if (CLOSERS.has(token.value)) depth -= 1;
      continue;
    }
    if (depth !== 0 || token.type !== 'identifier') continue;
    if (token.value === 'import') {
      imports.push(...readImport(tokens, index + 1));
      continue;
    }
    const isConst =
      token.value === 'const' && tokens[index + 1]?.type === 'identifier' && tokens[index + 2]?.value === '=';
    if (!isConst) continue;
    const parsed = parseValue(tokens, index + 3);
    const ends = parsed && (parsed.next >= tokens.length || tokens[parsed.next].value === ';');
    const literal =
      ends &&
      (typeof parsed.value === 'number' ||
        typeof parsed.value === 'string' ||
        (typeof parsed.value === 'object' && parsed.value !== null));
    if (!literal) continue;
    const name = tokens[index + 1].value;
    constants.set(name, parsed.value);
    if (tokens[index - 1]?.value === 'export') exported.add(name);
  }
  return { constants, exported, imports };
}

/** `import [Default,] { a, b as c } from 'specifier'` → `[{ imported, local, specifier }]`. */
function readImport(tokens, index) {
  let cursor = index;
  if (tokens[cursor]?.type === 'identifier' && tokens[cursor + 1]?.value === ',') cursor += 2;
  if (tokens[cursor]?.value !== '{') return [];
  const names = [];
  cursor += 1;
  while (cursor < tokens.length && tokens[cursor].value !== '}') {
    if (tokens[cursor].type === 'identifier') {
      const imported = tokens[cursor].value;
      const renamed = tokens[cursor + 1]?.value === 'as' && tokens[cursor + 2]?.type === 'identifier';
      names.push({ imported, local: renamed ? tokens[cursor + 2].value : imported });
      cursor += renamed ? 3 : 1;
      continue;
    }
    cursor += 1;
  }
  const from = tokens[cursor + 1];
  const specifier = tokens[cursor + 2];
  if (from?.value !== 'from' || specifier?.type !== 'string') return [];
  return names.map(name => ({ ...name, specifier: specifier.value }));
}

/* `NAME.key` of a known constant: a property of an object, or a regular expression's `source`/`flags`. */
function memberOf(reference, constants) {
  const [name, ...keys] = reference.split('.');
  let value = constants.get(name);
  for (const key of keys) {
    if (value === undefined || value === null || typeof value !== 'object') return undefined;
    if (typeof value.$regex === 'string') value = { source: value.$regex, flags: value.$flags }[key];
    else value = Object.hasOwn(value, key) ? value[key] : undefined;
  }
  return value;
}

/** Replaces `{ $ref: 'NAME' }`, templates and constant spreads with what the constants say. */
function resolveConstants(value, constants, depth = 0) {
  if (depth > 8 || !value || typeof value !== 'object') return value;
  if (typeof value.$ref === 'string' && Object.keys(value).length === 1) {
    /* An unresolved name stays a `$ref`: the comparison then reports a bound it could not read rather
     * than silently treating it as absent. */
    const resolved = constants.has(value.$ref) ? constants.get(value.$ref) : memberOf(value.$ref, constants);
    return resolved === undefined ? value : resolveConstants(resolved, constants, depth + 1);
  }
  if (Array.isArray(value.$template) && Object.keys(value).length === 1) {
    const parts = value.$template.map(part => resolveConstants(part, constants, depth + 1));
    const whole = parts.every(part => typeof part === 'string' || typeof part === 'number');
    return whole ? parts.join('') : value;
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (!item || typeof item !== 'object' || !Object.hasOwn(item, '$spread')) {
        return [resolveConstants(item, constants, depth + 1)];
      }
      /* A list spread whose list is not known stays a named hole, never an empty list. */
      const list = resolveConstants(item.$spread, constants, depth + 1);
      return Array.isArray(list) ? list : [item];
    });
  }
  const spreads = (value[SPREADS] ?? []).map(spread => resolveConstants(spread, constants, depth + 1));
  const resolved = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveConstants(item, constants, depth + 1)]),
  );
  const merged = Object.assign(
    {},
    ...spreads.filter(spread => spread && typeof spread === 'object' && !('$ref' in spread)),
    resolved,
  );
  if (Object.hasOwn(value, TEXT_FROM)) merged[TEXT_FROM] = value[TEXT_FROM];
  return merged;
}

/** A relative import's target among the files being read, as a repository-relative path. */
/* The storefront bundler's aliases: `modules/…` is js/modules/…, `pages/…` is pages/…. */
const ALIASES = Object.freeze({ 'modules/': 'js/modules/', 'pages/': 'pages/' });

const resolveSpecifier = (fromPath, specifier) => {
  const alias = Object.keys(ALIASES).find(prefix => specifier.startsWith(prefix));
  let target;
  if (alias) target = `${ALIASES[alias]}${specifier.slice(alias.length)}`;
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    target = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  } else return null;
  return posix.extname(target) ? target : `${target}.js`;
};

/** The definitions a module's object literals declare, with its constants (own and imported) resolved. */
function definitionsFrom(tokens, constants) {
  const definitions = [];
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value !== '{') continue;
    const parsed = parseValue(tokens, index);
    if (!parsed) continue;
    const definition = resolveConstants(parsed.value, constants);
    const name = typeof definition?.name === 'string' ? definition.name : null;
    if (!name || !definition.inputSchema || seen.has(name)) continue;
    seen.add(name);
    /* The expression the source writes (`OUTPUT_SCHEMAS.name`), before any constant resolves it. */
    const outputSchemaRef = parsed.value?.outputSchema?.$ref;
    const inputSchemaRef = parsed.value?.inputSchema?.$ref;
    definitions.push({
      name,
      title: typeof definition.title === 'string' ? definition.title : undefined,
      description: typeof definition.description === 'string' ? definition.description : undefined,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
      ...(Object.hasOwn(definition, TEXT_FROM) ? { textFrom: definition[TEXT_FROM] } : {}),
      ...(typeof outputSchemaRef === 'string' ? { outputSchemaRef } : {}),
      ...(typeof inputSchemaRef === 'string' ? { inputSchemaRef } : {}),
    });
  }
  return definitions;
}

/**
 * Reads the tool definitions out of one storefront source file.
 *
 * A definition is any object literal carrying a string `name` and an `inputSchema`: that is what the
 * storefront's page `tools.js` files write and what the shared tool factories return, and it does not
 * depend on where in the file those literals sit. `imported` supplies constants another file exports.
 *
 * @param {string} source
 * @param {Map<string, unknown>} [imported]
 * @returns {Array<{name: string, title?: string, description?: string, inputSchema?: object, annotations?: object, textFrom?: string | null, outputSchemaRef?: string}>}
 */
export function extractToolDefinitions(source, imported = new Map()) {
  const tokens = tokenize(source);
  const { constants } = readModule(tokens);
  return definitionsFrom(tokens, new Map([...imported, ...constants]));
}

/* --------------------------------------------------------------------------------------------- */
/* Reading the storefront                                                                         */
/* --------------------------------------------------------------------------------------------- */

/** A comparable summary of one surface: `name → { title, description, inputSchema, annotations, outputSchema }`. */
export const surfaceIndex = definitions =>
  Object.fromEntries(
    definitions.map(definition => [
      definition.name,
      {
        title: definition.title ?? null,
        description: definition.description ?? null,
        inputSchema: definition.inputSchema ?? null,
        annotations: definition.annotations ?? null,
        outputSchema: definition.outputSchema ?? null,
        /* Contract 1.9: the wording a page type registers instead of `description`, when it has its own. */
        pageDescriptions: definition.pageDescriptions ?? null,
      },
    ]),
  );

/** The input schema and annotations each source module registers, keyed by tool name. */
function readRegisteredTools(root) {
  const modules = STOREFRONT_SOURCES.map(path => {
    const tokens = tokenize(readFileSync(join(root, path), 'utf8'));
    return { path, tokens, ...readModule(tokens) };
  });
  const byPath = new Map(modules.map(module => [module.path, module]));
  /* A module's constants — its own and the ones it imports from another file read here, however many
   * files away they are defined (`export const SORTS = SEARCH_SORTS` re-exports an import). */
  const scopes = new Map();
  const scopeOf = (path, visiting = new Set()) => {
    if (scopes.has(path)) return scopes.get(path);
    const module = byPath.get(path);
    const scope = new Map();
    if (!module || visiting.has(path)) return scope;
    visiting.add(path);
    for (const { imported: name, local, specifier } of module.imports) {
      const target = resolveSpecifier(path, specifier);
      if (!byPath.get(target)?.exported.has(name)) continue;
      const value = scopeOf(target, visiting).get(name);
      if (value !== undefined) scope.set(local, value);
    }
    for (const [name, value] of module.constants) scope.set(name, value);
    const resolved = new Map([...scope].map(([name, value]) => [name, resolveConstants(value, scope)]));
    scopes.set(path, resolved);
    return resolved;
  };
  const registered = new Map();
  for (const module of modules) {
    for (const definition of definitionsFrom(module.tokens, scopeOf(module.path))) {
      if (registered.has(definition.name)) {
        throw new Error(
          `${definition.name} is defined in both ${registered.get(definition.name).path} and ${module.path}`,
        );
      }
      registered.set(definition.name, { ...definition, path: module.path });
    }
  }
  return registered;
}

/**
 * The storefront surface: every tool the generated document lists, with the words and output schema it
 * carries and the input schema and annotations the page modules register, plus a digest of the result.
 *
 * The two halves must describe the same tools, and each registered definition must take its words from
 * the catalog entry of its own name — otherwise the document would not be what the page registers.
 */
export function readStorefrontSurface(root = DEFAULT_STOREFRONT_ROOT) {
  const document = JSON.parse(readFileSync(join(root, STOREFRONT_TOOL_DOCUMENT), 'utf8'));
  const catalog = document?.tools && typeof document.tools === 'object' ? document.tools : {};
  const registered = readRegisteredTools(root);
  const problems = [];
  for (const name of registered.keys()) {
    if (!Object.hasOwn(catalog, name))
      problems.push(`${name}: registered but not in ${STOREFRONT_TOOL_DOCUMENT}`);
  }
  const definitions = [];
  for (const [name, entry] of Object.entries(catalog)) {
    const source = registered.get(name);
    if (!source) {
      problems.push(
        `${name}: in ${STOREFRONT_TOOL_DOCUMENT} but registered by none of ${STOREFRONT_SOURCES.join(', ')}`,
      );
      continue;
    }
    if (
      source.textFrom !== name &&
      (source.title !== entry.title || source.description !== entry.description)
    ) {
      problems.push(`${name}: ${source.path} does not register the catalog text of ${name}`);
    }
    if (source.outputSchemaRef !== undefined && source.outputSchemaRef !== `OUTPUT_SCHEMAS.${name}`) {
      problems.push(`${name}: ${source.path} registers ${source.outputSchemaRef} as its output schema`);
    }
    /* Since registration revision 2026-09-25.12 the input schemas are single-sourced too
     * (js/modules/webmcp/input-schemas.js → the generated document): the page must register the
     * document's schema by name, or write the same schema out. Before, the page's literal is the source. */
    if (
      entry.input_schema &&
      source.inputSchemaRef !== `INPUT_SCHEMAS.${name}` &&
      canonicalJson(source.inputSchema) !== canonicalJson(entry.input_schema)
    ) {
      problems.push(
        `${name}: ${source.path} does not register the input schema ${STOREFRONT_TOOL_DOCUMENT} publishes`,
      );
    }
    definitions.push({
      name,
      title: entry.title,
      description: entry.description,
      inputSchema: entry.input_schema ?? source.inputSchema,
      annotations: source.annotations,
      outputSchema: entry.output_schema,
      ...(entry.page_descriptions
        ? { pageDescriptions: packagePageDescriptions(entry.page_descriptions) }
        : {}),
    });
  }
  if (problems.length) throw new Error(`The storefront surface could not be read:\n${problems.join('\n')}`);
  return {
    root,
    files: STOREFRONT_FILES,
    definitions,
    surface: surfaceIndex(definitions),
    digest: sha256(canonicalJson(definitions)),
  };
}

/** The storefront module that holds both copies of the output schemas. */
export const STOREFRONT_OUTPUT_SCHEMAS = 'js/modules/webmcp/output-schemas.js';

/**
 * The storefront's output schemas, both copies: the strict contract its tests validate every result
 * against (`STRICT_OUTPUT_SCHEMAS`: closed, bounded) and the lean projection its pages register and its
 * manifest serves (`OUTPUT_SCHEMAS`). The module has no imports by design — the storefront's generator
 * runs it in plain Node — so it is evaluated as it is, from its own bytes. Only the snapshot generator
 * calls this; the tests read what it recorded.
 */
export async function loadStorefrontOutputSchemas(root = DEFAULT_STOREFRONT_ROOT) {
  const source = readFileSync(join(root, STOREFRONT_OUTPUT_SCHEMAS));
  const module = await import(`data:text/javascript;base64,${source.toString('base64')}`);
  if (!module.OUTPUT_SCHEMAS) throw new Error(`${STOREFRONT_OUTPUT_SCHEMAS} exports no OUTPUT_SCHEMAS`);
  return {
    sha256: createHash('sha256').update(source).digest('hex'),
    published: JSON.parse(JSON.stringify(module.OUTPUT_SCHEMAS)),
    /* Before 2026-09-25.9 the published schemas were the strict ones. */
    strict: JSON.parse(JSON.stringify(module.STRICT_OUTPUT_SCHEMAS ?? module.OUTPUT_SCHEMAS)),
  };
}

/** The sha256 of every file the surface is read from, as the snapshot records them. */
export const storefrontFileDigests = (root = DEFAULT_STOREFRONT_ROOT) =>
  STOREFRONT_FILES.map(path => ({
    path,
    sha256: createHash('sha256')
      .update(readFileSync(join(root, path)))
      .digest('hex'),
  }));

/**
 * The discovery documents the storefront serves, rendered by its own PHP builder without booting the
 * page framework: `{ webmcp, registry, serverCard, ... }`. `run` is injectable for tests.
 */
export const renderStorefrontManifest = (root = DEFAULT_STOREFRONT_ROOT, run = execFileSync) =>
  JSON.parse(run('php', [join(root, STOREFRONT_PAGE_RENDERER)], { encoding: 'utf8' }));

/**
 * The tools each storefront page type registers, from the manifest the storefront's own PHP builder
 * renders. `run` is injectable so the mapping can be tested without PHP.
 *
 * @returns {{ version: string, pages: Record<string, string[]> }}
 */
export function renderStorefrontPages(root = DEFAULT_STOREFRONT_ROOT, run = execFileSync) {
  const rendered = renderStorefrontManifest(root, run);
  const pages = Object.fromEntries(
    (rendered?.webmcp?.pages ?? []).map(entry => [entry.page, [...(entry.tools ?? [])]]),
  );
  return { version: String(rendered?.webmcp?.version ?? ''), pages };
}

/**
 * The storefront's page types folded onto the package's (`home`, `listing`, `product`). Search,
 * category and hub pages are one listing surface, so they must register the same tools.
 */
export function packagePageTools(pages) {
  const folded = {};
  for (const [page, type] of Object.entries(STOREFRONT_PAGE_TYPES)) {
    const tools = pages[page];
    if (!Array.isArray(tools)) throw new Error(`The storefront manifest lists no tools for the ${page} page`);
    if (folded[type] && JSON.stringify(folded[type]) !== JSON.stringify(tools)) {
      throw new Error(`The ${page} page registers different tools from the other ${type} pages`);
    }
    folded[type] = tools;
  }
  return folded;
}

/**
 * A tool's page wording (`page_descriptions`, by storefront page) keyed by the package's page types.
 * The listing pages are one surface, so a wording they would register differently is refused.
 */
export function packagePageDescriptions(pageDescriptions) {
  const folded = {};
  for (const [page, description] of Object.entries(pageDescriptions ?? {})) {
    const type = STOREFRONT_PAGE_TYPES[page];
    if (!type) throw new Error(`The storefront publishes wording for an unknown page type: ${page}`);
    if (Object.hasOwn(folded, type) && folded[type] !== description) {
      throw new Error(`The ${page} page registers different wording from the other ${type} pages`);
    }
    folded[type] = description;
  }
  return folded;
}

/* --------------------------------------------------------------------------------------------- */
/* Comparison                                                                                     */
/* --------------------------------------------------------------------------------------------- */

/**
 * Field-level parity of the *input contract* between two tool surfaces.
 *
 * A schema is what an agent validates against, and a field present on one surface and missing from the
 * other is the defect this exists to catch. A property's `type` and its numeric/pattern bounds are
 * compared too, because `merchant_id: string` and `merchant_id: integer` are not the same contract.
 * Property descriptions are not compared here, so the same check can hold the storefront's own PHP
 * manifest (which keeps the Node mirror's wording) to the registered inputs; `compareSurfaces` compares
 * everything.
 *
 * @param {Record<string, {inputSchema?: object}>} expected - the source of truth (the storefront)
 * @param {Record<string, {inputSchema?: object}>} actual - the published contract
 * @param {string[]} [only] - compare just these tool names
 * @returns {string[]} differences, empty when the surfaces agree
 */
export function compareInputSurfaces(expected, actual, only) {
  const differences = [];
  const names = only ?? [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const name of names) {
    const source = expected[name];
    const published = actual[name];
    if (!source) {
      differences.push(`${name}: present in the published contract but not in the source of truth`);
      continue;
    }
    if (!published) {
      differences.push(`${name}: present in the source of truth but not in the published contract`);
      continue;
    }
    const sourceSchema = source.inputSchema ?? {};
    const publishedSchema = published.inputSchema ?? {};
    for (const key of ['type', 'additionalProperties']) {
      const sourceValue = sourceSchema[key] ?? null;
      const publishedValue = publishedSchema[key] ?? null;
      if (sourceValue !== publishedValue) {
        differences.push(
          `${name}: inputSchema.${key} ${JSON.stringify(publishedValue)} != ${JSON.stringify(sourceValue)}`,
        );
      }
    }
    const sourceProperties = sourceSchema.properties ?? {};
    const publishedProperties = publishedSchema.properties ?? {};
    const properties = [
      ...new Set([...Object.keys(sourceProperties), ...Object.keys(publishedProperties)]),
    ].sort();
    for (const property of properties) {
      const sourceField = sourceProperties[property];
      const publishedField = publishedProperties[property];
      if (!sourceField) {
        differences.push(`${name}.${property}: published but absent from the source of truth`);
        continue;
      }
      if (!publishedField) {
        differences.push(`${name}.${property}: missing from the published contract`);
        continue;
      }
      for (const constraint of ['type', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern']) {
        const sourceValue = sourceField[constraint] ?? null;
        const publishedValue = publishedField[constraint] ?? null;
        if (sourceValue !== publishedValue) {
          differences.push(
            `${name}.${property}.${constraint}: ${JSON.stringify(publishedValue)} != ${JSON.stringify(sourceValue)}`,
          );
        }
      }
    }
    /* The storefront states some requirements as `minLength` and leaves `required` off; a field the
     * published contract requires that the source of truth does not is a real mismatch. */
    const sourceRequired = new Set(sourceSchema.required ?? []);
    for (const field of publishedSchema.required ?? []) {
      if (!sourceRequired.has(field) && !(sourceProperties[field]?.minLength >= 1)) {
        differences.push(`${name}: published contract requires ${field}, the source of truth does not`);
      }
    }
  }
  return differences;
}

const MAX_PATHS_PER_FIELD = 8;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every path at which `actual` differs from `expected`, as `path: actual != expected`. */
function differingPaths(expected, actual, path, found = []) {
  if (found.length >= MAX_PATHS_PER_FIELD) return found;
  if (isPlainObject(expected) && isPlainObject(actual)) {
    for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
      if (!Object.hasOwn(actual, key)) found.push(`${path}.${key}: missing from the published contract`);
      else if (!Object.hasOwn(expected, key))
        found.push(`${path}.${key}: published but absent from the source of truth`);
      else differingPaths(expected[key], actual[key], `${path}.${key}`, found);
    }
    return found;
  }
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
    for (const [index, item] of expected.entries())
      differingPaths(item, actual[index], `${path}[${index}]`, found);
    return found;
  }
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    found.push(`${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
  return found;
}

/**
 * Full parity between two tool surfaces: the input contract field by field (`compareInputSurfaces`),
 * then every other part of every definition exactly — title, description, annotations, the input
 * schema's remaining words, and the output schema.
 *
 * @param {Record<string, object>} expected - the source of truth (the storefront)
 * @param {Record<string, object>} actual - the published contract
 * @param {string[]} [only] - compare just these tool names
 * @returns {string[]} differences, empty when the surfaces agree
 */
export function compareSurfaces(expected, actual, only) {
  const inputDifferences = compareInputSurfaces(expected, actual, only);
  const differences = [...inputDifferences];
  const names = only ?? [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const name of names) {
    const source = expected[name];
    const published = actual[name];
    if (!source || !published) continue;
    /* Input differences an agent validates against are already named above; what is left of the
     * input schema (descriptions, key sets that check does not read) is compared below. */
    const inputReported = inputDifferences.some(
      difference => difference.startsWith(`${name}.`) || difference.startsWith(`${name}:`),
    );
    for (const field of ['title', 'description']) {
      if ((source[field] ?? null) !== (published[field] ?? null)) {
        differences.push(
          `${name}.${field}: ${JSON.stringify(published[field])} != ${JSON.stringify(source[field])}`,
        );
      }
    }
    for (const field of [
      'annotations',
      'outputSchema',
      'pageDescriptions',
      ...(inputReported ? [] : ['inputSchema']),
    ]) {
      differences.push(
        ...differingPaths(source[field] ?? null, published[field] ?? null, `${name}.${field}`),
      );
    }
  }
  return differences;
}
