/**
 * Offline & Resumable Upload Queue backed by IndexedDB
 * Handles network drops, browser refresh, and storage quota errors safely.
 */

const DB_NAME = 'egs_upload_cache_v1';
const DB_VERSION = 1;
const STORE_UPLOADS = 'pending_uploads';

function openUploadDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
        const store = db.createObjectStore(STORE_UPLOADS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save or update an upload session in IndexedDB
 * 
 * @param {Object} uploadItem
 * @param {string} uploadItem.id - Unique ID (e.g. storage_key or uuid)
 * @param {Blob|File} uploadItem.blob - File binary
 * @param {string} uploadItem.name - Filename
 * @param {number} uploadItem.size - Total bytes
 * @param {string} uploadItem.mimeType - Mime type
 * @param {string} [uploadItem.uploadId] - Multipart uploadId
 * @param {string} [uploadItem.storageKey] - R2 storage key
 * @param {Array<{partNumber: number, etag: string}>} [uploadItem.completedParts] - Already uploaded parts
 * @param {string} uploadItem.status - 'pending' | 'uploading' | 'completed' | 'failed'
 * @param {string} [uploadItem.identifier] - Ticket ID
 * @param {string} [uploadItem.uploadType] - 'complaint' | 'whatsapp'
 */
export async function saveUploadSession(uploadItem) {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_UPLOADS, 'readwrite');
      const store = tx.objectStore(STORE_UPLOADS);
      const record = {
        ...uploadItem,
        updatedAt: Date.now(),
        createdAt: uploadItem.createdAt || Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (err) => {
        if (err.target?.error?.name === 'QuotaExceededError') {
          console.warn('[UploadQueue] Storage quota exceeded when saving offline session.');
        }
        reject(err.target?.error || err);
      };
    });
  } catch (err) {
    console.warn('[UploadQueue] Could not save upload session to IndexedDB:', err.message);
    return null;
  }
}

/**
 * Retrieve an upload session by ID
 */
export async function getUploadSession(id) {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_UPLOADS, 'readonly');
      const store = tx.objectStore(STORE_UPLOADS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return null;
  }
}

/**
 * List all pending or failed upload sessions
 */
export async function getPendingUploadSessions() {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_UPLOADS, 'readonly');
      const store = tx.objectStore(STORE_UPLOADS);
      const req = store.getAll();
      req.onsuccess = () => {
        const records = req.result || [];
        resolve(records.filter(r => r.status !== 'completed'));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return [];
  }
}

/**
 * Remove an upload session after successful completion or abort
 */
export async function removeUploadSession(id) {
  try {
    const db = await openUploadDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_UPLOADS, 'readwrite');
      const store = tx.objectStore(STORE_UPLOADS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return false;
  }
}
