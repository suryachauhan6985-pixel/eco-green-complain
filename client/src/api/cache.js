/**
 * High-Performance Safe In-Memory API Cache & Request Deduplication Engine
 * 
 * Provides:
 * 1. In-flight request deduplication (prevents redundant concurrent HTTP calls).
 * 2. Configurable resource-specific TTL caching for stable reference data.
 * 3. Strict exclusion of financial, settlement, WhatsApp, and auth-critical endpoints.
 * 4. Automatic cache invalidation upon mutations and user logout.
 */

// Bounded in-memory storage (Max 250 items with LRU eviction)
const MAX_CACHE_ENTRIES = 250;
const cacheStore = new Map();
const inFlightRequests = new Map();

// Endpoint-specific TTL configuration (in milliseconds)
const RESOURCE_TTLS = [
  // Relatively stable reference configurations (5 minutes)
  { pattern: /^\/templates/, ttl: 5 * 60 * 1000, tag: 'templates' },
  { pattern: /^\/settings/, ttl: 5 * 60 * 1000, tag: 'settings' },
  { pattern: /^\/products/, ttl: 5 * 60 * 1000, tag: 'products' },
  
  // Users metadata (60 seconds)
  { pattern: /^\/auth\/users$/, ttl: 60 * 1000, tag: 'users' },
  
  // Customer search directory (30 seconds)
  { pattern: /^\/customers\/search/, ttl: 30 * 1000, tag: 'customers' },

  // Operational complaints list: short-lived (5 seconds) to prevent spamming on rapid tab switches
  { pattern: /^\/complaints\?/, ttl: 5 * 1000, tag: 'complaints' },
  { pattern: /^\/complaints$/, ttl: 5 * 1000, tag: 'complaints' },
];

// STRICT NEVER-CACHE BLACKLIST (Must always query live production state)
const NEVER_CACHE_PATTERNS = [
  /\/technicians/,
  /\/complaint-payments/,
  /\/payments/,
  /\/tour-expenses/,
  /\/settle/,
  /\/settlement/,
  /\/vouchers?/,
  /\/ledger/,
  /\/wallet/,
  /\/balance/,
  /\/whatsapp/,
  /\/messages/,
  /\/conversations/,
  /\/auth\/login/,
  /\/auth\/logout/,
  /\/auth\/me/,
  /\/meta-status/,
  /\/upload/,
  /\/attachments/
];

/**
 * Determine if endpoint is eligible for caching
 */
export function getEndpointCacheConfig(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') return null;
  if (options.skipCache || options.noCache) return null;

  // Never cache blacklisted endpoints
  for (const pattern of NEVER_CACHE_PATTERNS) {
    if (pattern.test(endpoint)) return null;
  }

  // Match against configured TTLs
  for (const config of RESOURCE_TTLS) {
    if (config.pattern.test(endpoint)) {
      return config;
    }
  }

  return null;
}

/**
 * Build isolated cache key namespaced by auth context
 */
export function buildCacheKey(endpoint, userContextId = 'anon') {
  return `${userContextId}::${endpoint}`;
}

/**
 * Get cached response if still within TTL
 */
export function getCachedResponse(cacheKey) {
  const entry = cacheStore.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expiresAt) {
    cacheStore.delete(cacheKey);
    return null;
  }

  return entry.data;
}

/**
 * Store response in cache with TTL and bounded eviction
 */
export function setCachedResponse(cacheKey, data, ttl, tag) {
  if (!data || ttl <= 0) return;

  // Enforce bounded cache size (LRU-like eviction of oldest key)
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    if (oldestKey) cacheStore.delete(oldestKey);
  }

  cacheStore.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttl,
    tag
  });
}

/**
 * Deduplicate simultaneous in-flight GET requests
 */
export function getInFlightRequest(cacheKey) {
  return inFlightRequests.get(cacheKey) || null;
}

export function setInFlightRequest(cacheKey, promise) {
  inFlightRequests.set(cacheKey, promise);
  promise.finally(() => {
    inFlightRequests.delete(cacheKey);
  });
}

/**
 * Invalidate cached items matching a tag or pattern (e.g. after mutations)
 */
export function invalidateCacheByTag(tag) {
  if (!tag) return;
  for (const [key, entry] of cacheStore.entries()) {
    if (entry.tag === tag || key.includes(tag)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Invalidate on specific mutation operations
 */
export function invalidateOnMutation(endpoint) {
  if (endpoint.includes('/complaint')) {
    invalidateCacheByTag('complaints');
  }
  if (endpoint.includes('/technician') || endpoint.includes('/assign')) {
    invalidateCacheByTag('technicians');
    invalidateCacheByTag('complaints');
  }
  if (endpoint.includes('/customer')) {
    invalidateCacheByTag('customers');
  }
  if (endpoint.includes('/template')) {
    invalidateCacheByTag('templates');
  }
  if (endpoint.includes('/setting')) {
    invalidateCacheByTag('settings');
  }
}

/**
 * Clear entire in-memory cache on user logout or session switch
 */
export function clearApiCache() {
  cacheStore.clear();
  inFlightRequests.clear();
}
