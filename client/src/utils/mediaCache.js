/**
 * WhatsApp-Style High-Performance Media Cache Engine
 * 
 * Solves:
 * Videos and media in Complaint Drawer re-downloading from network every single time they are viewed.
 * 
 * How it works (identical to WhatsApp Web architecture):
 * 1. Multi-Tier Cache:
 *    - Tier 1: In-Memory Blob URL Map (0ms instant playback across views in current session)
 *    - Tier 2: Persistent CacheStorage API ('egs-media-cache-v1', persistent disk cache across page reloads)
 *    - Tier 3: Resilient Network Fetch with auto-conversion to Blob URL
 * 2. Background Pre-warming:
 *    - When a complaint details drawer is opened, all attachment videos and photos
 *      are pre-fetched silently in the background via requestIdleCallback.
 *    - When the user clicks preview, the media is ALREADY in cache and plays INSTANTLY (0ms).
 */

const inMemoryMediaMap = new Map(); // rawUrl -> blobUrl
const inProgressFetches = new Map(); // rawUrl -> Promise<string>
const CACHE_NAME = 'egs-media-cache-v1';

/**
 * Synchronous in-memory lookup (0ms instant return)
 * @param {string} url 
 * @returns {string|null}
 */
export function getInMemoryMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  return inMemoryMediaMap.get(url) || null;
}

/**
 * Check if media URL is already cached either in RAM or CacheStorage
 * @param {string} url 
 * @returns {Promise<boolean>}
 */
export async function isMediaCached(url) {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return true;
  if (inMemoryMediaMap.has(url)) return true;

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      return Boolean(match);
    }
  } catch (_) {}
  return false;
}

/**
 * Get or fetch media URL into cache and return a local Blob URL for instant 0ms playback
 * @param {string} url - Remote media URL
 * @param {Function} [onProgress] - Optional download progress callback ({ percent, loaded, total })
 * @returns {Promise<string>} Local Blob URL or fallback URL
 */
export async function getOrCacheMediaUrl(url, onProgress = null) {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  // 1. In-Memory RAM Cache Hit (Instant 0ms)
  const cachedBlob = inMemoryMediaMap.get(url);
  if (cachedBlob) {
    if (onProgress) onProgress({ percent: 100, loaded: 1, total: 1, fromCache: true });
    return cachedBlob;
  }

  // 2. Return ongoing in-flight fetch promise if already being fetched
  if (inProgressFetches.has(url)) {
    return inProgressFetches.get(url);
  }

  const fetchPromise = (async () => {
    // 3. Persistent CacheStorage Hit (Local disk cache)
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cache = await caches.open(CACHE_NAME);
        const match = await cache.match(url);
        if (match) {
          const blob = await match.blob();
          const blobUrl = URL.createObjectURL(blob);
          inMemoryMediaMap.set(url, blobUrl);
          if (onProgress) onProgress({ percent: 100, loaded: blob.size, total: blob.size, fromCache: true });
          return blobUrl;
        }
      }
    } catch (e) {
      console.warn('[MediaCache] CacheStorage match error:', e);
    }

    // 4. Network Fetch & Store in CacheStorage
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'same-origin',
        cache: 'force-cache'
      });

      if (!response.ok) {
        throw new Error(`Media fetch returned status ${response.status}`);
      }

      // Clone response immediately for CacheStorage
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await caches.open(CACHE_NAME);
          cache.put(url, response.clone()).catch(err => {
            console.warn('[MediaCache] CacheStorage put error:', err);
          });
        } catch (_) {}
      }

      // Read complete binary into Blob
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      inMemoryMediaMap.set(url, blobUrl);
      if (onProgress) onProgress({ percent: 100, loaded: blob.size, total: blob.size, fromCache: false });
      return blobUrl;
    } catch (err) {
      console.warn('[MediaCache] Network fetch error, using raw URL as fallback:', err.message);
      return url;
    } finally {
      inProgressFetches.delete(url);
    }
  })();

  inProgressFetches.set(url, fetchPromise);
  return fetchPromise;
}

/**
 * Preload a media URL silently in the background
 * @param {string} url 
 */
export function preloadMediaUrl(url) {
  if (!url || inMemoryMediaMap.has(url) || inProgressFetches.has(url)) return;
  getOrCacheMediaUrl(url).catch(() => {});
}

/**
 * Proactively preload and warm all media attachments for a complaint ticket
 * (Videos, photos, closing proofs) so clicking on them opens INSTANTLY in 0ms!
 * 
 * @param {Array} attachments - Array of attachment objects
 * @param {Object} [closingProof] - Optional closing proof object
 */
export function preloadComplaintAttachments(attachments = [], closingProof = null) {
  if (typeof window === 'undefined') return;

  const urlsToPreload = [];

  if (Array.isArray(attachments)) {
    attachments.forEach(att => {
      const rawUrl = att.file_url || att.file_data || '';
      let url = '';
      if (rawUrl.startsWith('http') || rawUrl.startsWith('data:') || rawUrl.startsWith('/api')) {
        url = rawUrl;
      } else if (rawUrl.includes('complaints/')) {
        url = `/api/attachments/r2/${rawUrl.replace(/^\/+/, '')}`;
      } else if (rawUrl) {
        url = `/api/attachments/r2/${rawUrl.replace(/^\/+/, '')}`;
      } else if (att.id) {
        url = `/api/attachments/${att.id}`;
      }

      if (url && !url.startsWith('data:')) {
        // High priority for videos since they are heavier
        const isVideo = att.file_type?.startsWith('video/') || url.match(/\.(mp4|webm|mov|3gp|mkv)($|\?)/i);
        if (isVideo) {
          urlsToPreload.unshift(url);
        } else {
          urlsToPreload.push(url);
        }
      }
    });
  }

  if (closingProof) {
    const cpUrl = closingProof.file_url || closingProof.url || '';
    if (cpUrl && !cpUrl.startsWith('data:')) {
      urlsToPreload.unshift(cpUrl);
    }
  }

  if (urlsToPreload.length === 0) return;

  // Run in background idle time with 2.5s fallback so UI thread is never interrupted
  const runPreload = () => {
    urlsToPreload.forEach(u => preloadMediaUrl(u));
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runPreload, { timeout: 2500 });
  } else {
    setTimeout(runPreload, 300);
  }
}
