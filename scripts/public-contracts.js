/** Public result checks. Diagnostics only: not a substitute for independent shopper qualification. */
import { isDeepStrictEqual } from 'node:util';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

export const PUBLIC_TOOLS = Object.freeze([
  'compare_offers',
  'get_price_history',
  'get_shopping_decision',
  'search_products',
]);
const MIRROR = '\nStructured result (JSON):\n';
export class IntegrityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'IntegrityError';
    this.code = code;
  }
}
const check = (condition, code) => {
  if (!condition) throw new IntegrityError(code);
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function cents(value) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'INVALID_MONEY');
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  check(Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 1e-6, 'INVALID_CENT_PRECISION');
  return rounded;
}

export function verifyMirror(result) {
  check(record(result?.structuredContent), 'MISSING_STRUCTURED_OUTPUT');
  const texts = (result.content ?? []).filter(item => item.type === 'text');
  check(texts.length === 1 && typeof texts[0].text === 'string', 'AMBIGUOUS_TEXT_MIRROR');
  const text = texts[0].text;
  const index = text.indexOf(MIRROR);
  const raw = index < 0 ? text : text.slice(index + MIRROR.length);
  let mirror;
  try {
    mirror = JSON.parse(raw);
  } catch {
    throw new IntegrityError('INVALID_TEXT_MIRROR');
  }
  check(isDeepStrictEqual(mirror, result.structuredContent), 'TEXT_MIRROR_MISMATCH');
}

export function verifyPublicLinks(output) {
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    check(!seen.has(value), 'CYCLIC_OUTPUT');
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && /url$/iu.test(key)) {
        let url;
        try {
          url = new URL(child);
        } catch {
          throw new IntegrityError('INVALID_PUBLIC_URL');
        }
        check(
          url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash,
          'UNSAFE_PUBLIC_URL',
        );
        const allowed =
          (key === 'bestprice_url' &&
            url.hostname === 'www.bestprice.gr' &&
            !url.search &&
            /^\/agent\/r\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(url.pathname)) ||
          (key === 'image_url' && url.hostname === 'abpcdn.pstatic.gr') ||
          (key === 'merchant_logo_url' &&
            url.hostname === 'orig-bpcdn.pstatic.gr' &&
            !url.search &&
            /^\/bpmerchants\/[0-9]+\.svg$/u.test(url.pathname));
        check(allowed, 'UNAPPROVED_PUBLIC_URL');
      } else visit(child);
    }
    seen.delete(value);
  };
  visit(output);
}

export function verifyOfferMoney(offer) {
  const item = cents(offer.item_price);
  if (offer.shipping_status === 'unknown') {
    check(offer.shipping_price === null && offer.total_price === null, 'UNKNOWN_SHIPPING_BECAME_MONEY');
  } else {
    check(['known', 'estimated'].includes(offer.shipping_status), 'INVALID_SHIPPING_STATUS');
    check(item + cents(offer.shipping_price) === cents(offer.total_price), 'DELIVERED_TOTAL_MISMATCH');
  }
}

/** Compile the live published schemas. Never replace them with weaker hand-written schemas. */
export function createToolVerifier(tools) {
  check(Array.isArray(tools), 'MISSING_TOOL_INVENTORY');
  check(isDeepStrictEqual(tools.map(tool => tool.name).sort(), [...PUBLIC_TOOLS]), 'TOOL_INVENTORY_DRIFT');
  const validators = new Map();
  for (const tool of tools) {
    check(record(tool.inputSchema) && record(tool.outputSchema), 'MISSING_TOOL_SCHEMA');
    check(
      tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false,
      'UNSAFE_TOOL_ANNOTATIONS',
    );
    // Separate compilers prevent one schema's $id from shadowing another tool's schema.
    validators.set(tool.name, {
      input: new AjvJsonSchemaValidator().getValidator(tool.inputSchema),
      output: new AjvJsonSchemaValidator().getValidator(tool.outputSchema),
    });
  }
  return {
    input(name, args) {
      check(validators.has(name), 'UNKNOWN_TOOL');
      check(validators.get(name).input(args).valid, 'INPUT_SCHEMA_INVALID');
    },
    output(name, args, result) {
      this.input(name, args);
      check(result?.isError !== true, 'TOOL_RETURNED_ERROR');
      verifyMirror(result);
      const value = result.structuredContent;
      check(validators.get(name).output(value).valid, 'OUTPUT_SCHEMA_INVALID');
      check(!Object.hasOwn(value, 'error'), 'ERROR_ENVELOPE_AS_SUCCESS');
      check(value.currency === 'EUR' && value.locale === 'el-GR', 'MARKET_DRIFT');
      check(!Object.hasOwn(value, 'request_id'), 'INTERNAL_IDENTIFIER_EXPOSED');
      verifyPublicLinks(value);
      if (name === 'search_products') {
        check(
          Array.isArray(value.products) &&
            value.products.length > 0 &&
            value.products.length <= (args.limit ?? 8),
          'SEARCH_RESULT_BOUND',
        );
        check(
          new Set(value.products.map(product => product.product_id)).size === value.products.length,
          'DUPLICATE_PRODUCT_ID',
        );
        for (const product of value.products) {
          if (product.price_from !== null) {
            const price = cents(product.price_from);
            check(args.price_max == null || price <= cents(args.price_max), 'HARD_MAX_PRICE_BREACH');
            check(args.price_min == null || price >= cents(args.price_min), 'HARD_MIN_PRICE_BREACH');
          }
        }
      } else if (name === 'compare_offers') {
        check(value.product?.product_id === args.product_id, 'OFFER_PRODUCT_MISMATCH');
        check(value.postal_code === (args.postal_code ?? null), 'OFFER_POSTCODE_MISMATCH');
        check(
          Array.isArray(value.offers) && value.offers.length > 0 && value.offers.length <= (args.limit ?? 10),
          'OFFER_RESULT_BOUND',
        );
        check(
          new Set(value.offers.map(offer => offer.offer_id)).size === value.offers.length,
          'DUPLICATE_OFFER_ID',
        );
        for (const offer of value.offers) verifyOfferMoney(offer);
      } else if (name === 'get_price_history') {
        check(value.product_id === args.product_id, 'HISTORY_PRODUCT_MISMATCH');
        check(value.period_days === (args.period_days ?? 180), 'HISTORY_WINDOW_MISMATCH');
        check(value.methodology_id === 'bestprice_daily_min_v1', 'HISTORY_METHODOLOGY_DRIFT');
      } else if (name === 'get_shopping_decision') {
        check(value.outcome === 'recommendation', 'NO_RECOMMENDATION');
        check(
          value.products?.some(product => product.product_id === value.recommended_product_id),
          'RECOMMENDED_PRODUCT_MISSING',
        );
        check(
          value.evidence?.claims?.length > 0 && value.price_verdict?.predicts_future_price === false,
          'DECISION_EVIDENCE_MISSING',
        );
      }
      return value;
    },
  };
}
