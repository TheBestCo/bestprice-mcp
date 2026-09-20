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

/** Prefer a safe grouped-product link, never the first item-looking redirect target. */
export function selectBrowsingProductUrl(values) {
  if (!Array.isArray(values)) return null;
  for (const value of values.slice(0, 64)) {
    if (typeof value !== 'string' || value.length > 2048) continue;
    try {
      const url = new URL(value);
      if (url.pathname.startsWith('/item/') && isAllowedBrowsingPage(url)) return url.href;
    } catch {
      // Invalid or unsafe candidates are not navigation instructions.
    }
  }
  return null;
}
