/**
 * URL State Synchronization Utility
 * Keeps browser URL search parameters and routes seamlessly synchronized with app state,
 * sub-sections, active tabs, modals, and filters so that refreshing (F5), bookmarking,
 * and browser back/forward navigation retains the exact active workspace.
 */

export function getUrlParams() {
  try {
    return new URLSearchParams(window.location.search);
  } catch (_) {
    return new URLSearchParams();
  }
}

export function getUrlParam(key) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  } catch (_) {
    return null;
  }
}

export function updateUrlParams(updates, replace = true) {
  try {
    const url = new URL(window.location.href);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(val));
      }
    });

    const newUrl = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '');
    if (replace) {
      window.history.replaceState(null, '', newUrl);
    } else {
      window.history.pushState(null, '', newUrl);
    }
  } catch (_) {}
}

export function navigateWithParams(path, params = {}, replace = false) {
  try {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== null && val !== undefined && val !== '') {
        searchParams.set(key, String(val));
      }
    });
    const searchStr = searchParams.toString();
    const targetUrl = `${path}${searchStr ? `?${searchStr}` : ''}`;
    if (replace) {
      window.history.replaceState(null, '', targetUrl);
    } else {
      window.history.pushState(null, '', targetUrl);
    }
  } catch (_) {}
}
