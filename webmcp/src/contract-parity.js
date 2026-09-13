/**
 * Contract parity: the published contract against the page that actually registers the tools.
 *
 * Round 4 found `show_offer` on the item page advertising an `offer_ref` that the agent is told to
 * prefer, while `webmcp/src/contracts.js` — and every consumer of it — declared only `merchant_id` and
 * `merchant_name` with `additionalProperties: false`. Names, counts and version strings all agreed;
 * the field did not. A schema is a set of fields, so parity has to be checked field by field, in both
 * directions, including each field's type and bounds.
 *
 * The storefront is the source of truth for what a page registers, and it lives in another repository
 * (`bestprice.gr/pages/item/webmcp/tools.js` and the shared `js/modules/webmcp/search-tool.js`). Two
 * mechanisms keep this honest without a cross-repo build step:
 *
 * - `webmcp/test/fixtures/storefront-tools.v1.json` is a committed snapshot of exactly what the
 *   extraction below reads, including the sha256 of the extracted definitions. The parity test always
 *   runs against the snapshot, so the suite is hermetic and a missing sibling checkout cannot silently
 *   skip the check;
 * - when the sibling checkout *is* present, the test re-extracts it and fails if the snapshot has
 *   drifted — which keeps the snapshot a transcription rather than a memory.
 *
 * `extractToolDefinitions` is a reader over the source, not an import: the storefront modules import
 * helpers, DOM globals and navigation, so loading them here would neither work nor prove anything
 * about the surface a browser registers. It tokenizes the file (strings with escapes, template
 * literals, comments, regular expressions) and reads the object literals that carry both a `name` and
 * an `inputSchema`, resolving module-scope schema constants such as `EMPTY_SCHEMA`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson, sha256 } from '../evals/run-evidence.js';

/** Where the storefront keeps the item-page tools and the shared search tool. */
export const STOREFRONT_FILES = Object.freeze([
  'pages/item/webmcp/tools.js',
  'js/modules/webmcp/search-tool.js',
]);

export const DEFAULT_STOREFRONT_ROOT =
  process.env.BESTPRICE_STOREFRONT_ROOT ?? join(process.cwd(), '..', 'bestprice.gr');

/* --------------------------------------------------------------------------------------------- */
/* Tokenizer                                                                                      */
/* --------------------------------------------------------------------------------------------- */

const IDENTIFIER = /^[A-Za-z_$][\w$]*/u;
const REGEX_PREFIX_TOKENS = Object.freeze([')', ']', '}']);

/**
 * Splits JavaScript source into the tokens this reader needs: punctuation, identifiers, string and
 * template literals, and numbers. Comments and regular-expression literals are consumed and dropped.
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
      index = skipRegex(source, index);
      continue;
    }
    if (char === "'" || char === '"') {
      const end = findStringEnd(source, index);
      tokens.push({
        type: 'string',
        value: decodeEscapes(source.slice(index + 1, end)),
        start: index,
        end: end + 1,
      });
      index = end + 1;
      continue;
    }
    if (char === '`') {
      const end = findTemplateEnd(source, index);
      const body = source.slice(index + 1, end);
      /* A template with a substitution is not a literal this reader evaluates. */
      tokens.push({
        type: body.includes('${') ? 'unknown' : 'string',
        value: body,
        start: index,
        end: end + 1,
      });
      index = end + 1;
      continue;
    }
    const identifier = IDENTIFIER.exec(source.slice(index));
    if (identifier) {
      const [name] = identifier;
      if (name === 'true' || name === 'false') {
        tokens.push({ type: 'literal', value: name === 'true', start: index, end: index + name.length });
      } else if (name === 'null') {
        tokens.push({ type: 'literal', value: null, start: index, end: index + name.length });
      } else if (name === 'undefined') {
        tokens.push({ type: 'literal', value: undefined, start: index, end: index + name.length });
      } else {
        tokens.push({ type: 'identifier', value: name, start: index, end: index + name.length });
      }
      index += name.length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/u.exec(source.slice(index));
    if (number) {
      tokens.push({ type: 'literal', value: Number(number[0]), start: index, end: index + number[0].length });
      index += number[0].length;
      continue;
    }
    tokens.push({ type: 'punct', value: char, start: index, end: index + 1 });
    index += 1;
  }
  return tokens;
}

/* A `/` starts a regular expression unless the previous token can end an expression. */
function startsRegex(tokens) {
  const previous = tokens.at(-1);
  if (!previous) return true;
  if (previous.type === 'identifier' || previous.type === 'literal' || previous.type === 'string')
    return false;
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

function findTemplateEnd(source, index) {
  for (let cursor = index + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === '\\') {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '`') return cursor;
  }
  return source.length - 1;
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

/** Reads a value starting at token `index`; returns `{ value, next }` or null when it is not a literal. */
function parseValue(tokens, index) {
  const token = tokens[index];
  if (!token) return null;
  if (token.type === 'literal' || token.type === 'string') return { value: token.value, next: index + 1 };
  if (token.type === 'identifier') {
    /* A bare identifier may name a schema constant; the caller resolves it. */
    return { value: { $ref: token.value }, next: index + 1 };
  }
  if (token.value !== '{' && token.value !== '[') return null;

  const isObject = token.value === '{';
  const close = isObject ? '}' : ']';
  const value = isObject ? {} : [];
  let cursor = index + 1;
  while (cursor < tokens.length && tokens[cursor].value !== close) {
    if (tokens[cursor].value === ',') {
      cursor += 1;
      continue;
    }
    if (!isObject) {
      const item = parseValue(tokens, cursor);
      if (!item) break;
      value.push(item.value);
      cursor = item.next;
      continue;
    }
    if (tokens[cursor].value === '...') {
      const spread = parseValue(tokens, cursor + 1);
      if (spread && typeof spread.value === 'object' && spread.value !== null)
        Object.assign(value, spread.value);
      cursor = spread ? spread.next : cursor + 1;
      continue;
    }
    const key = tokens[cursor];
    const isKey = key.type === 'string' || key.type === 'identifier' || key.type === 'literal';
    if (!isKey || tokens[cursor + 1]?.value !== ':') {
      cursor += 1;
      continue;
    }
    const item = parseValue(tokens, cursor + 2);
    if (!item) {
      cursor += 2;
      continue;
    }
    if (item.value !== undefined) value[String(key.value)] = item.value;
    cursor = item.next;
  }
  return { value, next: cursor + 1 };
}

/** Module-scope `const NAME = <literal>` declarations, so a schema constant can be resolved. */
function readModuleConstants(tokens) {
  const constants = new Map();
  for (let index = 0; index < tokens.length - 3; index += 1) {
    const isConst =
      tokens[index].type === 'identifier' &&
      tokens[index].value === 'const' &&
      tokens[index + 1]?.type === 'identifier' &&
      tokens[index + 2]?.value === '=';
    if (!isConst) continue;
    const value = parseValue(tokens, index + 3);
    /* Objects (a shared schema) and numbers (a shared bound, e.g. `maxLength: MAX_QUERY_LENGTH`) are
     * both worth resolving: a hole in the extracted schema would compare as unequal to a published
     * bound that is in fact identical. */
    if (
      value &&
      (typeof value.value === 'number' || (typeof value.value === 'object' && value.value !== null))
    ) {
      constants.set(tokens[index + 1].value, value.value);
    }
  }
  return constants;
}

/** Replaces `{ $ref: 'NAME' }` with the constant it names. */
function resolveConstants(value, constants, depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return value;
  if (typeof value.$ref === 'string' && Object.keys(value).length === 1) {
    /* An unresolved name stays a `$ref`: the comparison then reports a bound it could not read rather
     * than silently treating it as absent. */
    const resolved = constants.get(value.$ref);
    return resolved === undefined ? value : resolved;
  }
  if (Array.isArray(value)) return value.map(item => resolveConstants(item, constants, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, resolveConstants(item, constants, depth + 1)]),
  );
}

/**
 * Reads the tool definitions out of a storefront source file.
 *
 * A definition is any object literal carrying a string `name` and an `inputSchema`: that is what the
 * storefront's `tools.js` writes for the item page and what `search-tool.js`'s factory returns, and it
 * does not depend on where in the file those literals sit.
 *
 * @param {string} source
 * @returns {Array<{name: string, title?: string, description?: string, inputSchema?: object, annotations?: object}>}
 */
export function extractToolDefinitions(source) {
  const tokens = tokenize(source);
  const constants = readModuleConstants(tokens);
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
    definitions.push({
      name,
      title: typeof definition.title === 'string' ? definition.title : undefined,
      description: typeof definition.description === 'string' ? definition.description : undefined,
      inputSchema: definition.inputSchema,
      annotations: definition.annotations,
    });
  }
  return definitions;
}

/* --------------------------------------------------------------------------------------------- */
/* Comparison                                                                                     */
/* --------------------------------------------------------------------------------------------- */

/** A comparable summary of one surface: `name → { title, description, inputSchema, annotations }`. */
export const surfaceIndex = definitions =>
  Object.fromEntries(
    definitions.map(definition => [
      definition.name,
      {
        title: definition.title ?? null,
        description: definition.description ?? null,
        inputSchema: definition.inputSchema ?? null,
        annotations: definition.annotations ?? null,
      },
    ]),
  );

/**
 * The storefront snapshot: what the extraction above reads out of the sibling checkout, plus the
 * digest of the extracted definitions so a drift in the source is visible as a digest change.
 */
export function readStorefrontSurface(root = DEFAULT_STOREFRONT_ROOT, files = STOREFRONT_FILES) {
  const sources = files.map(relative => ({ relative, text: readFileSync(join(root, relative), 'utf8') }));
  const definitions = sources.flatMap(source => extractToolDefinitions(source.text));
  return {
    root,
    files,
    definitions,
    surface: surfaceIndex(definitions),
    digest: sha256(canonicalJson(definitions)),
  };
}

/**
 * Field-level parity between two tool surfaces.
 *
 * Only the *input contract* is compared: a schema is what an agent validates against, and a field
 * present on one surface and missing from the other is the defect this exists to catch. A property's
 * `type` and its numeric/pattern bounds are compared too, because `merchant_id: string` and
 * `merchant_id: integer` are not the same contract. Descriptions are deliberately excluded — their
 * wording is editorial and the published contract keeps its own voice.
 *
 * Annotations are excluded as well: the storefront is written against a newer `ToolAnnotations` draft
 * (`consequentialHint`) than the published 14-tool contract (`destructiveHint`, `idempotentHint`,
 * `openWorldHint`). That is a versioning decision for the annotations surface, not a missing input
 * field, and `webmcp.test.js` covers annotations separately.
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
