/** Browsing-only document destinations; physical item IDs can create merchant referrals. */
export function isAllowedBrowsingPage(url) {
  if (url.origin !== 'https://www.bestprice.gr' || url.username || url.password) return false;
  if (url.pathname.startsWith('/item/')) {
    const id = /^\/item\/(\d{10})\//u.exec(url.pathname)?.[1];
    return Boolean(id && Number(id) >= 2147483648 && Number(id) <= 4294967295 && !url.search && !url.hash);
  }
  return /^\/(?:$|search(?:\/|$)|cat\/|hub\/)/u.test(url.pathname);
}

/** One explicit read-only POST, not a general exception for same-origin requests. */
export function allowSpecificationsRead(request, resourceType, permit, now) {
  if (
    !permit ||
    permit.used ||
    permit.tool !== 'get_product_specifications' ||
    !Number.isFinite(now) ||
    !Number.isFinite(permit.expiresAt) ||
    now >= permit.expiresAt ||
    request.method !== 'POST' ||
    !['Fetch', 'XHR'].includes(resourceType)
  )
    return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  const id = /^\/item\/(\d{10})\//u.exec(url.pathname)?.[1];
  if (
    url.href !== permit.url ||
    url.origin !== 'https://www.bestprice.gr' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !id ||
    Number(id) < 2147483648 ||
    Number(id) > 4294967295
  )
    return false;
  const contentTypes = Object.entries(request.headers ?? {}).filter(
    ([name]) => name.toLowerCase() === 'content-type',
  );
  if (contentTypes.length !== 1) return false;
  const boundary = /^multipart\/form-data;\s*boundary=([A-Za-z0-9-]{1,80})$/u.exec(contentTypes[0][1])?.[1];
  if (!boundary || typeof request.postData !== 'string' || Buffer.byteLength(request.postData) > 512)
    return false;
  // Chrome's native FormData serialization of the single source-confirmed selector.
  // Exact bytes refuse additional fields, duplicate selectors, files and alternate actions.
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="specs"\r\n\r\njson\r\n--${boundary}--`;
  if (request.postData !== body && request.postData !== `${body}\r\n`) return false;
  permit.used = true;
  return true;
}

/** Classify selection failures without retaining URLs, query strings or arbitrary error text. */
export function inspectBrowsingProductLinks(values) {
  const diagnostics = { examined: 0, inputLimited: false, rejected: {}, approved: 0 };
  let selected = null;
  if (!Array.isArray(values)) return { selected, diagnostics };
  diagnostics.inputLimited = values.length > 64;
  for (const value of values.slice(0, 64)) {
    diagnostics.examined += 1;
    let reason = null;
    if (typeof value !== 'string') reason = 'non_string';
    else if (value.length > 2048) reason = 'too_long';
    else {
      try {
        const url = new URL(value);
        if (url.origin !== 'https://www.bestprice.gr') reason = 'different_origin';
        else if (url.username || url.password) reason = 'credentials';
        else if (!url.pathname.startsWith('/item/')) reason = 'non_product_path';
        else if (url.search || url.hash) reason = 'query_or_fragment';
        else if (!isAllowedBrowsingPage(url)) reason = 'non_grouped_product_path';
        else {
          diagnostics.approved += 1;
          selected ??= url.href;
        }
      } catch {
        reason = 'invalid_url';
      }
    }
    if (reason) diagnostics.rejected[reason] = (diagnostics.rejected[reason] ?? 0) + 1;
  }
  return { selected, diagnostics };
}

/** Prefer a safe grouped-product link, never the first item-looking redirect target. */
export function selectBrowsingProductUrl(values) {
  return inspectBrowsingProductLinks(values).selected;
}

/** Resolve only a native read's ID-matched grouped product, never a merchant/listing click URL.
 * The inspected storefront productUrl helper emits exactly ?bpref=mcp; removing that fixed
 * attribution tag for a measurement-suppressed diagnostic is not permission to strip other data.
 * All actual navigation still passes the unchanged no-query browsing guard above. */
export function selectVisibleProductReadTarget(products) {
  if (!Array.isArray(products) || products.length > 8) return null;
  const ids = new Set();
  for (const product of products) {
    if (typeof product?.product_id !== 'string' || ids.has(product.product_id)) return null;
    ids.add(product.product_id);
  }
  for (const product of products) {
    const id = product.product_id;
    const value = product.bestprice_url;
    if (!/^\d{10}$/u.test(id) || typeof value !== 'string' || value.length > 2048) continue;
    try {
      const url = new URL(value);
      if (/^\/item\/(\d{10})\//u.exec(url.pathname)?.[1] !== id) continue;
      if (url.search !== '' && url.search !== '?bpref=mcp') continue;
      url.search = '';
      if (!isAllowedBrowsingPage(url)) continue;
      return { productId: id, url: url.href };
    } catch {
      // Untrusted output cannot authorize a repaired URL or a different product.
    }
  }
  return null;
}
