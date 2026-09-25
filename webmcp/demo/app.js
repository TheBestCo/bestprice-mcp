import { createTools } from '../src/contracts.js';
import {
  BRAND_FILTER,
  createDemoAdapter,
  HOME_SECTION,
  offerRef,
  SORT_OPTIONS,
} from '../src/demo-adapter.js';
import { createLocalModelContext, createRegistration } from '../src/runtime.js';

const shop = document.querySelector('#shop-content');
const result = document.querySelector('#tool-result');
const toolList = document.querySelector('#tool-list');
const status = document.querySelector('#runtime-status');
const mode = document.querySelector('#runtime-mode');
const nativeContext = document.modelContext;
const localContext = createLocalModelContext();
const modelContext = typeof nativeContext?.registerTool === 'function' ? nativeContext : localContext;
let currentTools = [];
let refreshQueued = false;

/** Safe sample arguments for the "Run" buttons in the inspector. */
const samples = snapshot => ({
  search_bestprice: { query: 'phone', limit: 3 },
  open_search_results: { query: 'phone', max_price_eur: 800 },
  get_visible_products: { limit: 3 },
  load_more_products: {},
  open_product: { product_id: snapshot.homeProducts[1]?.product_id ?? '0' },
  get_listing_filters: {},
  apply_listing_filter: { filter: BRAND_FILTER, value: 'Samsung' },
  clear_listing_filters: {},
  apply_listing_sort: { sort: SORT_OPTIONS[1] },
  get_page_product: {},
  compare_page_offers: { limit: 3 },
  get_product_specifications: { section: 'all', limit: 6 },
  summarize_price_history: { show_chart: true },
  show_offer: { offer_ref: offerRef(snapshot.product.product_id, 0) },
  get_shopping_decision: { message: 'κινητό έως 750€ με 5G', postal_code: '10431' },
});

const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/gu,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const money = value => new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(value);
const showResult = payload => {
  result.textContent = JSON.stringify(payload, null, 2);
};
const runTool = async (name, args) => {
  const tool = currentTools.find(candidate => candidate.name === name);
  if (!tool) return showResult({ ok: false, error: `${name} is not available on this page.` });
  showResult(await tool.execute(args));
};

const productRows = products =>
  products
    .map(
      product => `
        <article class="product-row">
          <div>
            <h3>${escapeHtml(product.title)}</h3>
            <p>${product.merchant_count} stores · rating ${product.rating}/5</p>
          </div>
          <div>
            <div class="price">from ${money(product.current_min_price_eur)}</div>
            <button class="primary" data-product="${escapeHtml(product.product_id)}">Open</button>
          </div>
        </article>`,
    )
    .join('');
const bindOpenButtons = () => {
  for (const button of shop.querySelectorAll('[data-product]')) {
    button.addEventListener('click', () =>
      adapter.execute('open_product', { product_id: button.dataset.product }),
    );
  }
};

/* Contract 1.8: the home page shows a section of products, which the agent can read and open too. */
const renderHome = snapshot => {
  shop.innerHTML = `
    <div class="hero">
      <p>Search and compare before you choose a shop.</p>
      <h2>Prices that make sense, with your agent beside you.</h2>
      <form class="searchbox">
        <input name="query" value="phone" aria-label="Search products">
        <button class="primary">Search</button>
      </form>
    </div>
    <div class="listing-head">
      <div>
        <p class="eyebrow">Fixture home section</p>
        <h2>${escapeHtml(HOME_SECTION)}</h2>
      </div>
    </div>
    <div class="products">${productRows(snapshot.homeProducts)}</div>`;
  shop.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    /* Contract 2.1: the search that shows its results in this tab. */
    runTool('open_search_results', { query: new FormData(event.currentTarget).get('query') });
  });
  bindOpenButtons();
};

const renderListing = snapshot => {
  const brands = ['Apple', 'Samsung', 'Google'];
  const chips = brands
    .map(
      brand =>
        `<button class="chip ${snapshot.brand === brand ? 'active' : ''}" data-brand="${escapeHtml(brand)}">${escapeHtml(brand)}</button>`,
    )
    .join('');
  const rows = productRows(snapshot.products);
  shop.innerHTML = `
    <div class="listing-head">
      <div>
        <p class="eyebrow">Fixture listing</p>
        <h2>${escapeHtml(snapshot.query || 'Phones')}</h2>
      </div>
      <strong>${snapshot.products.length} products</strong>
    </div>
    <div class="chips">${chips}<button class="chip" data-sort>Sort: ${escapeHtml(snapshot.sort)}</button></div>
    <div class="products">${rows || '<p>No fixture products match this filter.</p>'}</div>`;

  for (const button of shop.querySelectorAll('[data-brand]')) {
    button.addEventListener('click', () =>
      adapter.execute('apply_listing_filter', { filter: BRAND_FILTER, value: button.dataset.brand }),
    );
  }
  const [popular, cheapest] = SORT_OPTIONS;
  shop
    .querySelector('[data-sort]')
    .addEventListener('click', () =>
      adapter.execute('apply_listing_sort', { sort: snapshot.sort === cheapest ? popular : cheapest }),
    );
  bindOpenButtons();
};

const renderProduct = snapshot => {
  const product = snapshot.product;
  const history = snapshot.historyVisible
    ? `<div class="history"><strong>Price history</strong><p>${product.history.map(money).join(' → ')}</p></div>`
    : '';
  shop.innerHTML = `
    <article class="product">
      <p class="eyebrow">Fixture item page</p>
      <h2>${escapeHtml(product.title)}</h2>
      <p class="product__meta">${product.merchant_count} stores · ${product.rating}/5 from ${product.rating_count} ratings</p>
      <div class="facts">
        <div class="fact"><span>Current minimum</span><strong>${money(product.current_min_price_eur)}</strong></div>
        <div class="fact"><span>Compared offers</span><strong>${product.offers.length}</strong></div>
        <div class="fact"><span>Brand</span><strong>${escapeHtml(product.brand)}</strong></div>
      </div>
      ${history}
    </article>`;
};

/* Contract 1.9: any other public page — here a buying guide — registers the site-wide tools. */
const renderSite = () => {
  shop.innerHTML = `
    <article class="product">
      <p class="eyebrow">Fixture article page</p>
      <h2>Πώς να διαλέξεις κινητό το 2026</h2>
      <p class="product__meta">A buying guide. The agent can search BestPrice, read any product's details, or ask the Shopping Brain from here.</p>
    </article>`;
};

const renderShop = snapshot => {
  for (const button of document.querySelectorAll('[data-view]')) {
    button.toggleAttribute('aria-current', button.dataset.view === snapshot.page);
  }
  if (snapshot.page === 'home') renderHome(snapshot);
  else if (snapshot.page === 'listing') renderListing(snapshot);
  else if (snapshot.page === 'site') renderSite();
  else renderProduct(snapshot);
};

const renderTools = snapshot => {
  const toolSamples = samples(snapshot);
  toolList.innerHTML = currentTools
    .map(
      tool => `
        <div class="tool">
          <div><code>${escapeHtml(tool.name)}</code><small>${escapeHtml(tool.title)}</small></div>
          <button type="button" data-tool="${escapeHtml(tool.name)}">Run</button>
        </div>`,
    )
    .join('');
  for (const button of toolList.querySelectorAll('[data-tool]')) {
    const name = button.dataset.tool;
    button.addEventListener('click', () => runTool(name, toolSamples[name]));
  }
};

const registration = createRegistration({
  modelContext,
  onState: state => {
    status.textContent = state.status === 'ready' ? `${state.registered} tools ready` : state.status;
    status.dataset.state = state.status;
  },
});

const refresh = async () => {
  refreshQueued = false;
  const snapshot = adapter.snapshot();
  renderShop(snapshot);
  currentTools = createTools({ page: snapshot.page, execute: adapter.execute });
  await registration.register(currentTools);
  renderTools(adapter.snapshot());
};

const scheduleRefresh = () => {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(refresh);
};

const adapter = createDemoAdapter(scheduleRefresh);
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => adapter.setPage(button.dataset.view));
}
mode.textContent = nativeContext ? 'Native WebMCP' : 'Local inspector';
await refresh();
