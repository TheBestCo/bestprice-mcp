/**
 * A small, strict JSON Schema checker for the WebMCP output schemas (tests only).
 *
 * The same closed subset of draft 2020-12 the storefront checks its own tool results with
 * (bestprice.gr `js/modules/webmcp/output-schema-check.js`), so a result that passes here passes there.
 * Strict in both directions: a value that breaks a rule fails, and a SCHEMA that uses a keyword outside
 * the subset throws — a keyword this checker ignored would be a rule nobody enforces.
 */

export const ANNOTATIONS = new Set(['title', 'description', 'default', 'examples', '$comment']);
export const KEYWORDS = new Set([
  'type',
  'const',
  'enum',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'oneOf',
  'anyOf',
]);
const FORMATS = {
  uri: value => {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  date: value => /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
};

const typeOf = value => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};
const matchesType = (value, type) => {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** Returns every violation of `schema` by `value`, as `path: message`; empty when the value fits. */
export function validate(schema, value, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new TypeError(`${path}: not a schema`);
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key))
      throw new TypeError(`${path}: unsupported keyword ${key}`);
  }
  if (schema.format && !FORMATS[schema.format])
    throw new TypeError(`${path}: unsupported format ${schema.format}`);
  const errors = [];
  const fail = message => errors.push(`${path}: ${message}`);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => matchesType(value, type))) {
      fail(`expected ${types.join('|')}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if ('const' in schema && !same(value, schema.const)) fail(`expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(option => same(option, value)))
    fail(`${JSON.stringify(value)} not in enum`);

  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) fail(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && length > schema.maxLength) fail(`longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
      fail(`does not match ${schema.pattern}`);
    if (schema.format && !FORMATS[schema.format](value)) fail(`not a ${schema.format}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      fail(`not above ${schema.exclusiveMinimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      fail(`fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      fail(`more than ${schema.maxItems} items`);
    if (schema.items) {
      for (const [index, item] of value.entries())
        errors.push(...validate(schema.items, item, `${path}[${index}]`));
    }
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties && key in schema.properties) {
        errors.push(...validate(schema.properties[key], item, `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        fail(`unexpected property ${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        errors.push(...validate(schema.additionalProperties, item, `${path}.${key}`));
      }
    }
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((branch, index) => validate(branch, value, `${path}<oneOf ${index}>`));
    const passing = results.filter(result => !result.length).length;
    if (passing !== 1) {
      fail(`matches ${passing} of oneOf`);
      if (!passing) errors.push(...results.flat());
    }
  }
  if (schema.anyOf) {
    const results = schema.anyOf.map((branch, index) => validate(branch, value, `${path}<anyOf ${index}>`));
    if (!results.some(result => !result.length)) {
      fail('matches no anyOf branch');
      errors.push(...results.flat());
    }
  }
  return errors;
}
