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
      { merchant: 'Gadgetway', item_price_eur: 799, shipping_eur: 3, delivered_price_eur: 802, availability: 'Άμεσα διαθέσιμο', merchant_rating: 4.8 },
      { merchant: 'TechMobile', item_price_eur: 804.48, shipping_eur: 4, delivered_price_eur: 808.48, availability: 'Άμεσα διαθέσιμο', merchant_rating: 4.6 },
      { merchant: 'Houseshop', item_price_eur: 811.02, shipping_eur: null, delivered_price_eur: null, availability: '1 έως 3 ημέρες', merchant_rating: 4.9 },
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
      { merchant: 'OneThing', item_price_eur: 685, shipping_eur: 4, delivered_price_eur: 689, availability: 'Άμεσα διαθέσιμο', merchant_rating: 4.7 },
      { merchant: 'Mg Manager', item_price_eur: 692, shipping_eur: 3.5, delivered_price_eur: 695.5, availability: '1 έως 3 ημέρες', merchant_rating: 4.5 },
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
      { merchant: 'MobilePoint', item_price_eur: 725, shipping_eur: 4, delivered_price_eur: 729, availability: 'Άμεσα διαθέσιμο', merchant_rating: 4.4 },
    ],
    history: [799, 785, 765, 745, 729],
  },
];

const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
const normalize = value => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const unexpected = (args, allowed) => Object.keys(args ?? {}).find(key => !allowed.includes(key));

export function createDemoAdapter(onChange = () => {}) {
  const state = { page: 'home', query: '', brand: null, sort: 'Δημοφιλέστερα', activeProductId: PRODUCTS[0].product_id, historyVisible: false };

  const visibleProducts = () => {
    const query = normalize(state.query);
    const categoryQuery = ['phone', 'mobile', 'κινητο'].some(value => query.includes(value));
    const rows = PRODUCTS.filter(product => !query || categoryQuery || normalize(product.title).includes(query) || normalize(product.brand).includes(query))
      .filter(product => !state.brand || product.brand === state.brand);
    return state.sort === 'Φθηνότερα'
      ? [...rows].sort((left, right) => left.current_min_price_eur - right.current_min_price_eur)
      : rows;
  };
  const activeProduct = () => PRODUCTS.find(product => product.product_id === state.activeProductId) ?? PRODUCTS[0];
  const changed = () => onChange(snapshot());
  const snapshot = () => ({ ...state, products: visibleProducts(), product: activeProduct() });
  const setPage = page => {
    if (!['home', 'listing', 'product'].includes(page)) throw new TypeError(`Unknown page: ${page}`);
    state.page = page;
    changed();
  };

  const execute = async (name, args = {}) => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'Arguments must be a JSON object.' };
    let bad;
    switch (name) {
      case 'search_bestprice': {
        bad = unexpected(args, ['query']);
        const query = clean(args.query);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        if (query.length < 2 || query.length > 120) return { ok: false, error: 'query must contain 2 to 120 characters.' };
        state.query = query;
        state.brand = null;
        state.page = 'listing';
        changed();
        return { ok: true, action: 'started_product_search', query };
      }
      case 'get_visible_products': {
        bad = unexpected(args, ['limit']);
        const limit = args.limit ?? 6;
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        if (!Number.isInteger(limit) || limit < 1 || limit > 8) return { ok: false, error: 'limit must be a whole number from 1 to 8.' };
        const products = visibleProducts().slice(0, limit).map(({ offers, history, specifications, ...product }) => ({
          ...product,
          bestprice_url: `https://www.bestprice.gr/item/${product.product_id}/product.html?bpref=mcp`,
        }));
        return { ok: true, source: 'BestPrice listing page', returned: products.length, products };
      }
      case 'open_visible_product': {
        bad = unexpected(args, ['product_id']);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        const product = visibleProducts().find(row => row.product_id === clean(args.product_id));
        if (!product) return { ok: false, error: `Product ${clean(args.product_id)} is not currently visible on this page.` };
        state.activeProductId = product.product_id;
        state.page = 'product';
        changed();
        return { ok: true, action: 'opened_visible_product', product_id: product.product_id, title: product.title };
      }
      case 'get_listing_filters':
        return { ok: true, source: 'BestPrice listing filters', filters: [{ key: 'brand', name: 'Κατασκευαστής', selected_values: state.brand ? [state.brand] : [], available_values: [...new Set(PRODUCTS.map(product => product.brand))].filter(brand => brand !== state.brand) }] };
      case 'apply_listing_filter': {
        bad = unexpected(args, ['filter', 'value']);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        if (normalize(args.filter) !== 'κατασκευαστης' && normalize(args.filter) !== 'brand') return { ok: false, error: 'Only the visible Κατασκευαστής filter is available in this fixture.' };
        const brand = [...new Set(PRODUCTS.map(product => product.brand))].find(value => normalize(value) === normalize(args.value));
        if (!brand) return { ok: false, error: `The visible value '${clean(args.value)}' was not found.` };
        state.brand = brand;
        changed();
        return { ok: true, action: 'applied_filter', filter: 'Κατασκευαστής', value: brand };
      }
      case 'clear_listing_filters':
        state.brand = null;
        changed();
        return { ok: true, action: 'cleared_listing_filters' };
      case 'get_listing_sort_options':
        return { ok: true, source: 'BestPrice listing sorting', sorting: ['Δημοφιλέστερα', 'Φθηνότερα'].map(value => ({ name: value, selected: value === state.sort })) };
      case 'apply_listing_sort': {
        bad = unexpected(args, ['sort']);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        const sort = ['Δημοφιλέστερα', 'Φθηνότερα'].find(value => normalize(value) === normalize(args.sort));
        if (!sort) return { ok: false, error: `The sorting option '${clean(args.sort)}' was not found.` };
        state.sort = sort;
        changed();
        return { ok: true, action: 'applied_sorting', sort };
      }
      case 'get_page_product': {
        bad = unexpected(args, []);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        const product = activeProduct();
        const { offers, history, specifications, brand, merchant_count, ...facts } = product;
        return { ok: true, source: 'BestPrice item page', ...facts, category: 'Κινητά τηλέφωνα', offer_count: merchant_count, bestprice_url: `https://www.bestprice.gr/item/${product.product_id}/product.html?bpref=mcp` };
      }
      case 'compare_page_offers': {
        bad = unexpected(args, ['limit']);
        const limit = args.limit ?? 4;
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        if (!Number.isInteger(limit) || limit < 1 || limit > 4) return { ok: false, error: 'limit must be a whole number from 1 to 4.' };
        const product = activeProduct();
        return { ok: true, source: 'BestPrice item page', product_id: product.product_id, compared: Math.min(limit, product.offers.length), offers: product.offers.slice(0, limit), note: 'Unknown shipping remains unknown. The shopper chooses the merchant.' };
      }
      case 'get_product_specifications': {
        bad = unexpected(args, ['section', 'limit']);
        const limit = args.limit ?? 12;
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        if (!Number.isInteger(limit) || limit < 1 || limit > 16) return { ok: false, error: 'limit must be a whole number from 1 to 16.' };
        const product = activeProduct();
        const section = normalize(args.section ?? 'all');
        const rows = product.specifications.filter(row => section === 'all' || normalize(row.section).includes(section)).slice(0, limit);
        return rows.length ? { ok: true, source: 'BestPrice product specifications', product_id: product.product_id, returned: rows.length, specifications: rows } : { ok: false, error: `No specifications matched '${clean(args.section)}'.` };
      }
      case 'summarize_price_history': {
        bad = unexpected(args, []);
        if (bad) return { ok: false, error: `Unexpected argument: ${bad}.` };
        const product = activeProduct();
        const first = product.history[0];
        const current = product.current_min_price_eur;
        const change = Math.round(((current - first) / first) * 1000) / 10;
        return { ok: true, source: 'BestPrice price history', product_id: product.product_id, observations: product.history.length, current_min_price_eur: current, historical_low_eur: Math.min(...product.history), historical_high_eur: Math.max(...product.history), change_from_first_pct: change, direction_from_first: change < -1 ? 'down' : change > 1 ? 'up' : 'stable' };
      }
      case 'show_price_history':
        state.historyVisible = true;
        changed();
        return { ok: true, action: 'opened_price_history', product_id: activeProduct().product_id };
      default:
        return { ok: false, error: `Unknown tool: ${clean(name)}.` };
    }
  };

  return { execute, setPage, snapshot };
}
