/**
 * Deterministic fixture adapter behind the WebMCP demo.
 *
 * Holds a tiny three-phone catalog and the page state (home, listing, product), and implements every
 * contract in contracts.js against it. Nothing here talks to the network.
 */

/** Labels the real BestPrice listing renders; the demo UI imports them so buttons and tools cannot drift. */
export const SORT_OPTIONS = Object.freeze(['Δημοφιλέστερα', 'Φθηνότερα']);
export const BRAND_FILTER = 'Κατασκευαστής';
export const PAGES = Object.freeze(['home', 'listing', 'product']);
export const PRODUCT_CATEGORY = 'Κινητά τηλέφωνα';

/** Non-billable BestPrice landing for a product; only a later merchant choice can create a commercial click. */
export const productUrl = productId => `https://www.bestprice.gr/item/${productId}/product.html?bpref=mcp`;

/** Default result sizes stay below the schema maxima so untouched calls return compact payloads. */
const DEFAULT_LIMITS = { get_visible_products: 6, compare_page_offers: 4, get_product_specifications: 12 };
const MAX_LIMITS = { get_visible_products: 8, compare_page_offers: 4, get_product_specifications: 16 };

const PRODUCTS = [
  {
    product_id: '2159919913',
    title: 'Apple iPhone 16 128GB',
    brand: 'Apple',
    current_min_price_eur: 802,
    merchant_count: 10,
    rating: 4.7,
    rating_count: 412,
    specifications: [
      { section: 'Οθόνη', name: 'Μέγεθος', value: '6,1 ίντσες' },
      { section: 'Αποθήκευση', name: 'Χωρητικότητα', value: '128 GB' },
      { section: 'Συνδεσιμότητα', name: 'Δίκτυο', value: '5G' },
    ],
    offers: [
      {
        merchant: 'Gadgetway',
        item_price_eur: 799,
        shipping_eur: 3,
        delivered_price_eur: 802,
        availability: 'Άμεσα διαθέσιμο',
        merchant_rating: 4.8,
      },
      {
        merchant: 'TechMobile',
        item_price_eur: 804.48,
        shipping_eur: 4,
        delivered_price_eur: 808.48,
        availability: 'Άμεσα διαθέσιμο',
        merchant_rating: 4.6,
      },
      {
        merchant: 'Houseshop',
        item_price_eur: 811.02,
        shipping_eur: null,
        delivered_price_eur: null,
        availability: '1 έως 3 ημέρες',
        merchant_rating: 4.9,
      },
    ],
    history: [780, 815, 799, 829, 802],
  },
  {
    product_id: '2159922965',
    title: 'Samsung Galaxy S24 256GB',
    brand: 'Samsung',
    current_min_price_eur: 689,
    merchant_count: 14,
    rating: 4.6,
    rating_count: 287,
    specifications: [
      { section: 'Οθόνη', name: 'Μέγεθος', value: '6,2 ίντσες' },
      { section: 'Αποθήκευση', name: 'Χωρητικότητα', value: '256 GB' },
      { section: 'Μνήμη', name: 'RAM', value: '8 GB' },
    ],
    offers: [
      {
        merchant: 'OneThing',
        item_price_eur: 685,
        shipping_eur: 4,
        delivered_price_eur: 689,
        availability: 'Άμεσα διαθέσιμο',
        merchant_rating: 4.7,
      },
      {
        merchant: 'Mg Manager',
        item_price_eur: 692,
        shipping_eur: 3.5,
        delivered_price_eur: 695.5,
        availability: '1 έως 3 ημέρες',
        merchant_rating: 4.5,
      },
    ],
    history: [740, 725, 710, 699, 689],
  },
  {
    product_id: '2160384659',
    title: 'Google Pixel 9 128GB',
    brand: 'Google',
    current_min_price_eur: 729,
    merchant_count: 6,
    rating: 4.5,
    rating_count: 94,
    specifications: [
      { section: 'Οθόνη', name: 'Μέγεθος', value: '6,3 ίντσες' },
      { section: 'Αποθήκευση', name: 'Χωρητικότητα', value: '128 GB' },
      { section: 'Κάμερα', name: 'Κύρια κάμερα', value: '50 MP' },
    ],
    offers: [
      {
        merchant: 'MobilePoint',
        item_price_eur: 725,
        shipping_eur: 4,
        delivered_price_eur: 729,
        availability: 'Άμεσα διαθέσιμο',
        merchant_rating: 4.4,
      },
    ],
    history: [799, 785, 765, 745, 729],
  },
];

const clean = value =>
  String(value ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .trim();
const normalize = value => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const fail = error => ({ ok: false, error });
const brands = () => [...new Set(PRODUCTS.map(product => product.brand))];

/** Returns an error result when `args` carries a key outside `allowed`, otherwise null. */
const rejectUnexpected = (args, allowed) => {
  const bad = Object.keys(args).find(key => !allowed.includes(key));
  return bad ? fail(`Unexpected argument: ${bad}.`) : null;
};

/** Resolves a contract 1.7 continuation `offset`, returning `{ offset }` or an error result. */
const readOffset = (args, available) => {
  const offset = args.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return { error: fail('offset must be a non-negative safe whole number.') };
  }
  if (offset > 0 && offset >= available) {
    return { error: fail('offset is beyond what this page shows. Restart with offset: 0.') };
  }
  return { offset };
};
const continuation = (offset, returned, available) => {
  const next = offset + returned < available ? offset + returned : null;
  return { offset, next_offset: next, completeness: next === null ? 'complete' : 'partial' };
};

/** Resolves the `limit` argument for `tool`, returning `{ limit }` or an error result. */
const readLimit = (args, tool) => {
  const limit = args.limit ?? DEFAULT_LIMITS[tool];
  const max = MAX_LIMITS[tool];
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    return { error: fail(`limit must be a whole number from 1 to ${max}.`) };
  }
  return { limit };
};

/**
 * @param {(snapshot: object) => void} [onChange] called after every state change with the new snapshot.
 */
export function createDemoAdapter(onChange = () => {}) {
  const state = {
    page: 'home',
    query: '',
    brand: null,
    sort: SORT_OPTIONS[0],
    activeProductId: PRODUCTS[0].product_id,
    historyVisible: false,
    focusedOffer: null,
  };

  const visibleProducts = () => {
    const query = normalize(state.query);
    const categoryQuery = ['phone', 'mobile', 'κινητο'].some(value => query.includes(value));
    const rows = PRODUCTS.filter(
      product =>
        !query ||
        categoryQuery ||
        normalize(product.title).includes(query) ||
        normalize(product.brand).includes(query),
    ).filter(product => !state.brand || product.brand === state.brand);
    return state.sort === 'Φθηνότερα'
      ? [...rows].sort((left, right) => left.current_min_price_eur - right.current_min_price_eur)
      : rows;
  };
  const activeProduct = () =>
    PRODUCTS.find(product => product.product_id === state.activeProductId) ?? PRODUCTS[0];
  const snapshot = () => ({ ...state, products: visibleProducts(), product: activeProduct() });
  const changed = () => onChange(snapshot());

  const setPage = page => {
    if (!PAGES.includes(page)) throw new TypeError(`Unknown page: ${page}`);
    state.page = page;
    changed();
  };

  /** One handler per contract; each receives already-validated-as-object `args`. */
  const handlers = {
    search_bestprice(args) {
      const query = clean(args.query);
      if (query.length < 2 || query.length > 120) return fail('query must contain 2 to 120 characters.');
      state.query = query;
      state.brand = null;
      state.page = 'listing';
      changed();
      return { ok: true, action: 'started_product_search', query };
    },

    get_visible_products(args) {
      const { limit, error } = readLimit(args, 'get_visible_products');
      if (error) return error;
      const rows = visibleProducts();
      const { offset, error: offsetError } = readOffset(args, rows.length);
      if (offsetError) return offsetError;
      /* Like the storefront since contract 1.7: a list read does not repeat each product link;
       * open_visible_product takes the product_id and returns the landing itself. */
      const products = rows
        .slice(offset, offset + limit)
        .map(({ offers, history, specifications, brand, ...product }) => product);
      return {
        ok: true,
        source: 'BestPrice listing page',
        shown_products: rows.length,
        returned: products.length,
        ...continuation(offset, products.length, rows.length),
        products,
      };
    },

    open_visible_product(args) {
      const productId = clean(args.product_id);
      const product = visibleProducts().find(row => row.product_id === productId);
      if (!product) return fail(`Product ${productId} is not currently visible on this page.`);
      state.activeProductId = product.product_id;
      state.page = 'product';
      changed();
      return {
        ok: true,
        action: 'opened_visible_product',
        product_id: product.product_id,
        title: product.title,
        bestprice_url: productUrl(product.product_id),
      };
    },

    get_listing_filters(args) {
      const group = {
        key: 'brand',
        name: BRAND_FILTER,
        selected_values: state.brand ? [state.brand] : [],
        available_values: brands().filter(brand => brand !== state.brand),
      };
      if (args.group !== undefined && ![group.key, normalize(BRAND_FILTER)].includes(normalize(args.group))) {
        return fail(`The filter '${clean(args.group)}' was not found on this listing.`);
      }
      const total = args.group === undefined ? 1 : group.available_values.length;
      const { offset, error } = readOffset(args, total);
      if (error) return error;
      if (args.group !== undefined) {
        const values = group.available_values.slice(offset);
        return {
          ok: true,
          source: 'BestPrice listing filters',
          returned: 1,
          total_values: total,
          ...continuation(offset, values.length, total),
          filters: [{ ...group, available_values: values }],
        };
      }
      return {
        ok: true,
        source: 'BestPrice listing filters',
        returned: 1,
        total_groups: 1,
        ...continuation(offset, 1, 1),
        filters: [group],
      };
    },

    apply_listing_filter(args) {
      const filter = normalize(args.filter);
      if (filter !== normalize(BRAND_FILTER) && filter !== 'brand') {
        return fail(`Only the visible '${BRAND_FILTER}' filter is available on this page.`);
      }
      const brand = brands().find(value => normalize(value) === normalize(args.value));
      if (!brand) return fail(`The visible value '${clean(args.value)}' was not found.`);
      state.brand = brand;
      changed();
      return { ok: true, action: 'applied_filter', filter: BRAND_FILTER, value: brand };
    },

    clear_listing_filters() {
      state.brand = null;
      changed();
      return { ok: true, action: 'cleared_listing_filters' };
    },

    get_listing_sort_options() {
      return {
        ok: true,
        source: 'BestPrice listing sorting',
        sorting: SORT_OPTIONS.map(value => ({ name: value, selected: value === state.sort })),
      };
    },

    apply_listing_sort(args) {
      const sort = SORT_OPTIONS.find(value => normalize(value) === normalize(args.sort));
      if (!sort) return fail(`The sorting option '${clean(args.sort)}' was not found.`);
      state.sort = sort;
      changed();
      return { ok: true, action: 'applied_sorting', sort };
    },

    get_page_product() {
      const product = activeProduct();
      const { offers, history, specifications, brand, merchant_count, ...facts } = product;
      return {
        ok: true,
        source: 'BestPrice item page',
        ...facts,
        category: PRODUCT_CATEGORY,
        offer_count: merchant_count,
        bestprice_url: productUrl(product.product_id),
      };
    },

    compare_page_offers(args) {
      const { limit, error } = readLimit(args, 'compare_page_offers');
      if (error) return error;
      if (args.include_all_stores !== undefined && typeof args.include_all_stores !== 'boolean') {
        return fail('include_all_stores must be true or false.');
      }
      const product = activeProduct();
      /* The fixture renders every store, so there is never a «Όλες οι τιμές» to press. */
      return {
        ok: true,
        source: 'BestPrice item page',
        product_id: product.product_id,
        compared: Math.min(limit, product.offers.length),
        stores_total: product.offers.length,
        stores_considered: product.offers.length,
        offers: product.offers.slice(0, limit),
        note: 'Unknown shipping remains unknown. The shopper chooses the merchant.',
      };
    },

    get_product_specifications(args) {
      const { limit, error } = readLimit(args, 'get_product_specifications');
      if (error) return error;
      const product = activeProduct();
      const section = normalize(args.section ?? 'all');
      const inSection = product.specifications.filter(
        row => section === 'all' || normalize(row.section).includes(section),
      );
      if (args.fact !== undefined && args.offset !== undefined) {
        return fail('offset must be a non-negative safe whole number; do not combine it with fact.');
      }
      if (args.fact !== undefined) {
        const named = inSection.filter(row => normalize(row.name) === normalize(args.fact));
        const sections = [...new Set(named.map(row => row.section))];
        if (sections.length > 1) {
          return fail(
            `More than one section has the fact '${clean(args.fact)}'. Pass one of these sections: ${sections.join(', ')}.`,
          );
        }
        if (!named.length) return fail(`The specification fact '${clean(args.fact)}' was not found.`);
        return {
          ok: true,
          source: 'BestPrice product specifications',
          product_id: product.product_id,
          returned: named.length,
          specifications: named,
        };
      }
      if (!inSection.length) return fail(`No specifications matched '${clean(args.section)}'.`);
      const { offset, error: offsetError } = readOffset(args, inSection.length);
      if (offsetError) return offsetError;
      const rows = inSection.slice(offset, offset + limit);
      const { completeness, ...position } = continuation(offset, rows.length, inSection.length);
      return {
        ok: true,
        source: 'BestPrice product specifications',
        product_id: product.product_id,
        returned: rows.length,
        total_facts: inSection.length,
        ...position,
        completeness,
        specifications: rows,
      };
    },

    summarize_price_history() {
      const product = activeProduct();
      const first = product.history[0];
      const current = product.current_min_price_eur;
      const changePct = Math.round(((current - first) / first) * 1000) / 10;
      const direction = changePct < -1 ? 'down' : changePct > 1 ? 'up' : 'stable';
      return {
        ok: true,
        source: 'BestPrice price history',
        product_id: product.product_id,
        observations: product.history.length,
        current_min_price_eur: current,
        historical_low_eur: Math.min(...product.history),
        historical_high_eur: Math.max(...product.history),
        change_from_first_pct: changePct,
        direction_from_first: direction,
      };
    },

    show_offer(args) {
      const merchantId = clean(args.merchant_id);
      const merchantName = clean(args.merchant_name);
      if (!merchantId && !merchantName) {
        return fail('Provide merchant_id or merchant_name from compare_page_offers.');
      }
      if (merchantId && !/^\d{1,20}$/u.test(merchantId)) {
        return fail('merchant_id must be the numeric id shown on this page.');
      }
      /* Demo offers carry no ids, and compare_page_offers does not return them,
       * so the merchant name is the only addressable key here. */
      const offer = merchantId
        ? undefined
        : activeProduct().offers.find(candidate => normalize(candidate.merchant) === normalize(merchantName));
      if (!offer) return fail('That merchant is not currently shown on this page.');
      state.focusedOffer = offer.merchant;
      changed();
      return { ok: true, action: 'focused_offer', offer };
    },

    show_price_history() {
      state.historyVisible = true;
      changed();
      return { ok: true, action: 'opened_price_history', product_id: activeProduct().product_id };
    },
  };

  /** Argument names each tool accepts; anything else is rejected before the handler runs. */
  const ACCEPTED_ARGS = {
    search_bestprice: ['query'],
    get_visible_products: ['limit', 'offset'],
    open_visible_product: ['product_id'],
    get_listing_filters: ['group', 'offset'],
    apply_listing_filter: ['filter', 'value'],
    clear_listing_filters: [],
    get_listing_sort_options: [],
    apply_listing_sort: ['sort'],
    get_page_product: [],
    compare_page_offers: ['limit', 'include_all_stores'],
    get_product_specifications: ['section', 'limit', 'fact', 'offset'],
    summarize_price_history: [],
    show_offer: ['merchant_id', 'merchant_name'],
    show_price_history: [],
  };

  const execute = async (name, args = {}) => {
    if (!args || typeof args !== 'object' || Array.isArray(args))
      return fail('Arguments must be a JSON object.');
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!handler) return fail(`Unknown tool: ${clean(name)}.`);
    return rejectUnexpected(args, ACCEPTED_ARGS[name]) ?? handler(args);
  };

  return { execute, setPage, snapshot };
}
